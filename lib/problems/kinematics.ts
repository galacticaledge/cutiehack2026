import { rng } from "../rng";
import type { ProblemTemplate } from "./types";

export const freefall1: ProblemTemplate = {
  id: "kin-freefall-1",
  title: "Free fall time",
  concept: "kinematics-free-fall",
  difficulty: 2,
  minSolveSeconds: 40,
  learnMoreQuery: "free fall time from height kinematics explained",
  generate(seed) {
    const r = rng(seed);
    const h = r.int(20, 80);
    const g = 9.8;
    const answer = Math.sqrt((2 * h) / g);
    return {
      prompt: `A ball is dropped from rest from a height of $${h}\\,\\text{m}$. Using $g = 9.8\\,\\text{m/s}^2$ and ignoring air resistance, how long does it take to hit the ground? Give your answer in seconds (2 decimal places, or an exact expression like \`sqrt(...)\`).`,
      answer,
      tolerance: 0.05,
      solutionSteps: [
        "The ball is dropped, so the initial velocity is v₀ = 0.",
        "Use the displacement equation h = v₀t + ½gt², which becomes h = ½gt².",
        "Solve for t symbolically: t² = 2h/g, so t = √(2h/g). Then the student substitutes the numbers.",
      ],
      hints: [
        "What is the ball's initial velocity if it's dropped?",
        "Which kinematics equation relates distance, acceleration and time when you don't know the final velocity?",
        "With $v_0 = 0$ you get $h = \\tfrac{1}{2} g t^2$. Solve that for $t$.",
      ],
      checkpoints: [
        { id: "v0", label: "initial velocity", kind: "number", value: 0, tolerance: 1e-9 },
        { id: "t_squared", label: "value of t squared (in s²)", kind: "number", value: (2 * h) / g, tolerance: 0.05 },
        { id: "final", label: "time to hit the ground", kind: "number", value: answer, tolerance: 0.05 },
      ],
    };
  },
};
