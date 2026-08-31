import { NextResponse } from "next/server";
import { AssetType } from "@/generated/prisma/enums";
import { authErrorResponse, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const reasonLabels: Record<string, string> = {
  INITIAL_GRANT: "初始竞猜币发放",
  RECHARGE: "充值到账",
  BET_PLACED: "单场竞猜下注",
  BET_REFUND: "单场竞猜退款",
  SETTLEMENT_RETURN: "结算本金返还",
  SETTLEMENT_PRIZE: "结算奖励",
  SYSTEM_RECOVERY: "系统回收",
  PARLAY_PLACED: "过关竞猜购票",
  PARLAY_REFUND: "过关竞猜退款",
  PARLAY_PRIZE: "过关竞猜奖励",
  REWARD: "比赛点券奖励",
  MARKET_INJECTION: "单场盘口注入",
  POINT_EXCHANGE: "点券兑换竞猜币",
  CORRECTION: "管理员调整",
};

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Number(params.get("page") ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number(params.get("pageSize") ?? 20)));
    const wallet = await prisma.wallet.findUniqueOrThrow({
      where: { userId_asset: { userId: user.id, asset: AssetType.BET_COIN } },
    });
    const [entries, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.ledgerEntry.count({ where: { walletId: wallet.id } }),
    ]);
    return NextResponse.json({
      data: entries.map((entry) => ({
        id: entry.id,
        title: entry.note || reasonLabels[entry.reason] || entry.reason,
        reason: entry.reason,
        reference: entry.reference,
        amount: entry.amount,
        balanceAfter: entry.balanceAfter,
        createdAt: entry.createdAt.toISOString(),
      })),
      meta: { page, pageSize, total },
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取钱包流水失败" }, { status: 500 });
  }
}
