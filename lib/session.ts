import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";

const COOKIE = "socra_session";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return s;
}

function sign(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

export function makeToken(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function readToken(token: string | undefined): string | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const userId = token.slice(0, i);
  const sig = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(sign(userId));
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) return null;
  return userId;
}

export async function setSessionCookie(userId: string) {
  const jar = await cookies();
  jar.set(COOKIE, makeToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "true",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function currentUser() {
  const jar = await cookies();
  const userId = readToken(jar.get(COOKIE)?.value);
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}
