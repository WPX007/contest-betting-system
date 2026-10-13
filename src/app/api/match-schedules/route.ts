import { NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@/generated/prisma/enums";
import { authErrorResponse, requireUser } from "@/lib/auth/session";
import { confirmMatchTime, listMatchSchedules, proposeMatchTime, scorekeeperRescheduleMatch } from "@/lib/services/match-schedule-service";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user.isReferee && user.role !== UserRole.PLAYER && user.role !== UserRole.CAPTAIN && user.role !== UserRole.SCOREKEEPER && user.role !== UserRole.OPS_ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ error: "当前账号没有查看赛程的权限" }, { status: 403 });
    }
    return NextResponse.json({ data: await listMatchSchedules(user) });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取待确认赛程失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = z.discriminatedUnion("action", [
      z.object({ action: z.literal("PROPOSE"), matchId: z.string().min(1), scheduledAt: z.string().datetime() }),
      z.object({ action: z.literal("CONFIRM"), matchId: z.string().min(1) }),
      z.object({ action: z.literal("RESCHEDULE"), matchId: z.string().min(1), scheduledAt: z.string().datetime() }),
    ]).parse(await request.json());
    if (input.action === "PROPOSE") await proposeMatchTime(user, input.matchId, new Date(input.scheduledAt));
    else if (input.action === "CONFIRM") await confirmMatchTime(user, input.matchId);
    else {
      if (!user.isReferee && user.role !== UserRole.SCOREKEEPER) {
        return NextResponse.json({ error: "只有裁判可以直接修改比赛时间" }, { status: 403 });
      }
      await scorekeeperRescheduleMatch(user.id, input.matchId, new Date(input.scheduledAt));
    }
    return NextResponse.json({ data: { saved: true } });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "赛程时间操作失败" }, { status: 400 });
  }
}
