import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth/session";
import { listMarkets } from "@/lib/services/market-service";

export async function GET(request: Request) {
  try {
    await requireUser();
    const weekText = new URL(request.url).searchParams.get("week");
    const week = weekText ? Number(weekText) : undefined;
    const data = await listMarkets(Number.isInteger(week) ? week : undefined);
    return NextResponse.json({ data, meta: { serverTime: new Date().toISOString() } });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取赛程失败" }, { status: 500 });
  }
}
