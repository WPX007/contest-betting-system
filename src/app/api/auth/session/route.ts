import { NextResponse } from "next/server";
import { getCurrentUser, sessionUserView } from "@/lib/auth/session";
import { displayBalanceForUser } from "@/lib/services/house-wallet";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ data: null }, { status: 401 });
  const view = sessionUserView(user);
  return NextResponse.json({ data: { ...view, balance: await displayBalanceForUser(user) } });
}
