import { NextResponse } from "next/server";
import { z } from "zod";
import { LedgerReason, MatchScheduleStatus, MarketStatus, MatchStatus, Track } from "@/generated/prisma/enums";
import { authErrorResponse, requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { debitHouseWallet } from "@/lib/services/house-wallet";
import { listMarkets } from "@/lib/services/market-service";
import { adminRescheduleMatch } from "@/lib/services/match-schedule-service";
import { refundMarket, settleMarket } from "@/lib/services/settlement-service";

const createSchema = z.object({
  week: z.number().int().min(1).max(15),
  track: z.enum(["A", "B"]),
  homeTeamId: z.string().min(1),
  awayTeamId: z.string().min(1),
  scheduledAt: z.string().datetime(),
});

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ data: await listMarkets() });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取盘口失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const input = createSchema.parse(await request.json());
    if (input.week <= 11) throw new Error("前 11 周为固定对阵，请由双方队长确认比赛时间");
    if (input.homeTeamId === input.awayTeamId) throw new Error("主队和客队不能相同");
    const [home, away] = await Promise.all([
      prisma.team.findUniqueOrThrow({ where: { id: input.homeTeamId } }),
      prisma.team.findUniqueOrThrow({ where: { id: input.awayTeamId } }),
    ]);
    if (home.track !== input.track || away.track !== input.track) throw new Error("比赛队伍与赛道不一致");
    const scheduledAt = new Date(input.scheduledAt);
    const market = await prisma.$transaction(async (tx) => {
      const match = await tx.match.create({
        data: {
          seasonId: "season-2026",
          homeTeamId: home.id,
          awayTeamId: away.id,
          track: input.track === "A" ? Track.A : Track.B,
          bestOf: 2,
          weekNumber: input.week,
          scheduledAt,
          scheduleStatus: MatchScheduleStatus.CONFIRMED,
          status: MatchStatus.SCHEDULED,
        },
      });
      const created = await tx.market.create({
        data: {
          matchId: match.id,
          title: `常规赛第 ${input.week} 轮 · 系列赛结果`,
          status: MarketStatus.OPEN,
          opensAt: new Date(),
          closesAt: scheduledAt,
          options: {
            create: [
              { label: `${home.name} 胜（2:0）` },
              { label: "平局（1:1）" },
              { label: `${away.name} 胜（0:2）` },
            ],
          },
        },
      });
      await tx.auditLog.create({
        data: { actorId: admin.id, action: "MARKET_CREATE", target: created.id, after: JSON.stringify(input) },
      });
      return created;
    });
    return NextResponse.json({ data: market }, { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建比赛失败" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const action = z.string().parse(body.action);
    if (action === "STATUS") {
      const input = z.object({
        ids: z.array(z.string().min(1)).min(1),
        status: z.enum(["OPEN", "CLOSED", "PENDING_REVIEW", "VOIDED"]),
      }).parse(body);
      const status = input.status as MarketStatus;
      await prisma.market.updateMany({
        where: { id: { in: input.ids } },
        data: { status, closedAt: status === MarketStatus.OPEN ? null : new Date() },
      });
      await prisma.auditLog.create({
        data: { actorId: admin.id, action: "MARKET_STATUS_BATCH", target: input.ids.join(","), after: status },
      });
      return NextResponse.json({ data: { updated: input.ids.length } });
    }
    if (action === "ODDS") {
      const input = z.object({
        marketId: z.string(),
        reason: z.string().trim().min(1),
        odds: z.record(z.string(), z.number().min(1)),
      }).parse(body);
      const options = await prisma.marketOption.findMany({ where: { marketId: input.marketId } });
      await prisma.$transaction([
        ...options.filter((option) => input.odds[option.id]).map((option) => prisma.marketOption.update({
          where: { id: option.id },
          data: { manualOddsBps: Math.round(input.odds[option.id] * 10000), oddsReason: input.reason },
        })),
        prisma.auditLog.create({
          data: { actorId: admin.id, action: "MARKET_ODDS", target: input.marketId, after: JSON.stringify(input) },
        }),
      ]);
      return NextResponse.json({ data: { updated: true } });
    }
    if (action === "LIQUIDITY") {
      const input = z.object({
        marketId: z.string().min(1),
        idempotencyKey: z.string().uuid(),
        injections: z.array(z.object({
          optionId: z.string().min(1),
          amount: z.number().int().min(0),
        })).length(3),
      }).parse(body);
      const optionIds = input.injections.map((item) => item.optionId);
      if (new Set(optionIds).size !== optionIds.length) throw new Error("盘口结果不能重复");
      const total = input.injections.reduce((sum, item) => sum + item.amount, 0);
      if (total <= 0) throw new Error("注入总额必须大于 0");
      const reference = `market-injection:${input.idempotencyKey}`;
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.ledgerEntry.findFirst({ where: { reference } });
        if (existing) return { injected: Math.abs(existing.amount), duplicated: true };
        const market = await tx.market.findUniqueOrThrow({
          where: { id: input.marketId },
          include: { options: true, match: { include: { homeTeam: true, awayTeam: true } } },
        });
        if (market.status !== MarketStatus.OPEN || market.closesAt <= new Date()) {
          throw new Error("仅可向当前未封盘比赛注入竞猜币");
        }
        if (market.options.length !== 3 || optionIds.some((id) => !market.options.some((option) => option.id === id))) {
          throw new Error("盘口结果信息已变化，请刷新后重试");
        }
        for (const injection of input.injections) {
          if (injection.amount <= 0) continue;
          await tx.marketOption.update({
            where: { id: injection.optionId },
            data: { injectedAmount: { increment: injection.amount } },
          });
        }
        await debitHouseWallet(
          tx,
          total,
          LedgerReason.MARKET_INJECTION,
          reference,
          `${market.match.homeTeam.name} vs ${market.match.awayTeam.name} 盘口注入`,
        );
        await tx.auditLog.create({
          data: {
            actorId: admin.id,
            action: "MARKET_LIQUIDITY_INJECTION",
            target: market.id,
            after: JSON.stringify(input.injections),
          },
        });
        return { injected: total, duplicated: false };
      });
      return NextResponse.json({ data: result });
    }
    if (action === "SETTLE") {
      const input = z.object({
        marketId: z.string(),
        homeScore: z.number().int().min(0),
        awayScore: z.number().int().min(0),
      }).parse(body);
      const result = await settleMarket(input);
      await prisma.auditLog.create({
        data: { actorId: admin.id, action: "MARKET_SETTLE", target: input.marketId, after: JSON.stringify(input) },
      });
      return NextResponse.json({ data: result });
    }
    if (action === "RESCHEDULE") {
      const input = z.object({ matchId: z.string().min(1), scheduledAt: z.string().datetime() }).parse(body);
      await adminRescheduleMatch(admin.id, input.matchId, new Date(input.scheduledAt));
      return NextResponse.json({ data: { rescheduled: true } });
    }
    if (action === "CONFIGURE") {
      const input = createSchema.extend({ marketId: z.string() }).parse(body);
      if (input.week <= 11) throw new Error("前 11 周固定对阵不可修改；已确认时间请使用管理员改时");
      const activeBets = await prisma.bet.count({ where: { marketId: input.marketId, status: "ACTIVE" } });
      if (activeBets > 0) await refundMarket(input.marketId, "比赛重新配置，原订单退款");
      const [home, away, market] = await Promise.all([
        prisma.team.findUniqueOrThrow({ where: { id: input.homeTeamId } }),
        prisma.team.findUniqueOrThrow({ where: { id: input.awayTeamId } }),
        prisma.market.findUniqueOrThrow({ where: { id: input.marketId } }),
      ]);
      const scheduledAt = new Date(input.scheduledAt);
      await prisma.$transaction([
        prisma.match.update({
          where: { id: market.matchId },
          data: { weekNumber: input.week, track: input.track as Track, homeTeamId: home.id, awayTeamId: away.id, scheduledAt, scheduleStatus: MatchScheduleStatus.CONFIRMED, status: MatchStatus.SCHEDULED, homeScore: null, awayScore: null },
        }),
        prisma.market.update({
          where: { id: market.id },
          data: { status: MarketStatus.OPEN, closesAt: scheduledAt, closedAt: null },
        }),
        prisma.auditLog.create({
          data: { actorId: admin.id, action: "MARKET_CONFIGURE", target: market.id, after: JSON.stringify(input) },
        }),
      ]);
      const options = await prisma.marketOption.findMany({ where: { marketId: market.id }, orderBy: { id: "asc" } });
      if (options.length === 3) {
        await prisma.$transaction([
          prisma.marketOption.update({ where: { id: options[0].id }, data: { label: `${home.name} 胜（2:0）`, isWinner: false } }),
          prisma.marketOption.update({ where: { id: options[1].id }, data: { label: "平局（1:1）", isWinner: false } }),
          prisma.marketOption.update({ where: { id: options[2].id }, data: { label: `${away.name} 胜（0:2）`, isWinner: false } }),
        ]);
      }
      return NextResponse.json({ data: { configured: true, refundedBets: activeBets } });
    }
    return NextResponse.json({ error: "不支持的盘口操作" }, { status: 400 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "盘口操作失败" }, { status: 400 });
  }
}
