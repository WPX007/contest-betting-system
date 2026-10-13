import { NextResponse } from "next/server";
import { AssetType, BetStatus, ParlayEntryStatus, UserRole } from "@/generated/prisma/enums";
import { authErrorResponse, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireUser();
    const [users, teams] = await Promise.all([
      prisma.user.findMany({
        where: { role: { in: [UserRole.VIEWER, UserRole.PLAYER, UserRole.CAPTAIN, UserRole.SCOREKEEPER] } },
        include: {
          team: true,
          wallets: true,
          bets: {
            where: { status: { in: [BetStatus.ACTIVE, BetStatus.SETTLED] } },
            include: { option: true },
          },
          parlayEntries: {
            where: { status: ParlayEntryStatus.ACTIVE },
            select: { stake: true },
          },
        },
      }),
      prisma.team.findMany({ select: { id: true, name: true, allianceKey: true } }),
    ]);
    const data = users.map((user) => {
      const settled = user.bets.filter((bet) => bet.status === BetStatus.SETTLED);
      const hits = settled.filter((bet) => bet.option.isWinner).length;
      const predictions = user.bets.length;
      const availableCoins = user.wallets.find((wallet) => wallet.asset === AssetType.BET_COIN)?.balance ?? 0;
      const pendingSingleStake = user.bets.filter((bet) => bet.status === BetStatus.ACTIVE).reduce((total, bet) => total + bet.stake, 0);
      const pendingParlayStake = user.parlayEntries.reduce((total, entry) => total + entry.stake, 0);
      return {
        id: user.id,
        name: user.name,
        username: user.username,
        team: user.team?.name ?? "无",
        allianceTeams: user.team?.allianceKey
          ? teams.filter((team) => team.allianceKey === user.team?.allianceKey && team.id !== user.teamId).map((team) => team.name).join("、") || "无"
          : "无",
        value: availableCoins + pendingSingleStake + pendingParlayStake,
        points: user.wallets.find((wallet) => wallet.asset === AssetType.POINT)?.balance ?? 0,
        hits,
        predictions,
        rate: predictions > 0 ? Number((hits / predictions * 100).toFixed(1)) : 0,
      };
    }).sort((first, second) => second.value - first.value || second.points - first.points || first.name.localeCompare(second.name, "zh-CN"));
    return NextResponse.json({ data: data.map((entry, index) => ({ ...entry, rank: index + 1 })) });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取排行榜失败" }, { status: 500 });
  }
}
