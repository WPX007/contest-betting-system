import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authErrorResponse, requireUser } from "@/lib/auth/session";
import { betReceipt, placeBet } from "@/lib/services/bet-service";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const result = await placeBet(user.id, await request.json());
    return NextResponse.json({ data: betReceipt(result) }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    const message = error instanceof Error ? error.message : "请求无效";
    const status = error instanceof ZodError ? 400 : message.includes("余额已发生变化") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
