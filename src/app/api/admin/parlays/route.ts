import { NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth/session";
import { calculateParlayPool, ticketPoolContribution } from "@/lib/parlay-pool";
import { prisma } from "@/lib/prisma";
import { syncFailedParlayEntries } from "@/lib/services/parlay-service";

export async function GET() {
  try {
    await requireAdmin();
    await syncFailedParlayEntries();
    const rounds = await prisma.parlayRound.findMany({
      include: {
        markets: {
          include: { market: { include: { match: { include: { homeTeam: true, awayTeam: true } } } } },
          orderBy: { position: "asc" },
        },
        entries: {
          include: {
            user: { include: { team: true } },
            legs: {
              include: {
                option: true,
                market: { include: { match: { include: { homeTeam: true, awayTeam: true } } } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      data: rounds.map((round) => ({
        id: round.id,
        scope: round.scope,
        dayKey: round.dayKey,
        status: round.status,
        ticketStake: round.ticketStake,
        basePool: round.basePool,
        ticketPoolBonusMultiplier: round.ticketPoolBonusBps / 10_000,
        ticketPoolContribution: ticketPoolContribution(round.ticketStake, round.ticketPoolBonusBps),
        pool: calculateParlayPool({
          basePool: round.basePool,
          carryover: round.carryover,
          ticketStake: round.ticketStake,
          ticketPoolBonusBps: round.ticketPoolBonusBps,
          entryCount: round.entries.length,
        }),
        closesAt: round.closesAt.toISOString(),
        createdAt: round.createdAt.toISOString(),
        markets: round.markets.map((item) => ({
          id: item.marketId,
          matchup: `${item.market.match.homeTeam.name} vs ${item.market.match.awayTeam.name}`,
        })),
        participants: round.entries.map((entry) => ({
          orderId: entry.id,
          userId: entry.userId,
          name: entry.user.name,
          username: entry.user.username,
          team: entry.user.team?.name ?? "无",
          stake: entry.stake,
          status: entry.status,
          payout: entry.payout,
          joinedAt: entry.createdAt.toISOString(),
          legs: entry.legs.map((leg) => ({
            marketId: leg.marketId,
            matchup: `${leg.market.match.homeTeam.name} vs ${leg.market.match.awayTeam.name}`,
            optionLabel: leg.option.label,
            status: leg.status,
          })),
        })),
      })),
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取闯关参与信息失败" }, { status: 500 });
  }
}
