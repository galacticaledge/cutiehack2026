import { problemContext } from "@/lib/context";
import { HttpError, handler, json, requireSession, requireUser } from "@/lib/http";
import { createBankSession } from "@/lib/sessions";

export const runtime = "nodejs";

export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const s = await requireSession(id, user.id);
  if (s.source === "bank") throw new HttpError(400, "This is already a verified problem.");
  const matched = problemContext(s).customRef?.matchedTemplateId;
  if (!matched) throw new HttpError(404, "No verified problem matches this concept yet.");
  const bank = await createBankSession(user, matched, s.id);
  return json({ sessionId: bank.id });
});
