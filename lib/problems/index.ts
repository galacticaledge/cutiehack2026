import { linear1 } from "./algebra";
import { derivPoly1 } from "./calculus";
import { traceLoop1, traceNested1 } from "./cs";
import { freefall1 } from "./kinematics";
import type { ProblemTemplate } from "./types";

export const TEMPLATES: ProblemTemplate[] = [linear1, traceLoop1, derivPoly1, freefall1, traceNested1];

export function getTemplate(id: string | null | undefined): ProblemTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export type { ProblemTemplate, GeneratedProblem, Checkpoint } from "./types";
