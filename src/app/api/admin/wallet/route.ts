import { NextResponse } from "next/server";
import { z } from "zod";
import { AssetType, LedgerReason } from "@/generated/prisma/enums";
import { authErrorResponse, requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const adjustmentSchema = z.object({
  targetType: z.enum(["USER", "TEAM"]),
  target: z.string().min(1),
  action: z.enum(["GRANT", "DEDUCT"]),
  amount: z.number().int().positive(),
  reason: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const input = adjustmentSchema.parse(await request.json());
    const users = input.targetType === "USER"
      ? await prisma.user.findMany({ where: { id: input.target } })
      : await prisma.user.findMany({ where: { teamId: input.target } });
    if (users.length === 0) return NextResponse.json({ error: "未找到调整目标" }, { status: 404 });
    const delta = input.action === "GRANT" ? input.amount : -input.amount;
    await prisma.$transaction(async (tx) => {
      for (const user of users) {
        const wallet = await tx.wallet.findUniqueOrThrow({
          where: { userId_asset: { userId: user.id, asset: AssetType.BET_COIN } },
        });
        if (wallet.balance + delta < 0) throw new Error(`${user.name} 的余额不足以扣除`);
        const balanceAfter = wallet.balance + delta;
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: balanceAfter, version: { increment: 1 } },
        });
        await tx.ledgerEntry.create({
          data: {
            walletId: wallet.id,
            amount: delta,
            balanceAfter,
            reason: LedgerReason.CORRECTION,
            reference: `admin:${admin.id}:${Date.now()}`,
            note: input.reason,
          },
        });
      }
      await tx.auditLog.create({
        data: { actorId: admin.id, action: "WALLET_ADJUST", target: `${input.targetType}:${input.target}`, after: JSON.stringify(input) },
      });
    });
    return NextResponse.json({ data: { adjustedUsers: users.length, amountEach: delta } });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "竞猜币调整失败" }, { status: 400 });
  }
}
