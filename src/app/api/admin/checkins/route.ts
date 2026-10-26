import { NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireAdmin();
    const [records, summary, checkedInUsers] = await Promise.all([
      prisma.dailyCheckin.findMany({
        include: { user: { include: { team: true } } },
        orderBy: { createdAt: "desc" },
        take: 1000,
      }),
      prisma.dailyCheckin.aggregate({
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.dailyCheckin.findMany({
        distinct: ["userId"],
        select: { userId: true },
      }),
    ]);
    return NextResponse.json({
      data: {
        totalCount: summary._count._all,
        totalAmount: summary._sum.amount ?? 0,
        userCount: checkedInUsers.length,
        records: records.map((record) => ({
          id: record.id,
          dayKey: record.dayKey,
          amount: record.amount,
          createdAt: record.createdAt.toISOString(),
          user: {
            id: record.user.id,
            name: record.user.name,
            username: record.user.username,
            team: record.user.team?.name ?? "无",
          },
        })),
      },
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取签到明细失败" }, { status: 500 });
  }
}
