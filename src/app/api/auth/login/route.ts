import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, sessionUserView } from "@/lib/auth/session";
import { displayBalanceForUser } from "@/lib/services/house-wallet";

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    const user = await prisma.user.findFirst({
      where: { username: { equals: input.username } },
      include: { team: true, wallets: true },
    });
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
    }
    await createSession(user.id);
    const view = sessionUserView(user);
    return NextResponse.json({ data: { ...view, balance: await displayBalanceForUser(user) } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "请输入账号和密码" }, { status: 400 });
    }
    return NextResponse.json({ error: "登录失败，请稍后重试" }, { status: 500 });
  }
}
