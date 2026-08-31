import { describe, expect, it } from "vitest";
import { assertBetAllowed, assertSameMarketOption, reconciliation } from "./betting-service";
import { calculateSettlement, isConflicted, validateStake } from "./settlement";

describe("dynamic pool settlement", () => {
  it("uses the approved 25/70/5 distribution", () => {
    expect(
      calculateSettlement({ totalPool: 10_000, winnerPool: 3_000, stake: 100 }),
    ).toEqual({
      returnedStake: 25,
      prize: 233,
      payout: 258,
      recovery: 500,
    });
  });

  it("blocks stakes outside the balance cap", () => {
    expect(validateStake(1_000, 1_001).valid).toBe(false);
    expect(validateStake(1_000, 1_000).valid).toBe(true);
    expect(validateStake(1_000, 300).valid).toBe(true);
    expect(validateStake(1_000, 49).valid).toBe(false);
    expect(validateStake(1_000, 50).valid).toBe(true);
    expect(validateStake(40, 13).valid).toBe(false);
  });

  it("blocks a player from betting their own alliance", () => {
    expect(isConflicted("team-01a", "alliance-01", "team-04a", "team-06a", "alliance-04", "alliance-01")).toBe(true);
    expect(isConflicted("team-01a", "alliance-01", "team-04a", "team-06a", "alliance-04", "alliance-06")).toBe(false);
  });

  it("requires an open market and records no cash exceptions", () => {
    expect(() =>
      assertBetAllowed(
        { marketId: "m1", optionId: "home", stake: 100, idempotencyKey: "7bc1b833-6c7e-47cf-8449-661db52535ce" },
        { userId: "u1", role: "VIEWER", balance: 1000 },
        { id: "m1", status: "OPEN", closesAt: new Date(Date.now() + 60_000), homeTeamId: "a", awayTeamId: "b", homeAllianceKey: "x", awayAllianceKey: "y" },
      ),
    ).not.toThrow();
    expect(reconciliation(10_000, 2_500, 7_000, 500)).toEqual({ isBalanced: true, delta: 0 });
  });

  it("rejects expired markets and administrator bets on the server", () => {
    const input = { marketId: "m1", optionId: "home", stake: 100, idempotencyKey: "7bc1b833-6c7e-47cf-8449-661db52535ce" };
    const market = { id: "m1", status: "OPEN" as const, closesAt: new Date(Date.now() - 1), homeTeamId: "a", awayTeamId: "b", homeAllianceKey: "x", awayAllianceKey: "y" };
    expect(() => assertBetAllowed(input, { userId: "u1", role: "VIEWER", balance: 1000 }, market)).toThrow("该盘口当前不可下注");
    expect(() => assertBetAllowed(input, { userId: "admin", role: "SUPER_ADMIN", balance: 1000 }, { ...market, closesAt: new Date(Date.now() + 60_000) })).toThrow("赛事管理角色不得参与盘口竞猜");
  });

  it("locks a user's first result while allowing top-ups", () => {
    expect(() => assertSameMarketOption([], "home")).not.toThrow();
    expect(() => assertSameMarketOption(["home", "home"], "home")).not.toThrow();
    expect(() => assertSameMarketOption(["home"], "away")).toThrow("同一场比赛只能选择一种结果");
  });
});
