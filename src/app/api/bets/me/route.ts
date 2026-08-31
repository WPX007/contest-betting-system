import { NextResponse } from "next/server";
import { BetStatus } from "@/generated/prisma/enums";
import { authErrorResponse, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Number(params.get("page") ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number(params.get("pageSize") ?? 20)));
    const requestedStatus = params.get("status");
    const status = requestedStatus && Object.values(BetStatus).includes(requestedStatus as BetStatus)
      ? requestedStatus as BetStatus
      : undefined;
    const where = { userId: user.id, ...(status ? { status } : {}) };
    const [orders, total] = await Promise.all([
      prisma.bet.findMany({
        where,
        include: {
          option: true,
          market: {
            include: { match: { include: { homeTeam: true, awayTeam: true } }, options: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.bet.count({ where }),
    ]);
    return NextResponse.json({
      data: orders.map((order) => ({
        id: order.id,
        marketId: order.marketId,
        optionId: order.optionId,
        week: order.market.match.weekNumber,
        matchup: `${order.market.match.homeTeam.name} vs ${order.market.match.awayTeam.name}`,
        optionLabel: order.option.label,
        stake: order.stake,
        acceptedOdds: order.acceptedOddsBps / 10000,
        status: order.status,
        marketStatus: order.market.status,
        won: order.status === BetStatus.SETTLED ? order.option.isWinner : null,
        payout: order.payout,
        score: order.market.match.homeScore === null ? null : `${order.market.match.homeScore} : ${order.market.match.awayScore}`,
        createdAt: order.createdAt.toISOString(),
        settledAt: order.settledAt?.toISOString() ?? null,
      })),
      meta: { page, pageSize, total },
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取竞猜订单失败" }, { status: 500 });
  }
}
