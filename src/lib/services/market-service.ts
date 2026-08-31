import { BetStatus, MarketStatus, ParlayRoundStatus } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export async function closeDueMarkets(now = new Date()) {
  const due = await prisma.market.findMany({
    where: { status: MarketStatus.OPEN, closesAt: { lte: now } },
    select: { id: true },
  });
  if (due.length > 0) {
    await prisma.market.updateMany({
      where: { id: { in: due.map((market) => market.id) }, status: MarketStatus.OPEN },
      data: { status: MarketStatus.CLOSED, closedAt: now },
    });
  }
  await prisma.parlayRound.updateMany({
    where: { status: ParlayRoundStatus.OPEN, closesAt: { lte: now } },
    data: { status: ParlayRoundStatus.CLOSED },
  });
  return due.length;
}

export const marketInclude = {
  match: { include: { homeTeam: true, awayTeam: true } },
  options: {
    include: {
      bets: {
        where: { status: { in: [BetStatus.ACTIVE, BetStatus.SETTLED] as BetStatus[] } },
        select: { stake: true },
      },
    },
    orderBy: { id: "asc" as const },
  },
} satisfies Prisma.MarketInclude;

type MarketWithDetails = Prisma.MarketGetPayload<{ include: typeof marketInclude }>;

async function getMarketRecord(id: string) {
  return prisma.market.findUnique({ where: { id }, include: marketInclude });
}

function formatMarketTime(date: Date) {
  const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${days[date.getDay()]} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function marketView(market: MarketWithDetails) {
  const optionKey = (option: (typeof market.options)[number]) => (
    option.id.endsWith("-home") || option.label.startsWith(market.match.homeTeam.name)
      ? "home"
      : option.id.endsWith("-draw") || option.label.includes("平局")
        ? "draw"
        : "away"
  );
  const order = { home: 0, draw: 1, away: 2 };
  const options = [...market.options].sort((first, second) => order[optionKey(first)] - order[optionKey(second)]);
  const optionTotals = options.map((option) => option.injectedAmount + option.bets.reduce((total, bet) => total + bet.stake, 0));
  const pool = optionTotals.reduce((total, amount) => total + amount, 0);
  const state = market.status === MarketStatus.VOIDED
    ? "CLOSED"
    : market.status;
  return {
    id: market.id,
    week: market.match.weekNumber,
    title: market.title,
    bestOf: market.match.bestOf,
    track: market.match.track,
    home: market.match.homeTeam.name,
    away: market.match.awayTeam.name,
    homeTeamId: market.match.homeTeam.id,
    awayTeamId: market.match.awayTeam.id,
    homeAlliance: market.match.homeTeam.allianceKey,
    awayAlliance: market.match.awayTeam.allianceKey,
    scheduledAt: market.match.scheduledAt.toISOString(),
    closesAt: market.closesAt.toISOString(),
    time: formatMarketTime(market.match.scheduledAt),
    closesIn: state === MarketStatus.OPEN ? `${formatMarketTime(market.closesAt)} 自动封盘` : `已于 ${formatMarketTime(market.closesAt)} 封盘`,
    pool,
    state,
    score: market.match.homeScore === null || market.match.awayScore === null ? null : `${market.match.homeScore} : ${market.match.awayScore}`,
    options: options.map((option, index) => {
      const amount = optionTotals[index];
      const calculatedOddsBps = amount > 0
        ? market.returnRatioBps + Math.floor(market.prizeRatioBps * pool / amount)
        : 0;
      return {
        id: option.id,
        key: optionKey(option),
        label: option.label,
        amount,
        injectedAmount: option.injectedAmount,
        oddsBps: option.manualOddsBps ?? calculatedOddsBps,
        isWinner: option.isWinner,
      };
    }),
  };
}

export async function listMarkets(week?: number) {
  await closeDueMarkets();
  const records = await prisma.market.findMany({
    where: week ? { match: { weekNumber: week } } : undefined,
    include: marketInclude,
    orderBy: { match: { scheduledAt: "asc" } },
  });
  return records.map(marketView);
}

export async function getMarket(id: string) {
  await closeDueMarkets();
  const record = await getMarketRecord(id);
  return record ? marketView(record) : null;
}
