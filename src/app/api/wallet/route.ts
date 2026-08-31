import { NextResponse } from "next/server";
import { AssetType } from "@/generated/prisma/enums";
import { authErrorResponse, requireUser } from "@/lib/auth/session";
import { getHouseTreasury } from "@/lib/services/house-wallet";

export async function GET() {
  try {
    const user = await requireUser();
    const balance = user.wallets.find((wallet) => wallet.asset === AssetType.BET_COIN)?.balance ?? 0;
    const points = user.wallets.find((wallet) => wallet.asset === AssetType.POINT)?.balance ?? 0;
    const isAdmin = user.role === "OPS_ADMIN" || user.role === "SUPER_ADMIN";
    const treasury = isAdmin ? await getHouseTreasury() : null;
    return NextResponse.json({
      data: {
        balance: treasury?.total ?? balance,
        points,
        treasury,
      },
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取钱包失败" }, { status: 500 });
  }
}
