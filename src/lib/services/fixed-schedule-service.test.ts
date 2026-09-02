import { describe, expect, it } from "vitest";
import { REGULAR_SEASON_WEEKS, roundRobinPairings } from "../fixed-schedule";

describe("fixed regular-season schedule", () => {
  it("creates six unique pairings per week and every pair meets once", () => {
    const teams = Array.from({ length: 12 }, (_, index) => `team-${index + 1}`);
    const allPairs = new Set<string>();
    for (let week = 1; week <= REGULAR_SEASON_WEEKS; week += 1) {
      const pairings = roundRobinPairings(teams, week);
      expect(pairings).toHaveLength(6);
      expect(new Set(pairings.flatMap((pairing) => [pairing.homeTeamId, pairing.awayTeamId])).size).toBe(12);
      for (const pairing of pairings) {
        allPairs.add([pairing.homeTeamId, pairing.awayTeamId].sort().join(":"));
      }
    }
    expect(allPairs.size).toBe(66);
  });
});
