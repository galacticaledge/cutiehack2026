import { computeFlags, type TelemetryEvent } from "@/lib/anticheat";
import { checkAnswer, isLocked } from "@/lib/answers";
import { problemContext } from "@/lib/context";
import { prisma } from "@/lib/db";
import { HttpError, handler, json, readJson, requireSession, requireUser } from "@/lib/http";
import { wrongAnswerLine } from "@/lib/prompts";
import { templateRewardElsewhere } from "@/lib/sessions";
import { tutorReply } from "@/lib/tutor";

export const runtime = "nodejs";

const DIAGNOSIS_FALLBACK = "Not quite. Go back through your work one step at a time. Which step are you least sure about?";

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const s = await requireSession(id, user.id);
  const ctx = problemContext(s);
  const body = await readJson<{ answer?: string }>(req);
  const raw = String(body.answer ?? "");

  if (ctx.answer === null) throw new HttpError(400, "There's no answer check for this one.");
  const isBank = s.source === "bank";
  if (isBank && s.status !== "active") throw new HttpError(400, "You've already solved this one.");
  if (isBank && isLocked(s.wrongAttempts, s.hintsUsed)) {
    throw new HttpError(423, s.hintsUsed < 3 ? "Answers are locked. Reveal the next hint to unlock 2 more attempts." : "You're out of attempts for this problem. Keep chatting with the tutor to understand it.");
  }

  const check = checkAnswer(raw, ctx.answer, ctx.tolerance);
  if (!check.ok) return json({ error: check.error, counted: false }, 400);

  if (check.correct) {
    if (!isBank) return json({ correct: true, wrongAttempts: s.wrongAttempts, locked: false, practice: true });
    const now = new Date();
    const updated = await prisma.problemSession.updateMany({
      where: { id: s.id, status: "active" },
      data: { status: "solved", solvedAt: now },
    });
    if (updated.count !== 1) throw new HttpError(409, "Already submitted.");
    const events = await prisma.event.findMany({ where: { sessionId: s.id, type: { in: ["hidden", "visible", "paste"] } } });
    const flags = computeFlags({
      startedAt: s.startedAt,
      submittedAt: now,
      minSolveSeconds: ctx.template!.minSolveSeconds,
      events: events as unknown as TelemetryEvent[],
    });
    await prisma.event.create({ data: { sessionId: s.id, type: "solve", data: { flags } } });
    const practice = Boolean(await templateRewardElsewhere(user.id, s.templateId!, s.id));
    return json({ correct: true, wrongAttempts: s.wrongAttempts, locked: false, flagged: flags.length > 0, practice });
  }

  // Wrong answer
  let wrongAttempts = s.wrongAttempts;
  if (isBank) {
    const u = await prisma.problemSession.update({ where: { id: s.id }, data: { wrongAttempts: { increment: 1 } } });
    wrongAttempts = u.wrongAttempts;
  }
  let tutorText = DIAGNOSIS_FALLBACK;
  try {
    const history = await prisma.message.findMany({ where: { sessionId: s.id }, orderBy: { createdAt: "asc" }, take: 200 });
    const r = await tutorReply({ ctx, hintsUsed: s.hintsUsed, history, verdictLines: [], extraSystem: wrongAnswerLine(raw) });
    tutorText = r.reply;
  } catch (e) {
    console.warn("[answer] diagnosis failed:", (e as Error)?.message);
  }
  const msg = await prisma.message.create({ data: { sessionId: s.id, role: "tutor", content: tutorText } });
  return json({
    correct: false,
    wrongAttempts,
    locked: isBank ? isLocked(wrongAttempts, s.hintsUsed) : false,
    tutorReply: tutorText,
    messageId: msg.id,
  });
});
