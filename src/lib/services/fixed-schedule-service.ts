import type { Prisma } from "@/generated/prisma/client";
import { MatchScheduleStatus, MarketStatus, Track } from "@/generated/prisma/enums";
import { fixedScheduleSlotPlan, REGULAR_SEASON_WEEKS, roundRobinPairings, TEAMS_PER_TRACK } from "@/lib/fixed-schedule";
import { prisma } from "@/lib/prisma";

type ScheduleDb = Pick<Prisma.TransactionClient, "team" | "season" | "match" | "market">;

export async function ensureFixedRegularSeasonSchedule(db: ScheduleDb = prisma) {
  const season = await db.season.findFirst({ orderBy: { startsAt: "desc" } });
  if (!season) throw new Error("尚未创建赛事赛季，无法生成固定赛程");

  const teams = await db.team.findMany({
    orderBy: [{ track: "asc" }, { scheduleOrder: "asc" }, { name: "asc" }],
  });
  const teamsByTrack = {
    [Track.A]: teams.filter((team) => team.track === Track.A),
    [Track.B]: teams.filter((team) => team.track === Track.B),
  };
  for (const track of [Track.A, Track.B]) {
    if (teamsByTrack[track].length !== TEAMS_PER_TRACK) {
      throw new Error(`${track} 赛道需要 ${TEAMS_PER_TRACK} 支队伍，当前为 ${teamsByTrack[track].length} 支`);
    }
    for (const [index, team] of teamsByTrack[track].entries()) {
      if (team.scheduleOrder !== index + 1) {
        await db.team.update({ where: { id: team.id }, data: { scheduleOrder: index + 1 } });
      }
    }
  }

  let created = 0;
  let repairedSlots = 0;
  const skipped: Array<{ week: number; track: Track; existing: number }> = [];
  for (let week = 1; week <= REGULAR_SEASON_WEEKS; week += 1) {
    for (const track of [Track.A, Track.B]) {
      const existing = await db.match.findMany({
        where: { seasonId: season.id, weekNumber: week, track },
        select: { id: true, slotIndex: true },
        orderBy: { createdAt: "asc" },
      });
      const plan = fixedScheduleSlotPlan(existing);
      for (const assignment of plan.assignments) {
        await db.match.update({ where: { id: assignment.id }, data: { slotIndex: assignment.slotIndex } });
        repairedSlots += 1;
      }
      const pairings = roundRobinPairings(teamsByTrack[track].map((team) => team.id), week);
      for (const slotIndex of plan.missingSlots) {
        const pairing = pairings[slotIndex - 1];
        await db.match.create({
          data: {
            seasonId: season.id,
            weekNumber: week,
            track,
            bestOf: 2,
            slotIndex,
            homeTeamId: pairing.homeTeamId,
            awayTeamId: pairing.awayTeamId,
            scheduleStatus: MatchScheduleStatus.UNSET,
          },
        });
        created += 1;
      }
      if (plan.missingSlots.length === 0 && plan.assignments.length === 0) skipped.push({ week, track, existing: existing.length });
    }
  }
  const fixedMatches = await db.match.findMany({
    where: { seasonId: season.id, weekNumber: { lte: REGULAR_SEASON_WEEKS } },
    include: { homeTeam: true, awayTeam: true, markets: { select: { id: true }, take: 1 } },
  });
  let draftMarketsCreated = 0;
  for (const match of fixedMatches) {
    if (match.markets.length > 0) continue;
    const weekEnd = new Date(season.startsAt.getTime() + match.weekNumber * 7 * 86_400_000);
    await db.market.create({
      data: {
        matchId: match.id,
        title: `常规赛第 ${match.weekNumber} 轮 · 系列赛结果`,
        status: MarketStatus.DRAFT,
        opensAt: new Date(),
        closesAt: weekEnd,
        options: {
          create: [
            { label: `${match.homeTeam.name} 胜（2:0）` },
            { label: "平局（1:1）" },
            { label: `${match.awayTeam.name} 胜（0:2）` },
          ],
        },
      },
    });
    draftMarketsCreated += 1;
  }
  return { created, repairedSlots, draftMarketsCreated, skipped };
}
