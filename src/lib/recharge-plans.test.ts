import { describe, expect, it } from "vitest";
import { RECHARGE_PLANS, rechargeCreditedAmount, rechargePlan } from "./recharge-plans";

describe("recharge plans", () => {
  it("applies the configured tier bonuses and converts at fifty coins per mier", () => {
    expect(rechargePlan(1_000)).toEqual({
      baseAmount: 1_000,
      bonusPercent: 10,
      bonusAmount: 100,
      creditedAmount: 1_100,
      priceMier: 20,
    });
    expect(RECHARGE_PLANS.map((plan) => [plan.baseAmount, plan.bonusPercent, plan.bonusAmount, plan.creditedAmount])).toEqual([
      [1_000, 10, 100, 1_100],
      [2_000, 10, 200, 2_200],
      [4_000, 11, 440, 4_440],
      [5_000, 12, 600, 5_600],
      [10_000, 14, 1_400, 11_400],
      [20_000, 16, 3_200, 23_200],
    ]);
    expect(RECHARGE_PLANS).toHaveLength(6);
  });

  it("rejects custom recharge amounts", () => {
    expect(rechargePlan(3_000)).toBeNull();
  });

  it("doubles only the base amount on the first recharge", () => {
    const plan = rechargePlan(10_000)!;
    expect(rechargeCreditedAmount(plan, true)).toBe(21_400);
    expect(rechargeCreditedAmount(plan, false)).toBe(11_400);
  });
});
