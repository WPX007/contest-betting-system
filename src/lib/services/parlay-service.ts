import { z } from "zod";
import {
  AssetType,
  LedgerReason,
  MarketStatus,
  ParlayEntryStatus,
  ParlayLegStatus,
  ParlayRoundStatus,
  UserRole,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { basePoolForMarketCount } from "@/lib/parlay-pool";
import { closeDueMarkets } from "@/lib/services/market-service";

const joinParlaySchema = z.object({
  idempotencyKey: z.string().uuid(),
  dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  selections: z.array(z.object({ marketId: z.string().min(1), optionId: z.string().min(1) })).min(3),
});

function shanghaiDayRange(dayKey: string) {
  const start = new Date(`${dayKey}T00:00:00+08:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export function currentShanghaiDayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export async function getParlayOffer(dayKey = currentShanghaiDayKey()) {
  await closeDueMarkets();
  const existing = await prisma.parlayRound.findUnique({
    where: { dayKey },
    include: {
      markets: {
        include: { market: { include: { match: { include: { homeTeam: true, awayTeam: true } }, options: true } } },
        orderBy: { position: "asc" },
      },
      _count: { select: { entries: true } },
    },
  });
  if (existing) return existing;
  const { start, end } = shanghaiDayRange(dayKey);
  const [markets, config] = await Promise.all([
    prisma.market.findMany({
      where: {
        status: MarketStatus.OPEN,
        match: { scheduledAt: { gte: start, lt: end } },
      },
      include: { match: { include: { homeTeam: true, awayTeam: true } }, options: true },
      orderBy: { closesAt: "asc" },
    }),
    prisma.parlayConfig.findUniqueOrThrow({ where: { id: "default" } }),
  ]);
  return {
    id: null,
    dayKey,
    ticketStake: config.ticketStake,
    basePool: basePoolForMarketCount({
      three: config.basePool,
      four: config.basePool4,
      five: config.basePool5,
      sixPlus: config.basePool6Plus,
    }, markets.length),
    ticketPoolBonusBps: config.ticketPoolBonusBps,
    carryover: 0,
    closesAt: markets[0]?.closesAt ?? end,
    status: ParlayRoundStatus.OPEN,
    markets: markets.map((market, position) => ({ market, position })),
    _count: { entries: 0 },
  };
}

export async function joinParlay(userId: string, rawInput: unknown) {
  const input = joinParlaySchema.parse(rawInput);
  const duplicate = await prisma.parlayEntry.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { round: true, legs: true },
  });
  if (duplicate) {
    if (duplicate.userId !== userId) throw new Error("幂等键已被其他订单使用");
    return { entry: duplicate, duplicate: true };
  }
  await closeDueMarkets();
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.role === UserRole.OPS_ADMIN || user.role === UserRole.SUPER_ADMIN || user.role === UserRole.SCOREKEEPER) {
      throw new Error("赛事管理角色不得参与过关竞猜");
    }
    let round = await tx.parlayRound.findUnique({
      where: { dayKey: input.dayKey },
      include: { markets: { orderBy: { position: "asc" } } },
    });
    if (!round) {
      const { start, end } = shanghaiDayRange(input.dayKey);
      const [markets, config] = await Promise.all([
        tx.market.findMany({
          where: { status: MarketStatus.OPEN, match: { scheduledAt: { gte: start, lt: end } } },
          orderBy: { closesAt: "asc" },
        }),
        tx.parlayConfig.findUniqueOrThrow({ where: { id: "default" } }),
      ]);
      if (markets.length < 3) throw new Error("当天不足 3 场可用比赛，不能创建过关");
      round = await tx.parlayRound.create({
        data: {
          dayKey: input.dayKey,
          ticketStake: config.ticketStake,
          basePool: basePoolForMarketCount({
            three: config.basePool,
            four: config.basePool4,
            five: config.basePool5,
            sixPlus: config.basePool6Plus,
          }, markets.length),
          ticketPoolBonusBps: config.ticketPoolBonusBps,
          closesAt: markets[0].closesAt,
          markets: {
            create: markets.map((market, position) => ({ marketId: market.id, position })),
          },
        },
        include: { markets: { orderBy: { position: "asc" } } },
      });
    }
    if (round.status !== ParlayRoundStatus.OPEN || round.closesAt <= new Date()) throw new Error("本期过关已截止");
    const roundMarketIds = round.markets.map((item) => item.marketId);
    if (
      input.selections.length !== roundMarketIds.length ||
      new Set(input.selections.map((item) => item.marketId)).size !== roundMarketIds.length ||
      input.selections.some((item) => !roundMarketIds.includes(item.marketId))
    ) {
      throw new Error("必须为本期全部比赛各选择一个结果");
    }
    const validOptions = await tx.marketOption.findMany({
      where: {
        OR: input.selections.map((selection) => ({ id: selection.optionId, marketId: selection.marketId })),
      },
    });
    if (validOptions.length !== input.selections.length) throw new Error("过关选项无效");

    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { userId_asset: { userId, asset: AssetType.BET_COIN } },
    });
    if (wallet.balance < round.ticketStake) throw new Error("竞猜币余额不足");
    const balanceAfter = wallet.balance - round.ticketStake;
    const updated = await tx.wallet.updateMany({
      where: { id: wallet.id, version: wallet.version, balance: { gte: round.ticketStake } },
      data: { balance: { decrement: round.ticketStake }, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new Error("余额已发生变化，请重试");
    const entry = await tx.parlayEntry.create({
      data: {
        idempotencyKey: input.idempotencyKey,
        roundId: round.id,
        userId,
        stake: round.ticketStake,
        legs: { create: input.selections },
      },
      include: { round: true, legs: true },
    });
    await tx.ledgerEntry.create({
      data: {
        walletId: wallet.id,
        amount: -round.ticketStake,
        balanceAfter,
        reason: LedgerReason.PARLAY_PLACED,
        reference: `parlay:${entry.id}`,
        note: `${input.dayKey} 过关竞猜门票`,
      },
    });
    return { entry, duplicate: false };
  });
}

export async function listMyParlays(userId: string) {
  await syncFailedParlayEntries();
  return prisma.parlayEntry.findMany({
    where: { userId },
    include: {
      round: { include: { _count: { select: { entries: true } } } },
      legs: {
        include: {
          option: true,
          market: { include: { match: { include: { homeTeam: true, awayTeam: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function syncFailedParlayEntries() {
  return prisma.parlayEntry.updateMany({
    where: {
      status: ParlayEntryStatus.ACTIVE,
      legs: { some: { status: ParlayLegStatus.LOST } },
    },
    data: { status: ParlayEntryStatus.LOST },
  });
}

export async function refundParlayRound(roundId: string) {
  const entries = await prisma.parlayEntry.findMany({ where: { roundId, status: ParlayEntryStatus.ACTIVE } });
  return entries.length;
}
