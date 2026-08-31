export const RECHARGE_BASE_AMOUNTS = [1_000, 2_000, 4_000, 5_000, 10_000, 20_000] as const;
export const RECHARGE_BONUS_PERCENT: Record<number, number> = {
  1_000: 10,
  2_000: 10,
  4_000: 11,
  5_000: 12,
  10_000: 14,
  20_000: 16,
};

export type RechargePlan = {
  baseAmount: number;
  bonusPercent: number;
  bonusAmount: number;
  creditedAmount: number;
  priceMier: number;
};

export function rechargePlan(baseAmount: number): RechargePlan | null {
  if (!(RECHARGE_BASE_AMOUNTS as readonly number[]).includes(baseAmount)) return null;
  const bonusPercent = RECHARGE_BONUS_PERCENT[baseAmount];
  const bonusAmount = Math.floor(baseAmount * bonusPercent / 100);
  return {
    baseAmount,
    bonusPercent,
    bonusAmount,
    creditedAmount: baseAmount + bonusAmount,
    priceMier: baseAmount / 50,
  };
}

export function rechargeCreditedAmount(plan: RechargePlan, isFirstRecharge: boolean) {
  return plan.creditedAmount + (isFirstRecharge ? plan.baseAmount : 0);
}

export const RECHARGE_PLANS = RECHARGE_BASE_AMOUNTS.map((amount) => rechargePlan(amount)!);
