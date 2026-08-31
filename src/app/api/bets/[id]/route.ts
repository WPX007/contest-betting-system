import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const order = await prisma.bet.findFirst({
      where: { id, userId: user.id },
      include: {
        option: true,
        market: { include: { match: { include: { homeTeam: true, awayTeam: true } } } },
      },
    });
    if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    return NextResponse.json({ data: order });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取订单失败" }, { status: 500 });
  }
}
