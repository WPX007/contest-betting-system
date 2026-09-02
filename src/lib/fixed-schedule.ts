export const REGULAR_SEASON_WEEKS = 11;
export const TEAMS_PER_TRACK = 12;

export function roundRobinPairings(teamIds: string[], week: number) {
  if (teamIds.length !== TEAMS_PER_TRACK) throw new Error(`每个赛道必须正好有 ${TEAMS_PER_TRACK} 支队伍`);
  if (!Number.isInteger(week) || week < 1 || week > REGULAR_SEASON_WEEKS) throw new Error("常规赛周次必须在 1 到 11 之间");
  let rotated = [...teamIds];
  for (let round = 1; round < week; round += 1) {
    rotated = [rotated[0], rotated[rotated.length - 1], ...rotated.slice(1, -1)];
  }
  return Array.from({ length: TEAMS_PER_TRACK / 2 }, (_, index) => ({
    homeTeamId: rotated[index],
    awayTeamId: rotated[rotated.length - 1 - index],
    slotIndex: index + 1,
  }));
}
