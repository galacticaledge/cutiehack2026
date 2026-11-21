// Pure reward formula (SPEC §10). Amounts here are whole LEARN.

export const BASE = 100;
const HINT_MULT = [1.0, 0.75, 0.5, 0.3];

export interface RewardInput {
  difficulty: number;
  hintsUsed: number;
  wrongAttempts: number;
  explainPassed: boolean;
  flagged: boolean;
  earnedToday: number;
  dailyCap: number;
}

export interface BreakdownItem {
  label: string;
  value: number;
}

export interface RewardResult {
  amount: number;
  status: "pay" | "forfeited";
  breakdown: BreakdownItem[];
  summary: string;
  capped: boolean;
}

export function hintMult(hintsUsed: number): number {
  return HINT_MULT[Math.min(Math.max(hintsUsed, 0), 3)];
}

export function attemptMult(wrongAttempts: number): number {
  return Math.max(0.6, 1 - 0.1 * Math.max(0, wrongAttempts));
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Reward before the daily cap (used for the "Potential reward" display). */
export function potentialReward(difficulty: number, hintsUsed: number, wrongAttempts: number, explainPassed = true): number {
  const base = BASE * difficulty;
  const raw = base * hintMult(hintsUsed) * attemptMult(wrongAttempts) * (explainPassed ? 1 : 0.5);
  return Math.round(Math.max(raw, 0.2 * base));
}

export function computeReward(input: RewardInput): RewardResult {
  const base = BASE * input.difficulty;
  const hm = hintMult(input.hintsUsed);
  const am = attemptMult(input.wrongAttempts);
  const um = input.explainPassed ? 1.0 : 0.5;
  const breakdown: BreakdownItem[] = [
    { label: "Base", value: base },
    { label: "Hints", value: hm },
    { label: "Attempts", value: am },
    { label: "Understanding", value: um },
  ];

  if (input.flagged && !input.explainPassed) {
    return { amount: 0, status: "forfeited", breakdown, summary: "Flagged solve and explanation didn't pass: reward forfeited", capped: false };
  }

  const raw = base * hm * am * um;
  const floored = Math.round(Math.max(raw, 0.2 * base));
  const room = Math.max(0, input.dailyCap - input.earnedToday);
  const amount = Math.max(0, Math.min(floored, room));
  const capped = amount < floored;

  const parts = breakdown.filter((b, i) => i === 0 || b.value !== 1).map((b) => `${b.label} ${fmt(b.value)}`);
  let summary = `${parts.join(" × ")} = ${floored} LEARN`;
  if (raw < 0.2 * base) summary += " (minimum)";
  if (capped) summary += amount === 0 ? " · daily cap reached" : ` · capped to ${amount} by the daily limit`;
  return { amount, status: "pay", breakdown, summary, capped };
}
