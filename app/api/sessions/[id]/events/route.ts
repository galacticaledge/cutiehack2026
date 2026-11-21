import { prisma } from "@/lib/db";
import { HttpError, handler, json, readJson, requireSession, requireUser } from "@/lib/http";

export const runtime = "nodejs";

const TYPES = new Set(["hidden", "visible", "paste"]);

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const s = await requireSession(id, user.id);
  const body = await readJson<{ type?: string; data?: { length?: unknown; target?: unknown } }>(req);
  const type = String(body.type ?? "");
  if (!TYPES.has(type)) throw new HttpError(400, "Unknown event.");
  if (s.source !== "bank" || s.status !== "active") return json({ ok: true });
  const data: { length?: number; target?: string } = {};
  if (typeof body.data?.length === "number") data.length = Math.max(0, Math.min(100000, Math.round(body.data.length)));
  if (typeof body.data?.target === "string") data.target = body.data.target.slice(0, 20);
  await prisma.event.create({ data: { sessionId: s.id, type, data } });
  return json({ ok: true });
});
