import { NextResponse } from "next/server";
import { z } from "zod";
import { RechargeStatus, UserRole } from "@/generated/prisma/enums";
import { authErrorResponse, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { rechargeCreditedAmount, rechargePlan } from "@/lib/recharge-plans";

const rechargeSchema = z.object({
  baseAmount: z.number().int().positive(),
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
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const requests = await prisma.rechargeRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      data: requests.map(rechargeView),
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取充值申请失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (user.role === UserRole.OPS_ADMIN || user.role === UserRole.SUPER_ADMIN || user.role === UserRole.SCOREKEEPER) {
      return NextResponse.json({ error: "赛事管理账号不能提交充值申请" }, { status: 403 });
    }
    const input = rechargeSchema.parse(await request.json());
    const plan = rechargePlan(input.baseAmount);
    if (!plan) return NextResponse.json({ error: "请选择系统提供的固定充值套餐" }, { status: 400 });
    const recharge = await prisma.$transaction(async (tx) => {
      const [pending, completedForTier] = await Promise.all([
        tx.rechargeRequest.findFirst({
          where: { userId: user.id, status: { in: [RechargeStatus.PENDING, RechargeStatus.FIRST_CONFIRMED] } },
        }),
        tx.rechargeRequest.findFirst({
          where: {
            userId: user.id,
            baseAmount: plan.baseAmount,
            status: RechargeStatus.COMPLETED,
          },
        }),
      ]);
      if (pending) throw new Error("已有待审核的充值申请，请等待管理员处理");
      const isFirstRecharge = completedForTier === null;
      return tx.rechargeRequest.create({
        data: {
          userId: user.id,
          baseAmount: plan.baseAmount,
          bonusAmount: plan.bonusAmount,
          priceMier: plan.priceMier,
          amount: rechargeCreditedAmount(plan, isFirstRecharge),
        },
      });
    });
    return NextResponse.json({
      data: rechargeView(recharge),
    }, { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "请选择有效的充值套餐" }, { status: 400 });
    if (error instanceof Error && error.message === "已有待审核的充值申请，请等待管理员处理") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: "提交充值申请失败" }, { status: 400 });
  }
}
