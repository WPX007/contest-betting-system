import { NextResponse } from "next/server";
import { z } from "zod";
import { AssetType, LedgerReason, UserRole } from "@/generated/prisma/enums";
import { authErrorResponse, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const POINT_TO_COIN_RATE = 5;

const exchangeSchema = z.object({
  points: z.number().int().min(1).max(100_000_000),
  idempotencyKey: z.string().min(8).max(100),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (user.role === UserRole.OPS_ADMIN || user.role === UserRole.SUPER_ADMIN || user.role === UserRole.SCOREKEEPER) {
      return NextResponse.json({ error: "赛事管理账号不能兑换点券" }, { status: 403 });
    }
    const input = exchangeSchema.parse(await request.json());
    const coins = input.points * POINT_TO_COIN_RATE;
    const result = await prisma.$transaction(async (tx) => {
      const reference = `point-exchange:${user.id}:${input.idempotencyKey}`;
      const [pointWallet, coinWallet, existing] = await Promise.all([
        tx.wallet.findUniqueOrThrow({
          where: { userId_asset: { userId: user.id, asset: AssetType.POINT } },
        }),
        tx.wallet.findUniqueOrThrow({
          where: { userId_asset: { userId: user.id, asset: AssetType.BET_COIN } },
        }),
        tx.ledgerEntry.findFirst({ where: { reference: `${reference}:coin` } }),
      ]);
      if (existing) {
        return {
          pointsSpent: input.points,
          coinsReceived: coins,
          pointsBalance: pointWallet.balance,
          coinBalance: coinWallet.balance,
        };
      }
      if (pointWallet.balance < input.points) throw new Error("点券余额不足");

      const pointsBalance = pointWallet.balance - input.points;
      const coinBalance = coinWallet.balance + coins;
      await tx.wallet.update({
        where: { id: pointWallet.id },
        data: { balance: pointsBalance, version: { increment: 1 } },
      });
      await tx.wallet.update({
        where: { id: coinWallet.id },
        data: { balance: coinBalance, version: { increment: 1 } },
      });
      await tx.ledgerEntry.create({
        data: {
          walletId: pointWallet.id,
          amount: -input.points,
          balanceAfter: pointsBalance,
          reason: LedgerReason.POINT_EXCHANGE,
          reference: `${reference}:point`,
          note: `${input.points} 点券兑换 ${coins} 竞猜币`,
        },
      });
      await tx.ledgerEntry.create({
        data: {
          walletId: coinWallet.id,
          amount: coins,
          balanceAfter: coinBalance,
          reason: LedgerReason.POINT_EXCHANGE,
          reference: `${reference}:coin`,
          note: `${input.points} 点券兑换 ${coins} 竞猜币`,
        },
      });
      return {
        pointsSpent: input.points,
        coinsReceived: coins,
        pointsBalance,
        coinBalance,
      };
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "请输入有效的点券数量" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "点券兑换失败" }, { status: 400 });
  }
}
