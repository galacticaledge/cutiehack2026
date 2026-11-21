import { handler, json, requireSession, requireUser } from "@/lib/http";
import { sessionView } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const s = await requireSession(id, user.id);
  return json(await sessionView(s));
});
