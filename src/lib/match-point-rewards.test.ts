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

  it("uses the configured settlement reward parameters", () => {
    expect(calculateMatchPointRewards(2, 1, {
      smallGameWinPoints: 12,
      allianceGameWinPoints: 7,
      seriesWinPoints: 30,
    })).toEqual({
      home: { gameWins: 2, seriesWin: true, points: 54, alliancePoints: 14 },
      away: { gameWins: 1, seriesWin: false, points: 12, alliancePoints: 7 },
    });
  });
});
