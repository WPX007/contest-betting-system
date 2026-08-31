import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { authErrorResponse, destroySession, requireUser, revokeUserSessions } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(72),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = passwordSchema.parse(await request.json());
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      return NextResponse.json({ error: "当前密码不正确" }, { status: 400 });
    }
    if (input.currentPassword === input.newPassword) {
      return NextResponse.json({ error: "新密码不能与当前密码相同" }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.newPassword), passwordChangedAt: new Date() },
    });
    await revokeUserSessions(user.id);
    await destroySession();
    return NextResponse.json({ data: { changed: true } });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "新密码至少需要 6 位" }, { status: 400 });
    }
    return NextResponse.json({ error: "修改密码失败" }, { status: 500 });
  }
}
