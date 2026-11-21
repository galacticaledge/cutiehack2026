import { problemContext } from "@/lib/context";
import { CUSTOM_MAX, intakeProblem, intakeTopic } from "@/lib/custom";
import { prisma } from "@/lib/db";
import { HttpError, handler, json, readJson, requireUser } from "@/lib/http";
import { openingMessage } from "@/lib/prompts";
import { createBankSession } from "@/lib/sessions";

export const runtime = "nodejs";

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<{ templateId?: string; custom?: { kind?: string; text?: string } }>(req);

  if (body.custom) {
    const kind = body.custom.kind === "topic" ? "topic" : body.custom.kind === "problem" ? "problem" : null;
    const text = String(body.custom.text ?? "").trim();
    if (!kind) throw new HttpError(400, "Choose Problem or Topic.");
    if (!text) throw new HttpError(400, "Paste a problem or name a topic first.");
    if (text.length > CUSTOM_MAX) throw new HttpError(400, `Please keep it under ${CUSTOM_MAX} characters.`);
    const customRef = kind === "problem" ? await intakeProblem(text) : await intakeTopic(text);
    const session = await prisma.problemSession.create({
      data: {
        userId: user.id,
        source: kind === "problem" ? "custom_problem" : "custom_topic",
        customText: text,
        customRef: customRef as object,
        templateId: customRef.matchedTemplateId ?? null,
      },
    });
    await prisma.message.create({ data: { sessionId: session.id, role: "tutor", content: openingMessage(problemContext(session)) } });
    return json({ sessionId: session.id });
  }

  const session = await createBankSession(user, String(body.templateId ?? ""));
  return json({ sessionId: session.id });
});
