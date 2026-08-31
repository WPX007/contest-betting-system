import { NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const marketId = new URL(request.url).searchParams.get("marketId") ?? undefined;
    const bets = await prisma.bet.findMany({
      where: marketId ? { marketId } : undefined,
      include: { user: { include: { team: true } }, option: true, market: { include: { match: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      data: bets.map((bet) => ({
        id: bet.id,
        marketId: bet.marketId,
        week: bet.market.match.weekNumber,
        userId: bet.userId,
        userName: bet.user.name,
        username: bet.user.username,
        team: bet.user.team?.name ?? "无",
        optionId: bet.optionId,
        optionLabel: bet.option.label,
        amount: bet.stake,
        createdAt: bet.createdAt.toISOString(),
        recordStatus: bet.status === "REFUNDED" ? "REFUNDED" : "ACTIVE",
        status: bet.status,
        payout: bet.payout,
      })),
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取下注明细失败" }, { status: 500 });
  }
}
