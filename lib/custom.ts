import "server-only";
import { parseAnswer } from "./answers";
import type { CustomRef } from "./context";
import { completeJson } from "./llm";
import { getTemplate } from "./problems";
import { intakeProblemMessages, intakeTopicMessages } from "./prompts";

export const CUSTOM_MAX = 2000;

function cleanTemplateId(id: unknown): string | null {
  return typeof id === "string" && getTemplate(id) ? id : null;
}

/** Hidden reference-solution call for a pasted problem. SERVER ONLY result. Never throws. */
export async function intakeProblem(text: string): Promise<CustomRef> {
  try {
    const r = await completeJson<CustomRef>("tutor", intakeProblemMessages(text), "medium");
    if (!r) return { academic: true, solvable: false, steps: [], matchedTemplateId: null, numericAnswer: null, finalAnswer: null };
    let numeric = typeof r.numericAnswer === "number" && Number.isFinite(r.numericAnswer) ? r.numericAnswer : null;
    // Cross-check numericAnswer against finalAnswer with mathjs when finalAnswer is a plain expression.
    if (typeof r.finalAnswer === "string") {
      const p = parseAnswer(r.finalAnswer);
      if (p.ok) {
        if (numeric === null) numeric = p.value;
        else if (Math.abs(p.value - numeric) > Math.max(1e-6, Math.abs(numeric) * 1e-3)) numeric = null;
      }
    }
    return {
      academic: r.academic !== false,
      solvable: Boolean(r.solvable),
      finalAnswer: typeof r.finalAnswer === "string" ? r.finalAnswer.slice(0, 500) : null,
      numericAnswer: numeric,
      steps: Array.isArray(r.steps) ? r.steps.slice(0, 12).map((s) => String(s).slice(0, 400)) : [],
      matchedTemplateId: cleanTemplateId(r.matchedTemplateId),
    };
  } catch (e) {
    console.warn("[custom] intake failed:", (e as Error)?.message);
    return { academic: true, solvable: false, steps: [], matchedTemplateId: null, numericAnswer: null, finalAnswer: null };
  }
}

export async function intakeTopic(text: string): Promise<CustomRef> {
  try {
    const r = await completeJson<CustomRef>("check", intakeTopicMessages(text));
    return { academic: r?.academic !== false, matchedTemplateId: cleanTemplateId(r?.matchedTemplateId), steps: [] };
  } catch (e) {
    console.warn("[custom] topic intake failed:", (e as Error)?.message);
    return { academic: true, matchedTemplateId: null, steps: [] };
  }
}
