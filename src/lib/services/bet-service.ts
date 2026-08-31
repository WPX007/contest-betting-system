import { AssetType, BetStatus, LedgerReason } from "@/generated/prisma/enums";
import { assertBetAllowed, assertSameMarketOption, placeBetSchema } from "@/lib/betting-service";
import { prisma } from "@/lib/prisma";
import { closeDueMarkets } from "@/lib/services/market-service";

export async function placeBet(userId: string, rawInput: unknown) {
  const input = placeBetSchema.parse(rawInput);
  const duplicate = await prisma.bet.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { option: true, market: true },
  });
  if (duplicate) {
    if (duplicate.userId !== userId) throw new Error("幂等键已被其他订单使用");
    const wallet = await prisma.wallet.findUniqueOrThrow({
      where: { userId_asset: { userId, asset: AssetType.BET_COIN } },
    });
    return { bet: duplicate, balanceAfter: wallet.balance, duplicate: true };
  }

  await closeDueMarkets();
  return prisma.$transaction(async (tx) => {
    const [user, market, wallet] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: userId }, include: { team: true } }),
      tx.market.findUniqueOrThrow({
        where: { id: input.marketId },
        include: {
          match: { include: { homeTeam: true, awayTeam: true } },
          options: { include: { bets: { where: { status: { in: [BetStatus.ACTIVE, BetStatus.SETTLED] } } } } },
        },
      }),
      tx.wallet.findUniqueOrThrow({ where: { userId_asset: { userId, asset: AssetType.BET_COIN } } }),
    ]);
    const option = market.options.find((item) => item.id === input.optionId);
    if (!option) throw new Error("竞猜选项不属于该盘口");
    const existingBets = await tx.bet.findMany({
      where: {
        userId,
        marketId: market.id,
        status: { in: [BetStatus.ACTIVE, BetStatus.SETTLED] },
      },
      select: { optionId: true },
    });
    assertSameMarketOption(existingBets.map((bet) => bet.optionId), option.id);

    assertBetAllowed(
      input,
      {
        userId: user.id,
        role: user.role,
        teamId: user.teamId ?? undefined,
        allianceKey: user.team?.allianceKey,
        balance: wallet.balance,
      },
      {
        id: market.id,
        status: market.status as "OPEN" | "CLOSED" | "SETTLED" | "VOIDED",
        closesAt: market.closesAt,
        homeTeamId: market.match.homeTeamId,
        awayTeamId: market.match.awayTeamId,
        homeAllianceKey: market.match.homeTeam.allianceKey,
        awayAllianceKey: market.match.awayTeam.allianceKey,
      },
    );

    const optionTotals = market.options.map((item) => item.bets.reduce((total, bet) => total + bet.stake, 0));
    const totalPool = optionTotals.reduce((total, amount) => total + amount, 0);
    const optionIndex = market.options.findIndex((item) => item.id === option.id);
    const acceptedOddsBps = option.manualOddsBps ?? (
      market.returnRatioBps +
      Math.floor(market.prizeRatioBps * (totalPool + input.stake) / (optionTotals[optionIndex] + input.stake))
    );
    const balanceAfter = wallet.balance - input.stake;
    const updated = await tx.wallet.updateMany({
      where: { id: wallet.id, version: wallet.version, balance: { gte: input.stake } },
      data: { balance: { decrement: input.stake }, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new Error("余额已发生变化，请刷新后重试");

    const bet = await tx.bet.create({
      data: {
        idempotencyKey: input.idempotencyKey,
        userId,
        marketId: market.id,
        optionId: option.id,
        stake: input.stake,
        acceptedOddsBps,
      },
      include: { option: true, market: true },
    });
    await tx.ledgerEntry.create({
      data: {
        walletId: wallet.id,
        amount: -input.stake,
        balanceAfter,
        reason: LedgerReason.BET_PLACED,
        reference: `bet:${bet.id}`,
        note: `${market.match.homeTeam.name} vs ${market.match.awayTeam.name} · ${option.label}`,
      },
    });
    return { bet, balanceAfter, duplicate: false };
  });
}

export function betReceipt(result: Awaited<ReturnType<typeof placeBet>>) {
  return {
    orderId: result.bet.id,
    marketId: result.bet.marketId,
    optionId: result.bet.optionId,
    optionLabel: result.bet.option.label,
    stake: result.bet.stake,
    acceptedOdds: result.bet.acceptedOddsBps / 10000,
    status: result.bet.status,
    acceptedAt: result.bet.createdAt.toISOString(),
    closesAt: result.bet.market.closesAt.toISOString(),
    balanceAfter: result.balanceAfter,
    duplicate: result.duplicate,
  };
}
