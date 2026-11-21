import { problemContext } from "@/lib/context";
import { prisma } from "@/lib/db";
import { HttpError, handler, readJson, requireSession, requireUser } from "@/lib/http";
import { synthesize, ttsEnabled } from "@/lib/tts";

export const runtime = "nodejs";

/** Speaks a stored, leak-checked tutor message or a revealed hint, by reference only. Never raw text. */
export const POST = handler(async (req: Request) => {
  if (!ttsEnabled()) throw new HttpError(404, "Read-aloud is not enabled.");
  const user = await requireUser();
  const body = await readJson<{ sessionId?: string; messageId?: string; hintIndex?: number; text?: unknown }>(req);
  if (body.text !== undefined) throw new HttpError(400, "Raw text is not accepted.");
  const s = await requireSession(String(body.sessionId ?? ""), user.id);

  let text: string | undefined;
  if (body.messageId) {
    const m = await prisma.message.findUnique({ where: { id: String(body.messageId) } });
    if (!m || m.sessionId !== s.id || m.role !== "tutor") throw new HttpError(404, "Message not found.");
    text = m.content;
  } else if (typeof body.hintIndex === "number") {
    const i = Math.floor(body.hintIndex);
    if (s.source !== "bank" || i < 0 || i >= s.hintsUsed) throw new HttpError(404, "Hint not revealed.");
    text = problemContext(s).hints[i];
  }
  if (!text) throw new HttpError(400, "Nothing to read.");

  try {
    const audio = await synthesize(text);
    return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    console.warn("[tts] failed:", (e as Error)?.message);
    throw new HttpError(502, "Read-aloud is unavailable right now.");
  }
});
