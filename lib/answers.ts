import { evaluate } from "mathjs";

export type ParsedAnswer = { ok: true; value: number } | { ok: false; error: string };

const UNREADABLE = "Couldn't read that answer";

/** Normalize unicode math glyphs a student might type or paste. */
export function normalizeMath(input: string): string {
  return input
    .replace(/[−–—]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/√\s*\(/g, "sqrt(")
    .replace(/√\s*([0-9.]+)/g, "sqrt($1)")
    .replace(/π/g, "pi")
    .replace(/\*\*/g, "^")
    .trim();
}

/**
 * Parse a student's final answer. Accepts integers, decimals, fractions, negatives,
 * sqrt(...) and pi. Rejects input over 40 chars or with other letters.
 */
export function parseAnswer(raw: string): ParsedAnswer {
  if (typeof raw !== "string") return { ok: false, error: UNREADABLE };
  const input = normalizeMath(raw);
  if (!input || input.length > 40) return { ok: false, error: UNREADABLE };
  const lettersOnly = input.replace(/sqrt|pi/gi, "");
  if (/[a-z_$\\]/i.test(lettersOnly)) return { ok: false, error: UNREADABLE };
  if (!/^[0-9+\-*/^().\sa-z]*$/i.test(input)) return { ok: false, error: UNREADABLE };
  try {
    const v = evaluate(input.toLowerCase());
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return { ok: false, error: UNREADABLE };
    return { ok: true, value: n };
  } catch {
    return { ok: false, error: UNREADABLE };
  }
}

export function isCorrect(value: number, answer: number, tolerance: number): boolean {
  return Math.abs(value - answer) <= Math.max(tolerance, 1e-9);
}

export type AnswerCheck =
  | { ok: true; correct: boolean; value: number }
  | { ok: false; error: string };

export function checkAnswer(raw: string, answer: number, tolerance: number): AnswerCheck {
  const p = parseAnswer(raw);
  if (!p.ok) return p;
  return { ok: true, correct: isCorrect(p.value, answer, tolerance), value: p.value };
}

/** Max wrong attempts allowed given hints used: 5, and each hint unlocks 2 more. */
export function attemptsAllowed(hintsUsed: number): number {
  return 5 + 2 * hintsUsed;
}

export function isLocked(wrongAttempts: number, hintsUsed: number): boolean {
  return wrongAttempts >= attemptsAllowed(hintsUsed);
}
