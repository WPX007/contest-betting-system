const GAME_WIN_POINTS = 10;
const SERIES_WIN_POINTS = 20;
const ALLIANCE_GAME_WIN_POINTS = 5;

export function calculateMatchPointRewards(homeScore: number, awayScore: number) {
  const homeSeriesWin = homeScore > awayScore;
  const awaySeriesWin = awayScore > homeScore;
  return {
    home: {
      gameWins: homeScore,
      seriesWin: homeSeriesWin,
      points: homeScore * GAME_WIN_POINTS + (homeSeriesWin ? SERIES_WIN_POINTS : 0),
      alliancePoints: homeScore * ALLIANCE_GAME_WIN_POINTS,
    },
    away: {
      gameWins: awayScore,
      seriesWin: awaySeriesWin,
      points: awayScore * GAME_WIN_POINTS + (awaySeriesWin ? SERIES_WIN_POINTS : 0),
      alliancePoints: awayScore * ALLIANCE_GAME_WIN_POINTS,
    },
  };
}

export function matchAllianceRewardNote(teamName: string, gameWins: number) {
  return `${teamName} 联姻大组奖励：小局胜场 ${gameWins} × ${ALLIANCE_GAME_WIN_POINTS}`;
}

export function matchPointRewardNote(gameWins: number, seriesWin: boolean) {
  const parts = gameWins > 0 ? [`小局胜场 ${gameWins} × ${GAME_WIN_POINTS}`] : [];
  if (seriesWin) parts.push(`系列赛胜利 +${SERIES_WIN_POINTS}`);
  return parts.join("，") || "无点券奖励";
}
