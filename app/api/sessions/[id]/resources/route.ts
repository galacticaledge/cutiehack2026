import { HttpError, handler, json, requireSession, requireUser } from "@/lib/http";
import { getTemplate } from "@/lib/problems";
import { learnMoreLinks } from "@/lib/resources";

export const runtime = "nodejs";

export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const s = await requireSession(id, user.id);
  if (s.source !== "bank" || s.status === "active") throw new HttpError(403, "Solve the problem first.");
  const t = getTemplate(s.templateId);
  if (!t) return json({ links: [] });
  return json({ links: await learnMoreLinks(t.id, t.learnMoreQuery) });
});
