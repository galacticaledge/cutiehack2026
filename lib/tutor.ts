import "server-only";
import type { Message } from "@prisma/client";
import type { ProblemContext } from "./context";
import { deterministicLeak, LEAK_FALLBACK } from "./leak";
import { complete, completeJson, type ChatMessage } from "./llm";
import { leakCheckMessages, tutorSystemPrompt } from "./prompts";

interface GuardResult {
  leak: boolean;
  contradicts: boolean;
  reason: string;
}

async function guard(ctx: ProblemContext, reply: string, verdictLines: string[]): Promise<GuardResult> {
  if (ctx.answer !== null && deterministicLeak(reply, ctx.answer, ctx.tolerance, ctx.displayPrompt)) {
    return { leak: true, contradicts: false, reason: "reply contains the final answer" };
  }
  try {
    const r = await completeJson<Partial<GuardResult>>("check", leakCheckMessages({ ctx, reply, verdictLines }));
    return { leak: Boolean(r?.leak), contradicts: Boolean(r?.contradicts), reason: String(r?.reason ?? "") };
  } catch (e) {
    console.warn("[leak] LLM check failed; deterministic check only:", (e as Error)?.message);
    return { leak: false, contradicts: false, reason: "" };
  }
}

/**
 * Generate a tutor reply and run the leak + contradiction guard (SPEC §8.3).
 * Regenerates once; if the second draft still fails, returns the safe fallback.
 */
export async function tutorReply(opts: {
  ctx: ProblemContext;
  hintsUsed: number;
  history: Pick<Message, "role" | "content">[];
  verdictLines: string[];
  extraSystem?: string;
}): Promise<{ reply: string; provider: string; blocked: boolean }> {
  const { ctx, hintsUsed, history, verdictLines, extraSystem } = opts;
  const messages: ChatMessage[] = [{ role: "system", content: tutorSystemPrompt(ctx, hintsUsed, verdictLines) }];
  for (const m of history.slice(-20)) {
    messages.push({ role: m.role === "tutor" ? "assistant" : "user", content: m.content });
  }
  if (extraSystem) messages.push({ role: "system", content: extraSystem });

  const first = await complete("tutor", messages);
  let draft = first.text.trim();
  let provider: string = first.provider;
  let g = await guard(ctx, draft, verdictLines);
  if (!g.leak && !g.contradicts && draft) return { reply: draft, provider, blocked: false };

  console.warn(`[leak] draft rejected (${g.leak ? "leak" : g.contradicts ? "contradiction" : "empty"}): ${g.reason}`);
  const note = g.leak
    ? "Your previous draft revealed too much. Rewrite it without stating or implying the final answer, and ask one guiding question."
    : `Your previous draft contradicted a verified fact: ${g.reason}. Rewrite it so it agrees with the verified facts.`;
  const retry = await complete("tutor", [...messages, { role: "assistant", content: draft }, { role: "system", content: note }]);
  draft = retry.text.trim();
  provider = retry.provider;
  g = await guard(ctx, draft, verdictLines);
  if (!g.leak && !g.contradicts && draft) return { reply: draft, provider, blocked: false };

  console.warn("[leak] blocked");
  return { reply: LEAK_FALLBACK, provider, blocked: true };
}
