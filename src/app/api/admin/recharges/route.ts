import { NextResponse } from "next/server";
import { z } from "zod";
import { AssetType, LedgerReason, RechargeStatus } from "@/generated/prisma/enums";
import { authErrorResponse, requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const actionSchema = z.object({
  rechargeId: z.string().min(1),
  action: z.enum(["FIRST_CONFIRM", "FINAL_CONFIRM", "ONE_CLICK_CONFIRM", "REJECT"]),
});

function rechargeView(request: {
  id: string;
  amount: number;
  baseAmount: number;
  bonusAmount: number;
  priceMier: number;
  status: RechargeStatus;
  createdAt: Date;
  firstConfirmedAt: Date | null;
  completedAt: Date | null;
  user: { id: string; name: string; username: string; team: { name: string } | null };
  firstConfirmedBy: { name: string } | null;
  completedBy: { name: string } | null;
}) {
  const baseAmount = request.baseAmount || request.amount;
  const firstRechargeBonus = Math.max(0, request.amount - baseAmount - request.bonusAmount);
  return {
    id: request.id,
    amount: request.amount,
    baseAmount,
    bonusAmount: request.bonusAmount,
    firstRechargeBonus,
    isFirstRecharge: firstRechargeBonus > 0,
    priceMier: request.priceMier || baseAmount / 50,
    status: request.status,
    createdAt: request.createdAt.toISOString(),
    firstConfirmedAt: request.firstConfirmedAt?.toISOString() ?? null,
    completedAt: request.completedAt?.toISOString() ?? null,
    user: {
      id: request.user.id,
      name: request.user.name,
      username: request.user.username,
      team: request.user.team?.name ?? "无",
    },
    firstConfirmedBy: request.firstConfirmedBy?.name ?? null,
    completedBy: request.completedBy?.name ?? null,
  };
}

export async function GET() {
  try {
    await requireAdmin();
    const [requests, total] = await Promise.all([
      prisma.rechargeRequest.findMany({
        include: {
          user: { include: { team: true } },
          firstConfirmedBy: true,
          completedBy: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.rechargeRequest.aggregate({
        where: { status: RechargeStatus.COMPLETED },
        _sum: { amount: true },
      }),
    ]);
    return NextResponse.json({
      data: {
        totalCompletedAmount: total._sum.amount ?? 0,
        pendingCount: requests.filter((request) => request.status === RechargeStatus.PENDING || request.status === RechargeStatus.FIRST_CONFIRMED).length,
        requests: requests.map(rechargeView),
      },
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取充值审核失败" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const input = actionSchema.parse(await request.json());
    const result = await prisma.$transaction(async (tx) => {
      const recharge = await tx.rechargeRequest.findUniqueOrThrow({
        where: { id: input.rechargeId },
        include: { user: { include: { team: true } }, firstConfirmedBy: true, completedBy: true },
      });
      const completeRecharge = async (oneClick: boolean) => {
        const completedAt = new Date();
        const claimed = await tx.rechargeRequest.updateMany({
          where: {
            id: recharge.id,
            status: oneClick ? RechargeStatus.PENDING : RechargeStatus.FIRST_CONFIRMED,
          },
          data: {
            status: RechargeStatus.COMPLETED,
            firstConfirmedById: oneClick ? admin.id : undefined,
            firstConfirmedAt: oneClick ? completedAt : undefined,
            completedById: admin.id,
            completedAt,
          },
        });
        if (claimed.count !== 1) throw new Error("该充值申请已被其他管理员处理");
        const wallet = await tx.wallet.findUniqueOrThrow({
          where: { userId_asset: { userId: recharge.userId, asset: AssetType.BET_COIN } },
        });
        const balanceAfter = wallet.balance + recharge.amount;
        const baseAmount = recharge.baseAmount || recharge.amount;
        const firstRechargeBonus = Math.max(0, recharge.amount - baseAmount - recharge.bonusAmount);
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: balanceAfter, version: { increment: 1 } },
        });
        await tx.ledgerEntry.create({
          data: {
            walletId: wallet.id,
            amount: recharge.amount,
            balanceAfter,
            reason: LedgerReason.RECHARGE,
            reference: `recharge:${recharge.id}`,
            note: `充值套餐 ${baseAmount} + 档位赠送 ${recharge.bonusAmount}${firstRechargeBonus > 0 ? ` + 首充双倍奖励 ${firstRechargeBonus}` : ""} 竞猜币`,
          },
        });
        const updated = await tx.rechargeRequest.findUniqueOrThrow({
          where: { id: recharge.id },
          include: { user: { include: { team: true } }, firstConfirmedBy: true, completedBy: true },
        });
        await tx.auditLog.create({
          data: {
            actorId: admin.id,
            action: oneClick ? "RECHARGE_ONE_CLICK_CONFIRM" : "RECHARGE_FINAL_CONFIRM",
            target: recharge.id,
            after: JSON.stringify({ amount: recharge.amount, userId: recharge.userId }),
          },
        });
        return updated;
      };
      if (input.action === "ONE_CLICK_CONFIRM") {
        if (recharge.status !== RechargeStatus.PENDING) throw new Error("只有待首次确认的申请可以一键审核");
        return completeRecharge(true);
      }
      if (input.action === "FIRST_CONFIRM") {
        if (recharge.status !== RechargeStatus.PENDING) throw new Error("该申请不在首次确认阶段");
        const updated = await tx.rechargeRequest.update({
          where: { id: recharge.id },
          data: { status: RechargeStatus.FIRST_CONFIRMED, firstConfirmedById: admin.id, firstConfirmedAt: new Date() },
          include: { user: { include: { team: true } }, firstConfirmedBy: true, completedBy: true },
        });
        await tx.auditLog.create({
          data: { actorId: admin.id, action: "RECHARGE_FIRST_CONFIRM", target: recharge.id, after: JSON.stringify({ amount: recharge.amount, userId: recharge.userId }) },
        });
        return updated;
      }
      if (input.action === "FINAL_CONFIRM") {
        if (recharge.status !== RechargeStatus.FIRST_CONFIRMED) throw new Error("请先完成首次确认");
        return completeRecharge(false);
      }
      if (recharge.status !== RechargeStatus.PENDING && recharge.status !== RechargeStatus.FIRST_CONFIRMED) {
        throw new Error("该申请已处理，不能驳回");
      }
      const updated = await tx.rechargeRequest.update({
        where: { id: recharge.id },
        data: { status: RechargeStatus.REJECTED, rejectedAt: new Date() },
        include: { user: { include: { team: true } }, firstConfirmedBy: true, completedBy: true },
      });
      await tx.auditLog.create({
        data: { actorId: admin.id, action: "RECHARGE_REJECT", target: recharge.id, after: JSON.stringify({ amount: recharge.amount, userId: recharge.userId }) },
      });
      return updated;
    });
    return NextResponse.json({ data: rechargeView(result) });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "充值审核参数错误" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "充值审核失败" }, { status: 400 });
  }
}
