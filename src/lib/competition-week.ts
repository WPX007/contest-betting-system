export const COMPETITION_START = new Date("2026-07-27T00:00:00+08:00");
export const COMPETITION_WEEK_COUNT = 15;

export function currentCompetitionWeek(now = new Date()) {
  const week = Math.floor((now.getTime() - COMPETITION_START.getTime()) / (7 * 86_400_000)) + 1;
  return Math.min(COMPETITION_WEEK_COUNT, Math.max(1, week));
}

export function weeklyParlayKey(week: number, track?: "A" | "B") {
  return `week-${week}${track ? `-${track}` : ""}`;
}
