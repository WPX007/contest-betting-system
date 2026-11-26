import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { refundUserMarketBets } from "@/lib/services/settlement-service";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const marketId = new URL(request.url).searchParams.get("marketId") ?? undefined;
    const bets = await prisma.bet.findMany({
      where: marketId ? { marketId } : undefined,
      include: { user: { include: { team: true } }, option: true, market: { include: { match: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      data: bets.map((bet) => ({
        id: bet.id,
        marketId: bet.marketId,
        week: bet.market.match.weekNumber,
        userId: bet.userId,
        userName: bet.user.name,
        username: bet.user.username,
        team: bet.user.team?.name ?? "无",
        optionId: bet.optionId,
        optionLabel: bet.option.label,
        amount: bet.stake,
        createdAt: bet.createdAt.toISOString(),
        recordStatus: bet.status === "REFUNDED" ? "REFUNDED" : "ACTIVE",
        status: bet.status,
        payout: bet.payout,
      })),
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取下注明细失败" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const input = z.object({
      action: z.literal("REFUND_USER_MARKET"),
      userId: z.string().min(1),
      marketId: z.string().min(1),
    }).parse(await request.json());
    const result = await prisma.$transaction(async (tx) => {
      const [user, market] = await Promise.all([
        tx.user.findUniqueOrThrow({ where: { id: input.userId } }),
        tx.market.findUniqueOrThrow({
          where: { id: input.marketId },
          include: { match: { include: { homeTeam: true, awayTeam: true } } },
        }),
      ]);
      if (market.status === "SETTLED" || market.status === "VOIDED") {
        throw new Error("已结算或已作废比赛的竞猜不能撤销");
      }
      const refunded = await refundUserMarketBets(
        tx,
        user.id,
        market.id,
        `管理员撤销 ${market.match.homeTeam.name} vs ${market.match.awayTeam.name} 的个人竞猜`,
      );
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: "ADMIN_REFUND_USER_MARKET_BETS",
          target: `${user.id}:${market.id}`,
          after: JSON.stringify(refunded),
        },
      });
      return { ...refunded, userName: user.name };
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "撤销个人竞猜失败" }, { status: 400 });
  }
}
