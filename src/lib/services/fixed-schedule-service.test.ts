import { describe, expect, it } from "vitest";
import { fixedScheduleSlotPlan, REGULAR_SEASON_WEEKS, roundRobinPairings } from "../fixed-schedule";

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

  it("repairs legacy slots and only creates the missing fixed matches", () => {
    expect(fixedScheduleSlotPlan([
      { id: "legacy-1", slotIndex: null },
      { id: "legacy-2", slotIndex: 3 },
      { id: "legacy-3", slotIndex: null },
    ])).toEqual({
      assignments: [
        { id: "legacy-1", slotIndex: 1 },
        { id: "legacy-3", slotIndex: 2 },
      ],
      missingSlots: [4, 5, 6],
    });
  });
});
