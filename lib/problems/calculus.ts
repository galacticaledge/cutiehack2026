import { derivative, parse } from "mathjs";
import { rng } from "../rng";
import type { ProblemTemplate } from "./types";

function term(coef: number, power: string, first: boolean): string {
  if (coef === 0) return "";
  const sign = coef < 0 ? "-" : first ? "" : "+";
  const abs = Math.abs(coef);
  const c = abs === 1 && power ? "" : String(abs);
  return `${first ? sign : ` ${sign} `}${c}${power}`;
}

export const derivPoly1: ProblemTemplate = {
  id: "calc-deriv-poly-1",
  title: "Evaluate a derivative",
  concept: "derivatives-power-rule",
  difficulty: 2,
  minSolveSeconds: 40,
  learnMoreQuery: "power rule derivative of polynomial explained",
  generate(seed) {
    const r = rng(seed);
    const a = r.intExcept(-5, 7, [0]);
    const b = r.intExcept(-6, 6, [0]);
    const c = r.intExcept(-9, 9, [0]);
    const k = r.intExcept(-3, 3, [0]);
    const fx = `${a}*x^3 + ${b}*x^2 + ${c}*x`;
    // Computed with mathjs, not hand-written.
    const dfx = derivative(parse(fx), "x").toString();
    const answer = 3 * a * k * k + 2 * b * k + c;
    const latex = term(a, "x^3", true) + term(b, "x^2", false) + term(c, "x", false);
    return {
      prompt: `Let $f(x) = ${latex}$. Find $f'(${k})$.`,
      answer,
      tolerance: 1e-9,
      solutionSteps: [
        "Apply the power rule to each term: d/dx of x^n is n·x^(n-1).",
        "Write f'(x) as a polynomial in x.",
        `Substitute x = ${k} into f'(x) (the student should do the arithmetic).`,
      ],
      hints: [
        "What rule tells you the derivative of $x^n$?",
        "Differentiate term by term: $\\frac{d}{dx}x^n = n x^{n-1}$, and constants multiply through.",
        `The first term of $f'(x)$ is $${3 * a}x^2$. Find the rest, then plug in $x = ${k}$.`,
      ],
      checkpoints: [
        { id: "derivative", label: "the derivative f'(x)", kind: "expression", value: dfx, variable: "x" },
        { id: "final", label: `value of f'(${k})`, kind: "number", value: answer, tolerance: 1e-9 },
      ],
    };
  },
};
