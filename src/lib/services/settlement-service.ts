import {
  AssetType,
  BetStatus,
  LedgerReason,
  MarketStatus,
  MatchStatus,
  ParlayEntryStatus,
  ParlayLegStatus,
  ParlayScope,
  ParlayRoundStatus,
  SettlementBatchStatus,
} from "@/generated/prisma/enums";
import { calculateMatchPointRewards, DEFAULT_MATCH_POINT_REWARDS, matchAllianceRewardNote, matchPointRewardNote } from "@/lib/match-point-rewards";
import { calculateParlayPool, ticketPoolContribution } from "@/lib/parlay-pool";
import { prisma } from "@/lib/prisma";
import { creditHouseWallet } from "@/lib/services/house-wallet";

export async function refundMarket(marketId: string, note: string) {
  return prisma.$transaction(async (tx) => {
    const bets = await tx.bet.findMany({ where: { marketId, status: BetStatus.ACTIVE } });
    for (const bet of bets) {
      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { userId_asset: { userId: bet.userId, asset: AssetType.BET_COIN } },
      });
      const balanceAfter = wallet.balance + bet.stake;
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter, version: { increment: 1 } },
      });
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          amount: bet.stake,
          balanceAfter,
          reason: LedgerReason.BET_REFUND,
          reference: `bet:${bet.id}`,
          note,
        },
      });
      await tx.bet.update({
        where: { id: bet.id },
        data: { status: BetStatus.REFUNDED, refundedAt: new Date(), payout: bet.stake },
      });
    }
    await tx.market.update({
      where: { id: marketId },
      data: { status: MarketStatus.VOIDED, closedAt: new Date() },
    });
    return bets.length;
  });
}

export async function settleMarket(input: {
  marketId: string;
  homeScore: number;
  awayScore: number;
}) {
  return prisma.$transaction(async (tx) => {
    const [market, persistedConfig] = await Promise.all([
      tx.market.findUniqueOrThrow({
        where: { id: input.marketId },
        include: {
          match: { include: { homeTeam: true, awayTeam: true } },
          options: true,
          bets: { where: { status: BetStatus.ACTIVE } },
        },
      }),
      tx.parlayConfig.findUnique({ where: { id: "default" } }),
    ]);
    const pointRewardConfig = persistedConfig
      ? {
          smallGameWinPoints: persistedConfig.smallGameWinPoints,
          allianceGameWinPoints: persistedConfig.allianceGameWinPoints,
          seriesWinPoints: persistedConfig.seriesWinPoints,
        }
      : DEFAULT_MATCH_POINT_REWARDS;
    if (market.status !== MarketStatus.CLOSED && market.status !== MarketStatus.PENDING_REVIEW) {
      throw new Error(market.status === MarketStatus.SETTLED ? "该比赛已经结算" : "比赛必须先封盘，才能执行结算");
    }
    const expectedResult = input.homeScore === input.awayScore
      ? "DRAW"
      : input.homeScore > input.awayScore
        ? "HOME"
        : "AWAY";
    const winnerOption = market.options.find((option) => expectedResult === "DRAW"
      ? option.label.includes("平局")
      : expectedResult === "HOME"
        ? option.label.startsWith(market.match.homeTeam.name)
        : option.label.startsWith(market.match.awayTeam.name));
    if (!winnerOption) throw new Error("系统无法找到与比分对应的胜负平盘口选项");
    const winnerOptionId = winnerOption.id;
    const userPool = market.bets.reduce((total, bet) => total + bet.stake, 0);
    const injectedPool = market.options.reduce((total, option) => total + option.injectedAmount, 0);
    const totalPool = userPool + injectedPool;
    const winnerPool = winnerOption.injectedAmount + market.bets
      .filter((bet) => bet.optionId === winnerOptionId)
      .reduce((total, bet) => total + bet.stake, 0);
    const prizePool = Math.floor(totalPool * market.prizeRatioBps / 10000);

    for (const bet of market.bets) {
      const returned = Math.floor(bet.stake * market.returnRatioBps / 10000);
      const prize = bet.optionId === winnerOptionId && winnerPool > 0
        ? Math.floor(prizePool * bet.stake / winnerPool)
        : 0;
      const payout = returned + prize;
      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { userId_asset: { userId: bet.userId, asset: AssetType.BET_COIN } },
      });
      let balanceAfter = wallet.balance;
      if (returned > 0) {
        balanceAfter += returned;
        await tx.ledgerEntry.create({
          data: {
            walletId: wallet.id,
            amount: returned,
            balanceAfter,
            reason: LedgerReason.SETTLEMENT_RETURN,
            reference: `bet:${bet.id}`,
            note: "单场竞猜本金返还",
          },
        });
      }
      if (prize > 0) {
        balanceAfter += prize;
        await tx.ledgerEntry.create({
          data: {
            walletId: wallet.id,
            amount: prize,
            balanceAfter,
            reason: LedgerReason.SETTLEMENT_PRIZE,
            reference: `bet:${bet.id}`,
            note: "单场竞猜中奖奖励",
          },
        });
      }
      if (payout > 0) {
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: balanceAfter, version: { increment: 1 } },
        });
      }
      await tx.bet.update({
        where: { id: bet.id },
        data: { status: BetStatus.SETTLED, payout, settledAt: new Date() },
      });
    }

    await tx.marketOption.updateMany({ where: { marketId: market.id }, data: { isWinner: false } });
    await tx.marketOption.update({ where: { id: winnerOptionId }, data: { isWinner: true } });
    await tx.match.update({
      where: { id: market.matchId },
      data: { status: MatchStatus.FINISHED, homeScore: input.homeScore, awayScore: input.awayScore },
    });
    await tx.market.update({
      where: { id: market.id },
      data: { status: MarketStatus.SETTLED, closedAt: market.closedAt ?? new Date() },
    });
    await tx.settlementBatch.upsert({
      where: { marketId: market.id },
      update: { status: SettlementBatchStatus.COMPLETED, totalPool, winnerPool },
      create: { marketId: market.id, status: SettlementBatchStatus.COMPLETED, totalPool, winnerPool },
    });
    const pointRewards = calculateMatchPointRewards(input.homeScore, input.awayScore, pointRewardConfig);
    const pointRewardRecipientIds = new Set<string>();
    let totalPointRewards = 0;
    const awardTeamPoints = async (teamId: string, teamName: string, points: number, gameWins: number, seriesWin: boolean) => {
      if (points <= 0) return;
      const members = await tx.user.findMany({
        where: { teamId },
        include: { wallets: true },
      });
      for (const member of members) {
        const wallet = member.wallets.find((item) => item.asset === AssetType.POINT);
        if (!wallet) continue;
        const reference = `match-points:${market.matchId}:${member.id}`;
        if (await tx.ledgerEntry.findFirst({ where: { reference } })) continue;
        const balanceAfter = wallet.balance + points;
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: balanceAfter, version: { increment: 1 } },
        });
        await tx.ledgerEntry.create({
          data: {
            walletId: wallet.id,
            amount: points,
            balanceAfter,
            reason: LedgerReason.REWARD,
            reference,
            note: `${teamName} 比赛点券奖励：${matchPointRewardNote(gameWins, seriesWin, pointRewardConfig)}`,
          },
        });
        pointRewardRecipientIds.add(member.id);
        totalPointRewards += points;
      }
    };
    const awardAlliancePoints = async (allianceKey: string, sourceTeamId: string, sourceTeamName: string, points: number, gameWins: number) => {
      if (points <= 0) return;
      const members = await tx.user.findMany({
        where: { team: { allianceKey } },
        include: { wallets: true },
      });
      for (const member of members) {
        const wallet = member.wallets.find((item) => item.asset === AssetType.POINT);
        if (!wallet) continue;
        const reference = `match-alliance-points:${market.matchId}:${sourceTeamId}:${member.id}`;
        if (await tx.ledgerEntry.findFirst({ where: { reference } })) continue;
        const balanceAfter = wallet.balance + points;
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: balanceAfter, version: { increment: 1 } },
        });
        await tx.ledgerEntry.create({
          data: {
            walletId: wallet.id,
            amount: points,
            balanceAfter,
            reason: LedgerReason.REWARD,
            reference,
            note: matchAllianceRewardNote(sourceTeamName, gameWins, pointRewardConfig.allianceGameWinPoints),
          },
        });
        pointRewardRecipientIds.add(member.id);
        totalPointRewards += points;
      }
    };
    await awardTeamPoints(
      market.match.homeTeam.id,
      market.match.homeTeam.name,
      pointRewards.home.points,
      pointRewards.home.gameWins,
      pointRewards.home.seriesWin,
    );
    await awardTeamPoints(
      market.match.awayTeam.id,
      market.match.awayTeam.name,
      pointRewards.away.points,
      pointRewards.away.gameWins,
      pointRewards.away.seriesWin,
    );
    await awardAlliancePoints(
      market.match.homeTeam.allianceKey,
      market.match.homeTeam.id,
      market.match.homeTeam.name,
      pointRewards.home.alliancePoints,
      pointRewards.home.gameWins,
    );
    await awardAlliancePoints(
      market.match.awayTeam.allianceKey,
      market.match.awayTeam.id,
      market.match.awayTeam.name,
      pointRewards.away.alliancePoints,
      pointRewards.away.gameWins,
    );
    const rake = Math.floor(userPool * market.recoveryRatioBps / 10_000);
    await creditHouseWallet(tx, rake, LedgerReason.SYSTEM_RECOVERY, `house-rake:${market.id}`, "单场竞猜后台抽水");

    await tx.parlayLeg.updateMany({
      where: { marketId: market.id, optionId: winnerOptionId },
      data: { status: ParlayLegStatus.WON },
    });
    await tx.parlayLeg.updateMany({
      where: { marketId: market.id, optionId: { not: winnerOptionId } },
      data: { status: ParlayLegStatus.LOST },
    });
    await tx.parlayEntry.updateMany({
      where: {
        status: ParlayEntryStatus.ACTIVE,
        legs: { some: { marketId: market.id, status: ParlayLegStatus.LOST } },
      },
      data: { status: ParlayEntryStatus.LOST },
    });
    const rounds = await tx.parlayRound.findMany({
      where: { markets: { some: { marketId: market.id } }, status: { in: [ParlayRoundStatus.OPEN, ParlayRoundStatus.CLOSED] } },
      include: { markets: { include: { market: true } }, entries: { include: { legs: true } } },
    });
    for (const round of rounds) {
      if (round.markets.some((item) => item.market.status !== MarketStatus.SETTLED && item.marketId !== market.id)) continue;
      const winners = round.entries.filter((entry) => entry.legs.every((leg) => leg.status === ParlayLegStatus.WON));
      const pool = calculateParlayPool({
        basePool: round.basePool,
        carryover: round.carryover,
        ticketStake: round.ticketStake,
        ticketPoolBonusBps: round.ticketPoolBonusBps,
        entryCount: round.entries.length,
      });
      const payoutEach = winners.length > 0 ? Math.floor(pool / winners.length) : 0;
      for (const entry of round.entries) {
        const won = winners.some((winner) => winner.id === entry.id);
        if (won) {
          const wallet = await tx.wallet.findUniqueOrThrow({
            where: { userId_asset: { userId: entry.userId, asset: AssetType.BET_COIN } },
          });
          const balanceAfter = wallet.balance + payoutEach;
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: balanceAfter, version: { increment: 1 } },
          });
          await tx.ledgerEntry.create({
            data: {
              walletId: wallet.id,
              amount: payoutEach,
              balanceAfter,
              reason: LedgerReason.PARLAY_PRIZE,
              reference: `parlay:${entry.id}`,
              note: `${round.scope === ParlayScope.WEEKLY_A ? "本周 A 组串关" : round.scope === ParlayScope.WEEKLY_B ? "本周 B 组串关" : round.scope === ParlayScope.WEEKLY ? "本周串关" : `${round.dayKey} 今日过关`}奖励`,
            },
          });
        }
        await tx.parlayEntry.update({
          where: { id: entry.id },
          data: { status: won ? ParlayEntryStatus.WON : ParlayEntryStatus.LOST, payout: won ? payoutEach : 0, settledAt: new Date() },
        });
      }
      if (winners.length === 0) {
        const carryoverIncrease = round.entries.length * ticketPoolContribution(round.ticketStake, round.ticketPoolBonusBps);
        const poolField = round.scope === ParlayScope.WEEKLY_B
          ? "weeklyBBasePool"
          : round.scope === ParlayScope.WEEKLY_A || round.scope === ParlayScope.WEEKLY
            ? "weeklyBasePool"
          : round.markets.length <= 3
            ? "basePool"
            : round.markets.length === 4
              ? "basePool4"
              : round.markets.length === 5
                ? "basePool5"
                : "basePool6Plus";
        await tx.parlayConfig.update({
          where: { id: "default" },
          data: { [poolField]: { increment: carryoverIncrease } },
        });
      }
      await tx.parlayRound.update({
        where: { id: round.id },
        data: { status: ParlayRoundStatus.SETTLED, settledAt: new Date() },
      });
    }
    return {
      totalPool,
      winnerPool,
      settledBets: market.bets.length,
      pointRewardRecipients: pointRewardRecipientIds.size,
      totalPointRewards,
    };
  });
}
