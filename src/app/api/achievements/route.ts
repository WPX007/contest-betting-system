import { NextResponse } from "next/server";
import { AssetType, BetStatus, MarketStatus, ParlayEntryStatus, ParlayScope, UserRole } from "@/generated/prisma/enums";
import { authErrorResponse, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

type Candidate = {
  id: string;
  name: string;
  username: string;
  team: string;
  coins: number;
  points: number;
  totalValue: number;
  settledBets: number;
  hits: number;
  hitRate: number;
};

const holderView = (candidate: Candidate, detail: string) => ({
  id: candidate.id,
  name: candidate.name,
  username: candidate.username,
  team: candidate.team,
  detail,
});

export async function GET() {
  try {
    await requireUser();
    const [users, settledMarketCount] = await Promise.all([
      prisma.user.findMany({
        where: { role: { in: [UserRole.VIEWER, UserRole.PLAYER, UserRole.CAPTAIN] } },
        include: {
          team: true,
          wallets: true,
          bets: {
            where: { status: BetStatus.SETTLED },
            include: { option: true },
          },
          parlayEntries: {
            where: {
              status: ParlayEntryStatus.WON,
              round: { scope: { in: [ParlayScope.WEEKLY_A, ParlayScope.WEEKLY_B] } },
            },
            select: { id: true },
          },
        },
      }),
      prisma.market.count({ where: { status: MarketStatus.SETTLED } }),
    ]);

    const candidates: Array<Candidate & { maxWinningStake: number; weeklyTrackWins: number }> = users.map((user) => {
      const coins = user.wallets.find((wallet) => wallet.asset === AssetType.BET_COIN)?.balance ?? 0;
      const points = user.wallets.find((wallet) => wallet.asset === AssetType.POINT)?.balance ?? 0;
      const settledMarketIds = new Set(user.bets.map((bet) => bet.marketId));
      const hitMarketIds = new Set(user.bets.filter((bet) => bet.option.isWinner).map((bet) => bet.marketId));
      const hits = hitMarketIds.size;
      const settledBets = settledMarketIds.size;
      return {
        id: user.id,
        name: user.name,
        username: user.username,
        team: user.team?.name ?? "无",
        coins,
        points,
        totalValue: coins / 50 + points / 10,
        settledBets,
        hits,
        hitRate: settledBets > 0 ? hits / settledBets : 0,
        maxWinningStake: user.bets.reduce((maximum, bet) => bet.option.isWinner ? Math.max(maximum, bet.stake) : maximum, 0),
        weeklyTrackWins: user.parlayEntries.length,
      };
    });
    const byCoins = [...candidates].sort((first, second) => second.coins - first.coins || second.points - first.points || first.name.localeCompare(second.name, "zh-CN"));
    const minimumPredictions = settledMarketCount > 0 ? Math.ceil(settledMarketCount / 2) : 0;
    const rateEligible = minimumPredictions > 0 ? candidates.filter((candidate) => candidate.settledBets >= minimumPredictions) : [];
    const highestRate = rateEligible.length > 0 ? Math.max(...rateEligible.map((candidate) => candidate.hitRate)) : null;
    const lowestRate = rateEligible.length > 0 ? Math.min(...rateEligible.map((candidate) => candidate.hitRate)) : null;
    const maxWinningStake = candidates.length > 0 ? Math.max(...candidates.map((candidate) => candidate.maxWinningStake)) : 0;
    const maxTotalValue = candidates.length > 0 ? Math.max(...candidates.map((candidate) => candidate.totalValue)) : 0;

    const achievements = [
      {
        key: "GAMBLING_GOD",
        title: "赌神",
        requirement: "竞猜币余额排名第 1",
        holders: byCoins[0] ? [holderView(byCoins[0], `${byCoins[0].coins.toLocaleString("zh-CN")} 竞猜币`)] : [],
      },
      {
        key: "GAMBLING_SAINT",
        title: "赌圣",
        requirement: "竞猜币余额排名第 2",
        holders: byCoins[1] ? [holderView(byCoins[1], `${byCoins[1].coins.toLocaleString("zh-CN")} 竞猜币`)] : [],
      },
      {
        key: "GAMBLING_HERO",
        title: "赌侠",
        requirement: "竞猜币余额排名第 3",
        holders: byCoins[2] ? [holderView(byCoins[2], `${byCoins[2].coins.toLocaleString("zh-CN")} 竞猜币`)] : [],
      },
      {
        key: "PROPHET",
        title: "预言帝",
        requirement: `命中率最高，且至少参与 ${minimumPredictions} 场已结算比赛竞猜（当前总场次的一半）`,
        holders: highestRate === null ? [] : rateEligible.filter((candidate) => candidate.hitRate === highestRate).map((candidate) => holderView(candidate, `${candidate.hits}/${candidate.settledBets} · ${(candidate.hitRate * 100).toFixed(1)}%`)),
      },
      {
        key: "TOXIC_MILK",
        title: "毒奶王",
        requirement: `命中率最低，且至少参与 ${minimumPredictions} 场已结算比赛竞猜（当前总场次的一半）`,
        holders: lowestRate === null ? [] : rateEligible.filter((candidate) => candidate.hitRate === lowestRate).map((candidate) => holderView(candidate, `${candidate.hits}/${candidate.settledBets} · ${(candidate.hitRate * 100).toFixed(1)}%`)),
      },
      {
        key: "ALL_IN_WARRIOR",
        title: "一掷千金",
        requirement: "已结算且命中的单笔下注金额最大",
        holders: maxWinningStake <= 0 ? [] : candidates.filter((candidate) => candidate.maxWinningStake === maxWinningStake).map((candidate) => holderView(candidate, `最大命中单笔 ${maxWinningStake.toLocaleString("zh-CN")} 竞猜币`)),
      },
      {
        key: "PARLAY_MASTER",
        title: "闯关达人",
        requirement: "成功完成至少 1 次本周 A 组或 B 组过关",
        holders: candidates.filter((candidate) => candidate.weeklyTrackWins > 0).map((candidate) => holderView(candidate, `成功 ${candidate.weeklyTrackWins} 次`)),
      },
      {
        key: "WEALTH_MASTER",
        title: "财富达人",
        requirement: "总价值排名第 1（竞猜币 ÷ 50 + 点券 ÷ 10）",
        holders: candidates.filter((candidate) => candidate.totalValue === maxTotalValue).map((candidate) => holderView(candidate, `总价值 ${candidate.totalValue.toFixed(1)}`)),
      },
    ];

    return NextResponse.json({ data: { settledMarketCount, minimumPredictions, achievements } });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取成就奖失败" }, { status: 500 });
  }
}
