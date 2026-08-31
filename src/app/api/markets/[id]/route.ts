import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth/session";
import { getMarket } from "@/lib/services/market-service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await context.params;
    const market = await getMarket(id);
    if (!market) return NextResponse.json({ error: "盘口不存在" }, { status: 404 });
    return NextResponse.json({ data: market, meta: { serverTime: new Date().toISOString() } });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取盘口失败" }, { status: 500 });
  }
}
