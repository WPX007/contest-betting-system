import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import {
  AssetType,
  BetStatus,
  LedgerReason,
  MarketStatus,
  MatchStatus,
  PrismaClient,
  SettlementBatchStatus,
  Track,
  UserRole,
} from "../src/generated/prisma/client";
import { getMarketsForWeek } from "../src/lib/demo-data";
import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" }),
});

async function main() {
  const importedTeam = await prisma.team.findFirst({
    where: { allianceKey: { startsWith: "import:" } },
    select: { id: true },
  });
  if (importedTeam) {
    console.log("Imported real roster detected; skipped all demo teams, users, matches and orders.");
    return;
  }

  const season = await prisma.season.upsert({
    where: { id: "season-2026" },
    update: { startsAt: new Date("2026-07-27T00:00:00+08:00"), endsAt: new Date("2026-11-08T23:59:59+08:00") },
    create: { id: "season-2026", name: "2026–2027 内部策划赛", startsAt: new Date("2026-07-27T00:00:00+08:00"), endsAt: new Date("2026-11-08T23:59:59+08:00") },
  });

  for (let index = 1; index <= 12; index += 1) {
    const label = String(index).padStart(2, "0");
    await prisma.team.upsert({
      where: { name_track: { name: `战队${label}-A`, track: Track.A } },
      update: {},
      create: { id: `team-${label}-a`, name: `战队${label}-A`, track: Track.A, allianceKey: `alliance-${label}` },
    });
    await prisma.team.upsert({
      where: { name_track: { name: `战队${label}-B`, track: Track.B } },
      update: {},
      create: { id: `team-${label}-b`, name: `战队${label}-B`, track: Track.B, allianceKey: `alliance-${label}` },
    });
  }

  const defaultPasswordHash = await hashPassword("000000");
  const users = [
    { id: "admin", name: "系统管理员", username: "admin", role: UserRole.SUPER_ADMIN, teamId: null, betCoin: 0, points: 0 },
    { id: "viewer-01", name: "演示用户", username: "Demo User", role: UserRole.VIEWER, teamId: null, betCoin: 1000, points: 140 },
    { id: "user-xingye", name: "星野", username: "Stellar", role: UserRole.PLAYER, teamId: "team-04-b", betCoin: 1000, points: 520 },
    { id: "user-lingchuan", name: "凌川", username: "River", role: UserRole.PLAYER, teamId: "team-11-a", betCoin: 1000, points: 420 },
  ];

  for (const account of users) {
    const user = await prisma.user.upsert({
      where: { username: account.username },
      update: {},
      create: {
        id: account.id,
        name: account.name,
        username: account.username,
        passwordHash: defaultPasswordHash,
        role: account.role,
        teamId: account.teamId,
      },
    });
    for (const walletSeed of [
      { asset: AssetType.BET_COIN, balance: account.betCoin },
      { asset: AssetType.POINT, balance: account.points },
    ]) {
      const wallet = await prisma.wallet.upsert({
        where: { userId_asset: { userId: user.id, asset: walletSeed.asset } },
        update: {},
        create: { userId: user.id, asset: walletSeed.asset, balance: walletSeed.balance },
      });
      const reference = `seed:${user.id}:${walletSeed.asset}`;
      const existingEntry = await prisma.ledgerEntry.findFirst({ where: { walletId: wallet.id, reference } });
      if (!existingEntry && walletSeed.balance > 0) {
        await prisma.ledgerEntry.create({
          data: {
            walletId: wallet.id,
            amount: walletSeed.balance,
            balanceAfter: walletSeed.balance,
            reason: LedgerReason.INITIAL_GRANT,
            reference,
            note: "赛季初始发放",
          },
        });
      }
    }
  }

  const dayIndex: Record<string, number> = { 周一: 0, 周二: 1, 周三: 2, 周四: 3, 周五: 4, 周六: 5, 周日: 6, 今天: 2 };
  for (let week = 1; week <= 4; week += 1) {
    for (const marketSeed of getMarketsForWeek(week)) {
      const day = Object.keys(dayIndex).find((key) => marketSeed.time.startsWith(key)) ?? "周一";
      const clock = marketSeed.time.match(/(\d{1,2}):(\d{2})/);
      const scheduledAt = new Date("2026-07-27T00:00:00+08:00");
      scheduledAt.setDate(scheduledAt.getDate() + (week - 1) * 7 + dayIndex[day]);
      scheduledAt.setHours(Number(clock?.[1] ?? 20), Number(clock?.[2] ?? 0), 0, 0);
      const matchId = `${marketSeed.id}-match`;
      const homeTeamId = `team-${marketSeed.home.slice(2, 4)}-${marketSeed.track.toLowerCase()}`;
      const awayTeamId = `team-${marketSeed.away.slice(2, 4)}-${marketSeed.track.toLowerCase()}`;
      const settled = marketSeed.state === "SETTLED" || week < 4;
      const isDemoDraw = marketSeed.id === "market-007";

      await prisma.match.upsert({
        where: { id: matchId },
        update: {},
        create: {
          id: matchId,
          seasonId: season.id,
          homeTeamId,
          awayTeamId,
          track: marketSeed.track === "A" ? Track.A : Track.B,
          bestOf: marketSeed.bestOf,
          weekNumber: week,
          scheduledAt,
          status: settled ? MatchStatus.FINISHED : MatchStatus.SCHEDULED,
          homeScore: settled ? (isDemoDraw ? 1 : 2) : null,
          awayScore: settled ? (isDemoDraw ? 1 : 0) : null,
        },
      });

      await prisma.market.upsert({
        where: { id: marketSeed.id },
        update: {},
        create: {
          id: marketSeed.id,
          matchId,
          title: marketSeed.title,
          status: settled ? MarketStatus.SETTLED : MarketStatus.OPEN,
          opensAt: new Date(scheduledAt.getTime() - 7 * 24 * 60 * 60 * 1000),
          closesAt: scheduledAt,
          closedAt: settled ? scheduledAt : null,
          options: {
            create: marketSeed.options.map((option, optionIndex) => ({
              id: `${marketSeed.id}-${option.id}`,
              label: option.label,
              isWinner: settled && optionIndex === (isDemoDraw ? 1 : 0),
            })),
          },
        },
      });
    }
  }

  await prisma.parlayConfig.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      ticketStake: 100,
      basePool: 50_000,
      basePool4: 50_000,
      basePool5: 50_000,
      basePool6Plus: 50_000,
      ticketPoolBonusBps: 5_000,
    },
  });

  async function seedBet(input: {
    id: string;
    userId: string;
    marketId: string;
    optionKey: "home" | "draw" | "away";
    stake: number;
    status?: BetStatus;
    payout?: number;
  }) {
    if (await prisma.bet.findUnique({ where: { idempotencyKey: input.id } })) return;
    const wallet = await prisma.wallet.findUniqueOrThrow({
      where: { userId_asset: { userId: input.userId, asset: AssetType.BET_COIN } },
    });
    const payout = input.payout ?? 0;
    const balanceAfter = wallet.balance - input.stake + payout;
    await prisma.$transaction([
      prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter, version: { increment: 1 } },
      }),
      prisma.bet.create({
        data: {
          id: input.id,
          idempotencyKey: input.id,
          userId: input.userId,
          marketId: input.marketId,
          optionId: `${input.marketId}-${input.optionKey}`,
          stake: input.stake,
          acceptedOddsBps: 20000,
          status: input.status ?? BetStatus.ACTIVE,
          payout: payout || null,
          settledAt: input.status === BetStatus.SETTLED ? new Date() : null,
        },
      }),
      prisma.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          amount: -input.stake,
          balanceAfter: wallet.balance - input.stake,
          reason: LedgerReason.BET_PLACED,
          reference: `bet:${input.id}`,
          note: "演示订单下注",
        },
      }),
      ...(payout > 0 ? [prisma.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          amount: payout,
          balanceAfter,
          reason: LedgerReason.SETTLEMENT_PRIZE,
          reference: `bet:${input.id}`,
          note: "演示订单结算派奖",
        },
      })] : []),
    ]);
  }

  await seedBet({ id: "seed-bet-settled", userId: "viewer-01", marketId: "market-002", optionKey: "home", stake: 120, status: BetStatus.SETTLED, payout: 140 });
  await seedBet({ id: "seed-bet-demo", userId: "viewer-01", marketId: "market-003", optionKey: "draw", stake: 100 });
  await seedBet({ id: "seed-bet-stellar", userId: "user-xingye", marketId: "market-003", optionKey: "home", stake: 100 });
  await seedBet({ id: "seed-bet-river", userId: "user-lingchuan", marketId: "market-003", optionKey: "away", stake: 50 });

  await prisma.settlementBatch.upsert({
    where: { marketId: "market-002" },
    update: {},
    create: {
      marketId: "market-002",
      status: SettlementBatchStatus.COMPLETED,
      totalPool: 120,
      winnerPool: 120,
    },
  });

  console.log(`Seeded ${season.name}: 24 teams, ${users.length} users, 48 matches and demo orders.`);
}

main()
  .finally(async () => prisma.$disconnect());
