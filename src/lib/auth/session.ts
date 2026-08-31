import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { UserRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "contest_session";
const SESSION_DAYS = 7;
const USE_SECURE_COOKIE = process.env.SESSION_COOKIE_SECURE === "true";

export class AuthenticationError extends Error {
  status = 401;
}

export class AuthorizationError extends Error {
  status = 403;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { tokenHash: tokenHash(token), userId, expiresAt } });
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: USE_SECURE_COOKIE,
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  }
  store.delete(COOKIE_NAME);
}

export async function revokeUserSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}

export async function getCurrentUser() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: {
      user: {
        include: {
          team: true,
          wallets: true,
        },
      },
    },
  });
  if (!session || session.expiresAt <= new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } });
    return null;
  }
  await prisma.session.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });
  return session.user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new AuthenticationError("登录已失效，请重新登录");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== UserRole.OPS_ADMIN && user.role !== UserRole.SUPER_ADMIN) {
    throw new AuthorizationError("没有管理员权限");
  }
  return user;
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return { status: error.status, message: error.message };
  }
  return null;
}

export function sessionUserView(user: {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  team: { id: string; name: string; allianceKey: string } | null;
  wallets: Array<{ asset: string; balance: number }>;
}) {
  return {
    id: user.id,
    displayName: user.name,
    username: user.username,
    role: user.role,
    isAdmin: user.role === UserRole.OPS_ADMIN || user.role === UserRole.SUPER_ADMIN,
    team: user.team ? { id: user.team.id, name: user.team.name, allianceKey: user.team.allianceKey } : null,
    balance: user.wallets.find((wallet) => wallet.asset === "BET_COIN")?.balance ?? 0,
    points: user.wallets.find((wallet) => wallet.asset === "POINT")?.balance ?? 0,
  };
}
