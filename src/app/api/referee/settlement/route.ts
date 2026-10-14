import { NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@/generated/prisma/enums";
import { authErrorResponse, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { closeDueMarkets } from "@/lib/services/market-service";
import { settleMarket } from "@/lib/services/settlement-service";

const settlementSchema = z.object({
  marketId: z.string().min(1),
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!user.isReferee && user.role !== UserRole.SCOREKEEPER) {
      return NextResponse.json({ error: "只有已授予裁判权限的人员可以结算比赛" }, { status: 403 });
    }
    const input = settlementSchema.parse(await request.json());
    await closeDueMarkets();
    const result = await settleMarket(input);
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "MARKET_SETTLE_REFEREE",
        target: input.marketId,
        after: JSON.stringify(input),
      },
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "请填写有效的比赛比分" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "比赛结算失败" }, { status: 400 });
  }
}
