import { MatchScheduleStatus, MarketStatus, UserRole } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

async function syncOpenParlayDeadlines(tx: Prisma.TransactionClient, marketId: string) {
  const rounds = await tx.parlayRound.findMany({
    where: { status: "OPEN", markets: { some: { marketId } } },
    include: { markets: { include: { market: { select: { closesAt: true } } } } },
  });
  for (const round of rounds) {
    const closesAt = new Date(Math.min(...round.markets.map((item) => item.market.closesAt.getTime())));
    if (closesAt.getTime() !== round.closesAt.getTime()) {
      await tx.parlayRound.update({ where: { id: round.id }, data: { closesAt } });
    }
  }
}

function assertFutureWeekTime(match: { weekNumber: number; season: { startsAt: Date } }, scheduledAt: Date) {
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) throw new Error("比赛时间必须晚于当前时间");
  const weekStart = new Date(match.season.startsAt.getTime() + (match.weekNumber - 1) * 7 * 86_400_000);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
  if (scheduledAt < weekStart || scheduledAt >= weekEnd) throw new Error(`比赛时间必须在第 ${match.weekNumber} 周范围内`);
}

function scheduleView(match: Awaited<ReturnType<typeof getScheduleMatch>>, actor: { id: string; role: UserRole; teamId: string | null }) {
  if (!match) return null;
  const isAdmin = actor.role === UserRole.OPS_ADMIN || actor.role === UserRole.SUPER_ADMIN;
  const isParticipant = actor.teamId === match.homeTeamId || actor.teamId === match.awayTeamId;
  const isProposerTeam = actor.teamId === match.proposedByTeamId;
  return {
    id: match.id,
    week: match.weekNumber,
    track: match.track,
    slotIndex: match.slotIndex,
    home: match.homeTeam.name,
    away: match.awayTeam.name,
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    scheduleStatus: match.scheduleStatus,
    proposedScheduledAt: match.proposedScheduledAt?.toISOString() ?? null,
    scheduledAt: match.scheduledAt?.toISOString() ?? null,
    proposedByTeamId: match.proposedByTeamId,
    proposedByTeamName: match.proposedByTeamId === match.homeTeamId ? match.homeTeam.name : match.proposedByTeamId === match.awayTeamId ? match.awayTeam.name : null,
    confirmedAt: match.confirmedAt?.toISOString() ?? null,
    marketId: match.markets[0]?.id ?? null,
    marketStatus: match.markets[0]?.status ?? null,
    canPropose: !isAdmin && isParticipant && match.scheduleStatus !== MatchScheduleStatus.CONFIRMED,
    canConfirm: !isAdmin && isParticipant && match.scheduleStatus === MatchScheduleStatus.PROPOSED && !isProposerTeam,
    canAdminReschedule: isAdmin && match.markets[0]?.status !== MarketStatus.SETTLED && match.markets[0]?.status !== MarketStatus.VOIDED,
  };
}

function getScheduleMatch(matchId: string) {
  return prisma.match.findUnique({
    where: { id: matchId },
    include: { season: true, homeTeam: true, awayTeam: true, markets: { take: 1 } },
  });
}

export async function listMatchSchedules(actor: { id: string; role: UserRole; teamId: string | null }) {
  const isAdmin = actor.role === UserRole.OPS_ADMIN || actor.role === UserRole.SUPER_ADMIN;
  const records = await prisma.match.findMany({
    where: isAdmin
      ? { weekNumber: { lte: 11 } }
      : { weekNumber: { lte: 11 }, OR: [{ homeTeamId: actor.teamId ?? "" }, { awayTeamId: actor.teamId ?? "" }] },
    include: { season: true, homeTeam: true, awayTeam: true, markets: { take: 1 } },
    orderBy: [{ weekNumber: "asc" }, { track: "asc" }, { slotIndex: "asc" }],
  });
  return records.map((match) => scheduleView(match, actor));
}

export async function proposeMatchTime(actor: { id: string; role: UserRole; teamId: string | null }, matchId: string, scheduledAt: Date) {
  const match = await getScheduleMatch(matchId);
  if (!match) throw new Error("比赛不存在");
  if (actor.role !== UserRole.CAPTAIN || !actor.teamId || ![match.homeTeamId, match.awayTeamId].includes(actor.teamId)) {
    throw new Error("只有对阵双方队长可以提议比赛时间");
  }
  if (match.scheduleStatus === MatchScheduleStatus.CONFIRMED) throw new Error("双方已确认时间，后续只能由管理员修改");
  assertFutureWeekTime(match, scheduledAt);
  await prisma.$transaction([
    prisma.match.update({
      where: { id: match.id },
      data: {
        scheduleStatus: MatchScheduleStatus.PROPOSED,
        proposedScheduledAt: scheduledAt,
        proposedByUserId: actor.id,
        proposedByTeamId: actor.teamId,
        proposedAt: new Date(),
        confirmedByUserId: null,
        confirmedAt: null,
      },
    }),
    prisma.auditLog.create({
      data: { actorId: actor.id, action: "MATCH_TIME_PROPOSE", target: match.id, after: scheduledAt.toISOString() },
    }),
  ]);
}

export async function confirmMatchTime(actor: { id: string; role: UserRole; teamId: string | null }, matchId: string) {
  return prisma.$transaction(async (tx) => {
    const match = await tx.match.findUniqueOrThrow({
      where: { id: matchId },
      include: { season: true, homeTeam: true, awayTeam: true, markets: true },
    });
    if (actor.role !== UserRole.CAPTAIN || !actor.teamId || ![match.homeTeamId, match.awayTeamId].includes(actor.teamId)) {
      throw new Error("只有对阵双方队长可以确认比赛时间");
    }
    if (match.scheduleStatus !== MatchScheduleStatus.PROPOSED || !match.proposedScheduledAt || !match.proposedByTeamId) {
      throw new Error("当前没有待确认的比赛时间");
    }
    if (match.proposedByTeamId === actor.teamId) throw new Error("提议方不能确认自己的时间，请等待另一方队长确认");
    assertFutureWeekTime(match, match.proposedScheduledAt);
    if (match.markets[0] && match.markets[0].status !== MarketStatus.DRAFT) throw new Error("该比赛已经创建盘口，不能重复确认");
    const market = match.markets[0]
      ? await tx.market.update({
          where: { id: match.markets[0].id },
          data: { status: MarketStatus.OPEN, opensAt: new Date(), closesAt: match.proposedScheduledAt, closedAt: null },
        })
      : await tx.market.create({
          data: {
            matchId: match.id,
            title: `常规赛第 ${match.weekNumber} 轮 · 系列赛结果`,
            status: MarketStatus.OPEN,
            opensAt: new Date(),
            closesAt: match.proposedScheduledAt,
            options: {
              create: [
                { label: `${match.homeTeam.name} 胜（2:0）` },
                { label: "平局（1:1）" },
                { label: `${match.awayTeam.name} 胜（0:2）` },
              ],
            },
          },
        });
    await tx.match.update({
      where: { id: match.id },
      data: {
        scheduleStatus: MatchScheduleStatus.CONFIRMED,
        scheduledAt: match.proposedScheduledAt,
        confirmedByUserId: actor.id,
        confirmedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: { actorId: actor.id, action: "MATCH_TIME_CONFIRM", target: match.id, after: match.proposedScheduledAt.toISOString() },
    });
    await syncOpenParlayDeadlines(tx, market.id);
    return market;
  });
}

export async function adminRescheduleMatch(adminId: string, matchId: string, scheduledAt: Date) {
  return prisma.$transaction(async (tx) => {
    const match = await tx.match.findUniqueOrThrow({
      where: { id: matchId },
      include: { season: true, homeTeam: true, awayTeam: true, markets: true },
    });
    if (match.markets[0]?.status === MarketStatus.SETTLED || match.markets[0]?.status === MarketStatus.VOIDED) throw new Error("已结算或已作废比赛不能修改时间");
    assertFutureWeekTime(match, scheduledAt);
    await tx.match.update({
      where: { id: match.id },
      data: {
        scheduledAt,
        scheduleStatus: MatchScheduleStatus.CONFIRMED,
        proposedScheduledAt: null,
        proposedByUserId: null,
        proposedByTeamId: null,
        proposedAt: null,
        confirmedByUserId: adminId,
        confirmedAt: new Date(),
      },
    });
    let marketId: string;
    if (match.markets[0]) {
      const market = await tx.market.update({
        where: { id: match.markets[0].id },
        data: { closesAt: scheduledAt, status: MarketStatus.OPEN, closedAt: null },
      });
      marketId = market.id;
    } else {
      const market = await tx.market.create({
        data: {
          matchId: match.id,
          title: `常规赛第 ${match.weekNumber} 轮 · 系列赛结果`,
          status: MarketStatus.OPEN,
          opensAt: new Date(),
          closesAt: scheduledAt,
          options: {
            create: [
              { label: `${match.homeTeam.name} 胜（2:0）` },
              { label: "平局（1:1）" },
              { label: `${match.awayTeam.name} 胜（0:2）` },
            ],
          },
        },
      });
      marketId = market.id;
    }
    await syncOpenParlayDeadlines(tx, marketId);
    await tx.auditLog.create({
      data: { actorId: adminId, action: "MATCH_TIME_ADMIN_SET", target: match.id, after: scheduledAt.toISOString() },
    });
  });
}
