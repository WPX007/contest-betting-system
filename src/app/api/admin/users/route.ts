import { NextResponse } from "next/server";
import { z } from "zod";
import { AssetType, LedgerReason, UserRole } from "@/generated/prisma/enums";
import { hashPassword } from "@/lib/auth/password";
import { authErrorResponse, requireAdmin, revokeUserSessions } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const createUserSchema = z.object({
  name: z.string().trim().min(1),
  username: z.string().trim().min(1),
  teamId: z.string().nullable().optional(),
  initialCoins: z.number().int().min(0),
});

export async function GET() {
  try {
    await requireAdmin();
    const [users, teams] = await Promise.all([
      prisma.user.findMany({
        include: { team: true, wallets: true, _count: { select: { bets: true, parlayEntries: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.team.findMany({ orderBy: [{ track: "asc" }, { name: "asc" }] }),
    ]);
    return NextResponse.json({
      data: {
        users: users.map((user) => ({
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role,
          team: user.team,
          balance: user.wallets.find((wallet) => wallet.asset === AssetType.BET_COIN)?.balance ?? 0,
          points: user.wallets.find((wallet) => wallet.asset === AssetType.POINT)?.balance ?? 0,
          orderCount: user._count.bets + user._count.parlayEntries,
        })),
        teams,
      },
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取用户失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const input = createUserSchema.parse(await request.json());
    if (input.username.toLowerCase() === "admin") {
      return NextResponse.json({ error: "该账号名不可使用" }, { status: 409 });
    }
    const existing = await prisma.user.findFirst({
      where: { OR: [{ username: input.username }, { name: input.name }] },
    });
    if (existing) return NextResponse.json({ error: "中文名或英文账号已存在" }, { status: 409 });
    const passwordHash = await hashPassword("000000");
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: input.name,
          username: input.username,
          passwordHash,
          role: UserRole.VIEWER,
          teamId: input.teamId || null,
        },
      });
      const coinWallet = await tx.wallet.create({
        data: { userId: created.id, asset: AssetType.BET_COIN, balance: input.initialCoins },
      });
      await tx.wallet.create({ data: { userId: created.id, asset: AssetType.POINT, balance: 0 } });
      if (input.initialCoins > 0) {
        await tx.ledgerEntry.create({
          data: {
            walletId: coinWallet.id,
            amount: input.initialCoins,
            balanceAfter: input.initialCoins,
            reason: LedgerReason.INITIAL_GRANT,
            reference: `admin:${admin.id}:create-user:${created.id}`,
            note: "管理员创建账号并发放初始竞猜币",
          },
        });
      }
      await tx.auditLog.create({
        data: { actorId: admin.id, action: "USER_CREATE", target: created.id, after: JSON.stringify({ username: created.username, initialCoins: input.initialCoins }) },
      });
      return created;
    });
    return NextResponse.json({ data: user, meta: { initialPassword: "000000" } }, { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "用户资料不完整" }, { status: 400 });
    return NextResponse.json({ error: "创建用户失败" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const input = z.object({ userId: z.string().min(1), action: z.literal("RESET_PASSWORD") }).parse(await request.json());
    await prisma.user.update({
      where: { id: input.userId },
      data: { passwordHash: await hashPassword("000000"), passwordChangedAt: new Date() },
    });
    await revokeUserSessions(input.userId);
    await prisma.auditLog.create({
      data: { actorId: admin.id, action: "PASSWORD_RESET", target: input.userId, after: JSON.stringify({ resetToInitialPassword: true }) },
    });
    return NextResponse.json({ data: { reset: true, initialPassword: "000000" } });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "重置密码失败" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin();
    const userId = new URL(request.url).searchParams.get("id");
    if (!userId) return NextResponse.json({ error: "缺少用户 ID" }, { status: 400 });
    if (userId === admin.id) return NextResponse.json({ error: "不能删除当前管理员账号" }, { status: 400 });
    const target = await prisma.user.findUnique({
      where: { id: userId },
      include: { _count: { select: { bets: true, parlayEntries: true } } },
    });
    if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    if (target._count.bets + target._count.parlayEntries > 0) {
      return NextResponse.json({ error: "该用户已有竞猜订单，不能删除；可重置密码后停用使用" }, { status: 409 });
    }
    await prisma.$transaction(async (tx) => {
      const wallets = await tx.wallet.findMany({ where: { userId } });
      await tx.ledgerEntry.deleteMany({ where: { walletId: { in: wallets.map((wallet) => wallet.id) } } });
      await tx.session.deleteMany({ where: { userId } });
      await tx.wallet.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
      await tx.auditLog.create({
        data: { actorId: admin.id, action: "USER_DELETE", target: userId, before: JSON.stringify({ username: target.username }) },
      });
    });
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "删除用户失败" }, { status: 500 });
  }
}
