import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authErrorResponse, requireUser } from "@/lib/auth/session";
import { calculateParlayPool, ticketPoolContribution } from "@/lib/parlay-pool";
import { getParlayOffer, joinParlay } from "@/lib/services/parlay-service";

function offerView(offer: Awaited<ReturnType<typeof getParlayOffer>>) {
  return {
    id: offer.id,
    dayKey: offer.dayKey,
    ticketStake: offer.ticketStake,
    basePool: offer.basePool,
    pool: calculateParlayPool({
      basePool: offer.basePool,
      carryover: offer.carryover,
      ticketStake: offer.ticketStake,
      ticketPoolBonusBps: offer.ticketPoolBonusBps,
      entryCount: offer._count.entries,
    }),
    ticketPoolBonusMultiplier: offer.ticketPoolBonusBps / 10_000,
    ticketPoolContribution: ticketPoolContribution(offer.ticketStake, offer.ticketPoolBonusBps),
    closesAt: offer.closesAt.toISOString(),
    status: offer.status,
    joinedCount: offer._count.entries,
    frozen: Boolean(offer.id),
    markets: offer.markets.map(({ market, position }) => ({
      position,
      id: market.id,
      matchup: `${market.match.homeTeam.name} vs ${market.match.awayTeam.name}`,
      time: market.match.scheduledAt.toISOString(),
      status: market.status,
      options: market.options.map((option) => ({ id: option.id, label: option.label })),
    })),
  };
}

export async function GET(request: Request) {
  try {
    await requireUser();
    const dayKey = new URL(request.url).searchParams.get("day") ?? undefined;
    return NextResponse.json({ data: offerView(await getParlayOffer(dayKey)) });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取过关信息失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const result = await joinParlay(user.id, await request.json());
    return NextResponse.json({
      data: {
        orderId: result.entry.id,
        roundId: result.entry.roundId,
        stake: result.entry.stake,
        status: result.entry.status,
        acceptedAt: result.entry.createdAt.toISOString(),
        closesAt: result.entry.round.closesAt.toISOString(),
        duplicate: result.duplicate,
      },
    }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: error instanceof ZodError ? "过关订单格式错误" : error instanceof Error ? error.message : "过关提交失败" }, { status: 400 });
  }
}
