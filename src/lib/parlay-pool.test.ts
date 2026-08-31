import { describe, expect, it } from "vitest";
import { basePoolForMarketCount, calculateParlayPool, ticketPoolContribution } from "./parlay-pool";

const pools = { three: 30_000, four: 40_000, five: 50_000, sixPlus: 60_000 };

describe("parlay pool rules", () => {
  it("selects a base pool by match count", () => {
    expect(basePoolForMarketCount(pools, 3)).toBe(30_000);
    expect(basePoolForMarketCount(pools, 4)).toBe(40_000);
    expect(basePoolForMarketCount(pools, 5)).toBe(50_000);
    expect(basePoolForMarketCount(pools, 6)).toBe(60_000);
    expect(basePoolForMarketCount(pools, 12)).toBe(60_000);
  });

  it("adds the ticket face value plus its configured bonus", () => {
    expect(ticketPoolContribution(100, 5_000)).toBe(150);
    expect(calculateParlayPool({
      basePool: 50_000,
      carryover: 0,
      ticketStake: 100,
      ticketPoolBonusBps: 5_000,
      entryCount: 2,
    })).toBe(50_300);
  });
});
