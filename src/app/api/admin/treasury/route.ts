import { NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth/session";
import { getHouseTreasuryDetails } from "@/lib/services/house-wallet";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ data: await getHouseTreasuryDetails() });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取后台净额明细失败" }, { status: 500 });
  }
}
