import { AssetType, BetStatus, LedgerReason, MarketStatus, ParlayRoundStatus, ParlayScope, UserRole } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { currentCompetitionWeek, weeklyParlayKey } from "@/lib/competition-week";
import { calculateParlayPool, ticketPoolContribution } from "@/lib/parlay-pool";
import { prisma } from "@/lib/prisma";
import { currentShanghaiDayKey, getParlayOffer } from "@/lib/services/parlay-service";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type HouseTreasury = {
  rake: number;
  marketInjection: number;
  parlayPool: number;
  parlayTicketBonus: number;
  total: number;
};

export type HouseTreasuryDetails = HouseTreasury & {
  rakeEntries: Array<{ id: string; amount: number; note: string | null; reference: string; createdAt: string }>;
  marketInjections: Array<{ id: string; amount: number; note: string | null; reference: string; createdAt: string }>;
  parlayRounds: Array<{
    dayKey: string;
    scope: string;
    status: string;
    marketCount: number;
    entryCount: number;
    basePool: number;
    carryover: number;
    ticketStake: number;
    ticketContribution: number;
    ticketBonus: number;
    pool: number;
    closesAt: string;
  }>;
};

export async function getHouseUser(db: DbClient = prisma) {
  const user = await db.user.findFirst({
    where: {
      OR: [{ username: "admin" }, { role: UserRole.SUPER_ADMIN }],
    },
    include: { wallets: true },
    orderBy: { createdAt: "asc" },
  });
  if (!user) throw new Error("未找到系统管理员账户");
  return user;
}

export async function creditHouseWallet(
  db: DbClient,
  amount: number,
  reason: LedgerReason,
  reference: string,
  note: string,
) {
  if (amount <= 0) return 0;
  const existing = await db.ledgerEntry.findFirst({ where: { reference } });
  if (existing) return 0;
  const house = await getHouseUser(db);
  const wallet = house.wallets.find((item) => item.asset === AssetType.BET_COIN)
    ?? await db.wallet.findUniqueOrThrow({
      where: { userId_asset: { userId: house.id, asset: AssetType.BET_COIN } },
    });
  const balanceAfter = wallet.balance + amount;
  await db.wallet.update({
    where: { id: wallet.id },
    data: { balance: balanceAfter, version: { increment: 1 } },
  });
  await db.ledgerEntry.create({
    data: {
      walletId: wallet.id,
      amount,
      balanceAfter,
      reason,
      reference,
      note,
    },
  });
  return amount;
}

export async function debitHouseWallet(
  db: DbClient,
  amount: number,
  reason: LedgerReason,
  reference: string,
  note: string,
) {
  if (amount <= 0) return 0;
  const existing = await db.ledgerEntry.findFirst({ where: { reference } });
  if (existing) return 0;
  const house = await getHouseUser(db);
  const wallet = house.wallets.find((item) => item.asset === AssetType.BET_COIN)
    ?? await db.wallet.findUniqueOrThrow({
      where: { userId_asset: { userId: house.id, asset: AssetType.BET_COIN } },
    });
  const balanceAfter = wallet.balance - amount;
  await db.wallet.update({
    where: { id: wallet.id },
    data: { balance: balanceAfter, version: { increment: 1 } },
  });
  await db.ledgerEntry.create({
    data: {
      walletId: wallet.id,
      amount: -amount,
      balanceAfter,
      reason,
      reference,
      note,
    },
  });
  return amount;
}

export async function syncSettledHouseRake(db: DbClient = prisma) {
  const markets = await db.market.findMany({
    where: { status: MarketStatus.SETTLED },
    include: { bets: { where: { status: { in: [BetStatus.ACTIVE, BetStatus.SETTLED] } } } },
  });
  let credited = 0;
  for (const market of markets) {
    const totalPool = market.bets.reduce((total, bet) => total + bet.stake, 0);
    const rake = Math.floor(totalPool * market.recoveryRatioBps / 10_000);
    credited += await creditHouseWallet(
      db,
      rake,
      LedgerReason.SYSTEM_RECOVERY,
      `house-rake:${market.id}`,
      "单场竞猜后台抽水",
    );
  }
  return credited;
}

export async function displayBalanceForUser(user: {
  role: UserRole;
  wallets: Array<{ asset: string; balance: number }>;
}) {
  const personal = user.wallets.find((wallet) => wallet.asset === AssetType.BET_COIN)?.balance ?? 0;
  if (user.role !== UserRole.OPS_ADMIN && user.role !== UserRole.SUPER_ADMIN) return personal;
  return (await getHouseTreasury()).total;
}

export async function getHouseTreasury(): Promise<HouseTreasury> {
  await syncSettledHouseRake();
  const house = await getHouseUser();
  const coinWallet = house.wallets.find((wallet) => wallet.asset === AssetType.BET_COIN);
  const [rakeAggregate, injectionAggregate] = coinWallet
    ? await Promise.all([
        prisma.ledgerEntry.aggregate({
          where: { walletId: coinWallet.id, reason: LedgerReason.SYSTEM_RECOVERY },
          _sum: { amount: true },
        }),
        prisma.ledgerEntry.aggregate({
          where: { walletId: coinWallet.id, reason: LedgerReason.MARKET_INJECTION },
          _sum: { amount: true },
        }),
      ])
    : [{ _sum: { amount: null } }, { _sum: { amount: null } }];
  const rake = rakeAggregate._sum.amount ?? 0;
  const marketInjection = Math.abs(injectionAggregate._sum.amount ?? 0);
  const rounds = await prisma.parlayRound.findMany({
    where: { status: { in: [ParlayRoundStatus.OPEN, ParlayRoundStatus.CLOSED] } },
    include: { _count: { select: { entries: true } } },
  });
  let parlayPool = 0;
  let parlayTicketBonus = 0;
  for (const round of rounds) {
    parlayPool += calculateParlayPool({
      basePool: round.basePool,
      carryover: round.carryover,
      ticketStake: round.ticketStake,
      ticketPoolBonusBps: round.ticketPoolBonusBps,
      entryCount: round._count.entries,
    });
    const extra = ticketPoolContribution(round.ticketStake, round.ticketPoolBonusBps) - round.ticketStake;
    parlayTicketBonus += extra * round._count.entries;
  }
  const todayKey = currentShanghaiDayKey();
  if (!rounds.some((round) => round.scope === ParlayScope.DAILY && round.dayKey === todayKey)) {
    const offer = await getParlayOffer(ParlayScope.DAILY, todayKey);
    parlayPool += calculateParlayPool({
      basePool: offer.basePool,
      carryover: offer.carryover,
      ticketStake: offer.ticketStake,
      ticketPoolBonusBps: offer.ticketPoolBonusBps,
      entryCount: offer._count.entries,
    });
    const extra = ticketPoolContribution(offer.ticketStake, offer.ticketPoolBonusBps) - offer.ticketStake;
    parlayTicketBonus += extra * offer._count.entries;
  }
  for (const weekly of [
    { scope: ParlayScope.WEEKLY_A, key: weeklyParlayKey(currentCompetitionWeek(), "A") },
    { scope: ParlayScope.WEEKLY_B, key: weeklyParlayKey(currentCompetitionWeek(), "B") },
  ]) {
    if (!rounds.some((round) => round.scope === weekly.scope && round.dayKey === weekly.key)) {
      const offer = await getParlayOffer(weekly.scope, weekly.key);
      if (offer.markets.length !== 6 || offer.closesAt <= new Date()) continue;
      parlayPool += calculateParlayPool({
        basePool: offer.basePool,
        carryover: offer.carryover,
        ticketStake: offer.ticketStake,
        ticketPoolBonusBps: offer.ticketPoolBonusBps,
        entryCount: offer._count.entries,
      });
    }
  }
  return {
    rake,
    marketInjection,
    parlayPool,
    parlayTicketBonus,
    total: rake - marketInjection - parlayPool,
  };
}

export async function getHouseTreasuryDetails(): Promise<HouseTreasuryDetails> {
  const treasury = await getHouseTreasury();
  const house = await getHouseUser();
  const coinWallet = house.wallets.find((wallet) => wallet.asset === AssetType.BET_COIN);
  const [rakeEntries, marketInjections, rounds] = await Promise.all([
    coinWallet
      ? prisma.ledgerEntry.findMany({
        where: { walletId: coinWallet.id, reason: LedgerReason.SYSTEM_RECOVERY },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
      : [],
    coinWallet
      ? prisma.ledgerEntry.findMany({
        where: { walletId: coinWallet.id, reason: LedgerReason.MARKET_INJECTION },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
      : [],
    prisma.parlayRound.findMany({
      where: { status: { in: [ParlayRoundStatus.OPEN, ParlayRoundStatus.CLOSED] } },
      include: { markets: true, _count: { select: { entries: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const parlayRounds = rounds.map((round) => {
    const ticketContribution = ticketPoolContribution(round.ticketStake, round.ticketPoolBonusBps);
    return {
      dayKey: round.dayKey,
      scope: round.scope,
      status: round.status,
      marketCount: round.markets.length,
      entryCount: round._count.entries,
      basePool: round.basePool,
      carryover: round.carryover,
      ticketStake: round.ticketStake,
      ticketContribution,
      ticketBonus: (ticketContribution - round.ticketStake) * round._count.entries,
      pool: calculateParlayPool({
        basePool: round.basePool,
        carryover: round.carryover,
        ticketStake: round.ticketStake,
        ticketPoolBonusBps: round.ticketPoolBonusBps,
        entryCount: round._count.entries,
      }),
      closesAt: round.closesAt.toISOString(),
    };
  });
  const todayKey = currentShanghaiDayKey();
  if (!parlayRounds.some((round) => round.scope === ParlayScope.DAILY && round.dayKey === todayKey)) {
    const offer = await getParlayOffer(ParlayScope.DAILY, todayKey);
    const ticketContribution = ticketPoolContribution(offer.ticketStake, offer.ticketPoolBonusBps);
    parlayRounds.push({
      dayKey: offer.dayKey,
      scope: offer.scope,
      status: offer.status,
      marketCount: offer.markets.length,
      entryCount: offer._count.entries,
      basePool: offer.basePool,
      carryover: offer.carryover,
      ticketStake: offer.ticketStake,
      ticketContribution,
      ticketBonus: (ticketContribution - offer.ticketStake) * offer._count.entries,
      pool: calculateParlayPool({
        basePool: offer.basePool,
        carryover: offer.carryover,
        ticketStake: offer.ticketStake,
        ticketPoolBonusBps: offer.ticketPoolBonusBps,
        entryCount: offer._count.entries,
      }),
      closesAt: offer.closesAt.toISOString(),
    });
  }
  for (const weekly of [
    { scope: ParlayScope.WEEKLY_A, key: weeklyParlayKey(currentCompetitionWeek(), "A") },
    { scope: ParlayScope.WEEKLY_B, key: weeklyParlayKey(currentCompetitionWeek(), "B") },
  ]) {
    if (!parlayRounds.some((round) => round.scope === weekly.scope && round.dayKey === weekly.key)) {
      const offer = await getParlayOffer(weekly.scope, weekly.key);
      if (offer.markets.length !== 6 || offer.closesAt <= new Date()) continue;
      const ticketContribution = ticketPoolContribution(offer.ticketStake, offer.ticketPoolBonusBps);
      parlayRounds.push({
        dayKey: offer.dayKey,
        scope: offer.scope,
        status: offer.status,
        marketCount: offer.markets.length,
        entryCount: offer._count.entries,
        basePool: offer.basePool,
        carryover: offer.carryover,
        ticketStake: offer.ticketStake,
        ticketContribution,
        ticketBonus: 0,
        pool: calculateParlayPool({
          basePool: offer.basePool,
          carryover: offer.carryover,
          ticketStake: offer.ticketStake,
          ticketPoolBonusBps: offer.ticketPoolBonusBps,
          entryCount: offer._count.entries,
        }),
        closesAt: offer.closesAt.toISOString(),
      });
    }
  }
  return {
    ...treasury,
    rakeEntries: rakeEntries.map((entry) => ({
      id: entry.id,
      amount: entry.amount,
      note: entry.note,
      reference: entry.reference,
      createdAt: entry.createdAt.toISOString(),
    })),
    marketInjections: marketInjections.map((entry) => ({
      id: entry.id,
      amount: Math.abs(entry.amount),
      note: entry.note,
      reference: entry.reference,
      createdAt: entry.createdAt.toISOString(),
    })),
    parlayRounds,
  };
}
