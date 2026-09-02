import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth/session";
import { calculateParlayPool } from "@/lib/parlay-pool";
import { listMyParlays } from "@/lib/services/parlay-service";

export async function GET() {
  try {
    const user = await requireUser();
    const entries = await listMyParlays(user.id);
    return NextResponse.json({
      data: entries.map((entry) => ({
        id: entry.id,
        scope: entry.round.scope,
        dayKey: entry.round.dayKey,
        stake: entry.stake,
        status: entry.status,
        payout: entry.payout,
        pool: calculateParlayPool({
          basePool: entry.round.basePool,
          carryover: entry.round.carryover,
          ticketStake: entry.round.ticketStake,
          ticketPoolBonusBps: entry.round.ticketPoolBonusBps,
          entryCount: entry.round._count.entries,
        }),
        closesAt: entry.round.closesAt.toISOString(),
        createdAt: entry.createdAt.toISOString(),
        legs: entry.legs.map((leg) => ({
          id: leg.id,
          marketId: leg.marketId,
          matchup: `${leg.market.match.homeTeam.name} vs ${leg.market.match.awayTeam.name}`,
          optionLabel: leg.option.label,
          status: leg.status,
        })),
      })),
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取过关订单失败" }, { status: 500 });
  }
}
