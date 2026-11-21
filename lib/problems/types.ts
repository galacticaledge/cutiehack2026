// SERVER ONLY. GeneratedProblem.answer and checkpoints must never reach the client.

export interface GeneratedProblem {
  prompt: string; // markdown + LaTeX shown to the student
  answer: number; // SERVER ONLY
  tolerance: number;
  solutionSteps: string[]; // for the tutor; MUST NOT contain the final computed answer
  hints: [string, string, string]; // nudge → concept → partial step
  checkpoints: Checkpoint[]; // SERVER ONLY: ground truth for the symbolic verifier
}

// An intermediate quantity a student might state while working.
// `label` is a neutral description; it never contains the value.
export type Checkpoint =
  | { id: string; label: string; kind: "number"; value: number; tolerance: number }
  | { id: string; label: string; kind: "expression"; value: string; variable: string }
  | { id: string; label: string; kind: "list"; value: number[] };

export interface ProblemTemplate {
  id: string;
  title: string;
  concept: string;
  difficulty: 1 | 2 | 3;
  minSolveSeconds: number;
  learnMoreQuery: string;
  generate(seed: number): GeneratedProblem;
}
