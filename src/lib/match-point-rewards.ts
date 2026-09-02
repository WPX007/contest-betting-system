export type MatchPointRewardConfig = {
  smallGameWinPoints: number;
  allianceGameWinPoints: number;
  seriesWinPoints: number;
};

export const DEFAULT_MATCH_POINT_REWARDS: MatchPointRewardConfig = {
  smallGameWinPoints: 10,
  allianceGameWinPoints: 5,
  seriesWinPoints: 20,
};

export function calculateMatchPointRewards(
  homeScore: number,
  awayScore: number,
  config: MatchPointRewardConfig = DEFAULT_MATCH_POINT_REWARDS,
) {
  const homeSeriesWin = homeScore > awayScore;
  const awaySeriesWin = awayScore > homeScore;
  return {
    home: {
      gameWins: homeScore,
      seriesWin: homeSeriesWin,
      points: homeScore * config.smallGameWinPoints + (homeSeriesWin ? config.seriesWinPoints : 0),
      alliancePoints: homeScore * config.allianceGameWinPoints,
    },
    away: {
      gameWins: awayScore,
      seriesWin: awaySeriesWin,
      points: awayScore * config.smallGameWinPoints + (awaySeriesWin ? config.seriesWinPoints : 0),
      alliancePoints: awayScore * config.allianceGameWinPoints,
    },
  };
}

export function matchAllianceRewardNote(teamName: string, gameWins: number, pointsPerWin: number) {
  return `${teamName} 联姻大组奖励：小局胜场 ${gameWins} × ${pointsPerWin}`;
}

export function matchPointRewardNote(gameWins: number, seriesWin: boolean, config: MatchPointRewardConfig) {
  const parts = gameWins > 0 ? [`小局胜场 ${gameWins} × ${config.smallGameWinPoints}`] : [];
  if (seriesWin) parts.push(`BO2/BO3 胜利 +${config.seriesWinPoints}`);
  return parts.join("，") || "无点券奖励";
}
