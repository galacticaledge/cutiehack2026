import { verifyMessage } from "@/lib/claims";
import { problemContext } from "@/lib/context";
import { prisma } from "@/lib/db";
import { HttpError, handler, json, readJson, requireSession, requireUser } from "@/lib/http";
import { tutorReply } from "@/lib/tutor";
import { verdictChips, verdictLines } from "@/lib/verify";

export const runtime = "nodejs";

const lastChat = new Map<string, number>();

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const s = await requireSession(id, user.id);
  const body = await readJson<{ message?: string }>(req);
  const message = String(body.message ?? "").trim();
  if (!message) throw new HttpError(400, "Type a message first.");
  if (message.length > 2000) throw new HttpError(400, "Please keep messages under 2000 characters.");

  const now = Date.now();
  if (now - (lastChat.get(user.id) ?? 0) < 2000) throw new HttpError(429, "Slow down a little, one message every 2 seconds.");
  lastChat.set(user.id, now);

  const ctx = problemContext(s);
  // Neuro-symbolic step verification (bank sessions only; custom sessions have no ground truth).
  const verdicts = ctx.source === "bank" ? await verifyMessage(message, ctx.checkpoints) : [];
  const userMsg = await prisma.message.create({
    data: { sessionId: s.id, role: "user", content: message, verdicts: verdicts.length ? (verdicts as object[]) : undefined },
  });

  const history = await prisma.message.findMany({ where: { sessionId: s.id }, orderBy: { createdAt: "asc" }, take: 200 });
  const { reply, provider } = await tutorReply({ ctx, hintsUsed: s.hintsUsed, history, verdictLines: verdictLines(verdicts) });
  const tutorMsg = await prisma.message.create({ data: { sessionId: s.id, role: "tutor", content: reply } });

  return json({ reply, messageId: tutorMsg.id, userMessageId: userMsg.id, provider, verdicts: verdictChips(verdicts) });
});
