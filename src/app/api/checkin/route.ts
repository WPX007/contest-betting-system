import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { AssetType, LedgerReason, UserRole } from "@/generated/prisma/enums";
import { authErrorResponse, requireUser } from "@/lib/auth/session";
import { dailyCheckinDay } from "@/lib/daily-checkin";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireUser();
    const { dayKey, eligible } = dailyCheckinDay();
    const [config, checkin] = await Promise.all([
      prisma.parlayConfig.findUniqueOrThrow({ where: { id: "default" } }),
      prisma.dailyCheckin.findUnique({ where: { userId_dayKey: { userId: user.id, dayKey } } }),
    ]);
    return NextResponse.json({
      data: {
        dayKey,
        eligible,
        claimed: Boolean(checkin),
        reward: config.dailyCheckinReward,
      },
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取签到状态失败" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const user = await requireUser();
    if (user.role === UserRole.OPS_ADMIN || user.role === UserRole.SUPER_ADMIN) {
      return NextResponse.json({ error: "管理员账号不参与每日签到" }, { status: 403 });
    }
    const { dayKey, eligible } = dailyCheckinDay();
    if (!eligible) return NextResponse.json({ error: "每日签到仅在周一至周五开放" }, { status: 400 });

    const result = await prisma.$transaction(async (tx) => {
      const config = await tx.parlayConfig.findUniqueOrThrow({ where: { id: "default" } });
      const checkin = await tx.dailyCheckin.create({
        data: { userId: user.id, dayKey, amount: config.dailyCheckinReward },
      });
      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { userId_asset: { userId: user.id, asset: AssetType.BET_COIN } },
      });
      const balanceAfter = wallet.balance + checkin.amount;
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter, version: { increment: 1 } },
      });
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          amount: checkin.amount,
          balanceAfter,
          reason: LedgerReason.DAILY_CHECKIN,
          reference: `daily-checkin:${user.id}:${dayKey}`,
          note: `${dayKey} 工作日签到奖励`,
        },
      });
      return { dayKey, reward: checkin.amount, balance: balanceAfter };
    });
    return NextResponse.json({ data: { ...result, eligible: true, claimed: true } });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "今天已经签到，无需重复签到" }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "签到失败" }, { status: 400 });
  }
}
