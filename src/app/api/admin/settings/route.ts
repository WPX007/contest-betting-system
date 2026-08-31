import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireAdmin();
    const [config, market] = await Promise.all([
      prisma.parlayConfig.findUniqueOrThrow({ where: { id: "default" } }),
      prisma.market.findFirst(),
    ]);
    return NextResponse.json({
      data: {
        parlayTicket: config.ticketStake,
        parlayBasePools: {
          three: config.basePool,
          four: config.basePool4,
          five: config.basePool5,
          sixPlus: config.basePool6Plus,
        },
        ticketPoolBonusMultiplier: config.ticketPoolBonusBps / 10_000,
        ratios: {
          returnPercent: (market?.returnRatioBps ?? 2500) / 100,
          recoveryPercent: (market?.recoveryRatioBps ?? 500) / 100,
          prizePercent: (market?.prizeRatioBps ?? 7000) / 100,
        },
      },
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "读取设置失败" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const input = z.object({
      parlayTicket: z.number().int().positive().optional(),
      parlayBasePools: z.object({
        three: z.number().int().min(0),
        four: z.number().int().min(0),
        five: z.number().int().min(0),
        sixPlus: z.number().int().min(0),
      }).optional(),
      ticketPoolBonusMultiplier: z.number().min(0).max(100).optional(),
      ratios: z.object({
        returnPercent: z.number().min(0).max(100),
        recoveryPercent: z.number().min(0).max(100),
        prizePercent: z.number().min(0).max(100),
      }).optional(),
    }).parse(await request.json());
    if (input.ratios && input.ratios.returnPercent + input.ratios.recoveryPercent + input.ratios.prizePercent !== 100) {
      return NextResponse.json({ error: "结算比例合计必须为 100%" }, { status: 400 });
    }
    await prisma.$transaction(async (tx) => {
      if (input.parlayTicket !== undefined || input.parlayBasePools !== undefined || input.ticketPoolBonusMultiplier !== undefined) {
        await tx.parlayConfig.update({
          where: { id: "default" },
          data: {
            ...(input.parlayTicket !== undefined ? { ticketStake: input.parlayTicket } : {}),
            ...(input.parlayBasePools ? {
              basePool: input.parlayBasePools.three,
              basePool4: input.parlayBasePools.four,
              basePool5: input.parlayBasePools.five,
              basePool6Plus: input.parlayBasePools.sixPlus,
            } : {}),
            ...(input.ticketPoolBonusMultiplier !== undefined ? {
              ticketPoolBonusBps: Math.round(input.ticketPoolBonusMultiplier * 10_000),
            } : {}),
          },
        });
      }
      if (input.ratios) {
        await tx.market.updateMany({
          data: {
            returnRatioBps: Math.round(input.ratios.returnPercent * 100),
            recoveryRatioBps: Math.round(input.ratios.recoveryPercent * 100),
            prizeRatioBps: Math.round(input.ratios.prizePercent * 100),
          },
        });
      }
      await tx.auditLog.create({
        data: { actorId: admin.id, action: "SYSTEM_SETTINGS", target: "default", after: JSON.stringify(input) },
      });
    });
    return NextResponse.json({ data: { saved: true } });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    return NextResponse.json({ error: "保存设置失败" }, { status: 400 });
  }
}
