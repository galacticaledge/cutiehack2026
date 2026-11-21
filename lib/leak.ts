// Deterministic leak check (SPEC §8.3 step 1). Pure: no LLM, no env.

/** Extract numbers from text: plain numbers, negatives, decimals and \frac{a}{b}. */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  let t = text.replace(/[−–]/g, "-");
  // \frac{a}{b}, \dfrac{a}{b}, \tfrac{a}{b}
  t = t.replace(/\\[dt]?frac\s*\{\s*(-?\d+(?:\.\d+)?)\s*\}\s*\{\s*(-?\d+(?:\.\d+)?)\s*\}/g, (_m, a, b) => {
    const den = Number(b);
    if (den !== 0) out.push(Number(a) / den);
    out.push(Number(a), Number(b));
    return " ";
  });
  // simple a/b fractions like 14/2
  t = t.replace(/(?<![\w.])(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)(?![\w.])/g, (_m, a, b) => {
    const den = Number(b);
    if (den !== 0) out.push(Number(a) / den);
    out.push(Number(a), Number(b));
    return " ";
  });
  const re = /(?<![\w.])-?\d+(?:,\d{3})*(?:\.\d+)?/g;
  for (const m of t.match(re) ?? []) {
    const n = Number(m.replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function near(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= Math.max(tol, 1e-9);
}

/**
 * True if the reply contains a number within tolerance of the answer that isn't
 * already in the problem prompt.
 */
export function deterministicLeak(reply: string, answer: number, tolerance: number, prompt: string): boolean {
  const promptNums = extractNumbers(prompt);
  const inPrompt = (n: number) => promptNums.some((p) => near(p, n, tolerance));
  for (const n of extractNumbers(reply)) {
    const hit = near(n, answer, tolerance) || (answer < 0 && near(n, -answer, tolerance));
    if (hit && !inPrompt(n)) return true;
  }
  return false;
}

export const LEAK_FALLBACK = "Good progress! What do you think the next step is, and why?";
