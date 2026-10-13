import { NextResponse } from "next/server";
import { UserRole } from "@/generated/prisma/enums";
import { authErrorResponse, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await context.params;
    const market = await prisma.market.findUnique({
      where: { id },
      select: {
        match: {
          select: {
            homeTeam: {
              select: {
                id: true,
                name: true,
                members: {
                  where: { role: { in: [UserRole.VIEWER, UserRole.CAPTAIN, UserRole.PLAYER, UserRole.SCOREKEEPER] } },
                  select: { id: true, name: true, username: true, role: true, isReferee: true },
                },
              },
            },
            awayTeam: {
              select: {
                id: true,
                name: true,
                members: {
                  where: { role: { in: [UserRole.VIEWER, UserRole.CAPTAIN, UserRole.PLAYER, UserRole.SCOREKEEPER] } },
                  select: { id: true, name: true, username: true, role: true, isReferee: true },
                },
              },
            },
          },
        },
      },
    });
    if (!market) return NextResponse.json({ error: "比赛不存在" }, { status: 404 });
    const sortMembers = (members: typeof market.match.homeTeam.members) => [...members].sort((first, second) => (
      Number(second.role === UserRole.CAPTAIN) - Number(first.role === UserRole.CAPTAIN)
      || first.name.localeCompare(second.name, "zh-CN")
    ));
    return NextResponse.json({
      data: {
        home: { ...market.match.homeTeam, members: sortMembers(market.match.homeTeam.members) },
        away: { ...market.match.awayTeam, members: sortMembers(market.match.awayTeam.members) },
      },
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取对战阵容失败" }, { status: 500 });
  }
}
