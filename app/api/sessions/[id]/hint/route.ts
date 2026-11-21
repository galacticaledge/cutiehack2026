import { problemContext } from "@/lib/context";
import { prisma } from "@/lib/db";
import { HttpError, handler, json, requireSession, requireUser } from "@/lib/http";

export const runtime = "nodejs";

export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const s = await requireSession(id, user.id);
  if (s.source !== "bank") throw new HttpError(400, "Hints are only available on problems from the bank.");
  if (s.status !== "active") throw new HttpError(400, "You've already solved this one.");
  if (s.hintsUsed >= 3) throw new HttpError(400, "All 3 hints are already revealed.");
  const ctx = problemContext(s);
  const updated = await prisma.problemSession.updateMany({
    where: { id: s.id, hintsUsed: s.hintsUsed },
    data: { hintsUsed: { increment: 1 } },
  });
  if (updated.count !== 1) throw new HttpError(409, "Please try again.");
  const hintsUsed = s.hintsUsed + 1;
  return json({ hint: ctx.hints[hintsUsed - 1], hintsUsed });
});
