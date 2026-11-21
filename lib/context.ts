import "server-only";
import type { ProblemSession } from "@prisma/client";
import { getTemplate } from "./problems";
import type { Checkpoint, GeneratedProblem, ProblemTemplate } from "./problems/types";

export interface CustomRef {
  academic?: boolean;
  solvable?: boolean;
  finalAnswer?: string | null;
  numericAnswer?: number | null;
  steps?: string[];
  matchedTemplateId?: string | null;
}

/** SERVER ONLY view of a session's problem, including the answer. */
export interface ProblemContext {
  source: "bank" | "custom_problem" | "custom_topic";
  title: string;
  displayPrompt: string; // safe to send to the client
  steps: string[];
  hints: string[]; // all hints (bank only)
  answer: number | null; // SERVER ONLY
  tolerance: number;
  checkpoints: Checkpoint[]; // SERVER ONLY
  difficulty: number;
  template?: ProblemTemplate;
  problem?: GeneratedProblem;
  customRef?: CustomRef;
  customText?: string;
  academic: boolean;
}

export function problemContext(s: ProblemSession): ProblemContext {
  if (s.source === "bank") {
    const template = getTemplate(s.templateId);
    if (!template) throw new Error(`Unknown template ${s.templateId}`);
    const problem = template.generate(s.seed);
    return {
      source: "bank",
      title: template.title,
      displayPrompt: problem.prompt,
      steps: problem.solutionSteps,
      hints: problem.hints,
      answer: problem.answer,
      tolerance: problem.tolerance,
      checkpoints: problem.checkpoints,
      difficulty: template.difficulty,
      template,
      problem,
      academic: true,
    };
  }
  const ref = (s.customRef ?? {}) as CustomRef;
  const numeric = typeof ref.numericAnswer === "number" && Number.isFinite(ref.numericAnswer) ? ref.numericAnswer : null;
  const text = s.customText ?? "";
  const isTopic = s.source === "custom_topic";
  return {
    source: isTopic ? "custom_topic" : "custom_problem",
    title: isTopic ? `Topic: ${text.slice(0, 60)}` : "Your problem",
    displayPrompt: text,
    steps: Array.isArray(ref.steps) ? ref.steps.slice(0, 12).map(String) : [],
    hints: [],
    answer: isTopic ? null : numeric,
    tolerance: numeric === null ? 0 : Math.max(1e-6, Math.abs(numeric) * 1e-3),
    checkpoints: [],
    difficulty: 0,
    customRef: ref,
    customText: text,
    academic: ref.academic !== false,
  };
}
