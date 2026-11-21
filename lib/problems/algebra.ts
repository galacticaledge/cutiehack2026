import { rng } from "../rng";
import type { ProblemTemplate } from "./types";

export const linear1: ProblemTemplate = {
  id: "alg-linear-1",
  title: "Solve a linear equation",
  concept: "linear-equations",
  difficulty: 1,
  minSolveSeconds: 20,
  learnMoreQuery: "solving two-step linear equations explained",
  generate(seed) {
    const r = rng(seed);
    const a = r.int(2, 9);
    const x = r.intExcept(-10, 10, [0]);
    const b = r.intExcept(-20, 20, [0]);
    const c = a * x + b;
    const undo = b >= 0 ? `subtract ${b} from both sides` : `add ${-b} to both sides`;
    return {
      prompt: `Solve for $x$: $${a}x ${b >= 0 ? "+" : "-"} ${Math.abs(b)} = ${c}$`,
      answer: x,
      tolerance: 1e-9,
      solutionSteps: [
        `Undo the constant: ${undo}.`,
        `This gives ${a}x = ${c - b}.`,
        `Divide both sides by ${a}.`,
      ],
      hints: [
        "What operations are being applied to x, and in what order?",
        "Undo operations in reverse order: addition/subtraction first, then multiplication.",
        `After removing the constant you get $${a}x = ${c - b}$. What's next?`,
      ],
      checkpoints: [
        { id: "rhs", label: "right-hand side after removing the constant", kind: "number", value: c - b, tolerance: 1e-9 },
        { id: "final", label: "value of x", kind: "number", value: x, tolerance: 1e-9 },
      ],
    };
  },
};
