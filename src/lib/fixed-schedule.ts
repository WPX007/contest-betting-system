export const REGULAR_SEASON_WEEKS = 11;
export const TEAMS_PER_TRACK = 12;
export const MATCHES_PER_TRACK_WEEK = TEAMS_PER_TRACK / 2;

export function fixedScheduleSlotPlan(existing: Array<{ id: string; slotIndex: number | null }>) {
  if (existing.length > MATCHES_PER_TRACK_WEEK) throw new Error(`每周每赛道最多 ${MATCHES_PER_TRACK_WEEK} 场比赛`);
  const usedSlots = new Set<number>();
  for (const match of existing) {
    if (match.slotIndex === null) continue;
    if (match.slotIndex < 1 || match.slotIndex > MATCHES_PER_TRACK_WEEK || usedSlots.has(match.slotIndex)) {
      throw new Error("固定赛程存在无效或重复的场次序号");
    }
    usedSlots.add(match.slotIndex);
  }
  const availableSlots = Array.from({ length: MATCHES_PER_TRACK_WEEK }, (_, index) => index + 1).filter((slot) => !usedSlots.has(slot));
  const assignments = existing
    .filter((match) => match.slotIndex === null)
    .map((match) => ({ id: match.id, slotIndex: availableSlots.shift()! }));
  return { assignments, missingSlots: availableSlots };
}

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
