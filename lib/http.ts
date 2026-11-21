import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "./db";
import { currentUser } from "./session";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/** Wrap a route handler: turns HttpError / LLM errors into friendly JSON, never a stack trace. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      if (e && typeof e === "object" && (e as { name?: string }).name === "LLMUnavailableError") {
        return json({ error: "The tutor is having trouble connecting right now. Please try again in a moment." }, 503);
      }
      console.error("[api] unhandled error", e);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  };
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Please log in first.");
  return user;
}

export async function requireSession(sessionId: string, userId: string) {
  const s = await prisma.problemSession.findUnique({ where: { id: sessionId } });
  if (!s || s.userId !== userId) throw new HttpError(404, "Session not found.");
  return s;
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
