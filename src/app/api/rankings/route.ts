import { NextResponse } from "next/server";
import { AssetType, BetStatus, UserRole } from "@/generated/prisma/enums";
import { authErrorResponse, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireUser();
    const users = await prisma.user.findMany({
      where: { role: { in: [UserRole.VIEWER, UserRole.PLAYER, UserRole.CAPTAIN] } },
      include: {
        team: true,
        wallets: true,
        bets: {
          where: { status: { in: [BetStatus.ACTIVE, BetStatus.SETTLED] } },
          include: { option: true },
        },
      },
    });
    const data = users.map((user) => {
      const settled = user.bets.filter((bet) => bet.status === BetStatus.SETTLED);
      const hits = settled.filter((bet) => bet.option.isWinner).length;
      const predictions = user.bets.length;
      return {
        id: user.id,
        name: user.name,
        username: user.username,
        team: user.team?.name ?? "无",
        value: user.wallets.find((wallet) => wallet.asset === AssetType.BET_COIN)?.balance ?? 0,
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
