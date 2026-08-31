import { describe, expect, it } from "vitest";
import { calculateMatchPointRewards } from "./match-point-rewards";

describe("match point rewards", () => {
  it("awards each small-game win plus the BO winner bonus", () => {
    expect(calculateMatchPointRewards(2, 0)).toEqual({
      home: { gameWins: 2, seriesWin: true, points: 40, alliancePoints: 10 },
      away: { gameWins: 0, seriesWin: false, points: 0, alliancePoints: 0 },
    });
  });

  it("awards only small-game wins for a draw", () => {
    expect(calculateMatchPointRewards(1, 1)).toEqual({
      home: { gameWins: 1, seriesWin: false, points: 10, alliancePoints: 5 },
      away: { gameWins: 1, seriesWin: false, points: 10, alliancePoints: 5 },
    });
  });
});
