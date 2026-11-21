// Symbolic side of the neuro-symbolic pipeline (SPEC §8.5). Pure: no LLM.
import { evaluate, parse, simplify } from "mathjs";
import { normalizeMath } from "./answers";
import type { Checkpoint } from "./problems/types";

export interface Claim {
  checkpointId: string;
  claimed: string;
}

export type VerdictStatus = "correct" | "incorrect" | "unverifiable" | "final";

export interface Verdict {
  checkpointId: string;
  label: string;
  claimed: string;
  status: VerdictStatus;
}

const SAFE_EXPR = /^[0-9a-z+\-*/^().\s]*$/i;
const ALLOWED_FUNCS = new Set(["sqrt", "pi", "e", "sin", "cos", "tan", "exp", "log"]);

function safeExpr(raw: string, variable?: string): string | null {
  let s = normalizeMath(String(raw ?? ""));
  // "f'(x) = 21x^2 + ..." → keep the right-hand side
  if (s.includes("=")) s = s.slice(s.lastIndexOf("=") + 1).trim();
  if (!s || s.length > 200 || !SAFE_EXPR.test(s)) return null;
  const idents = s.match(/[a-z]+/gi) ?? [];
  for (const id of idents) {
    const low = id.toLowerCase();
    if (ALLOWED_FUNCS.has(low)) continue;
    if (variable && id === variable) continue;
    return null;
  }
  return s;
}

export function evalNumber(raw: string): number | null {
  const s = safeExpr(raw);
  if (s === null) return null;
  try {
    const v = evaluate(s);
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function parseList(raw: string): number[] | null {
  const s = normalizeMath(String(raw ?? ""));
  if (!s || s.length > 500) return null;
  if (/[a-z]/i.test(s.replace(/and/gi, ""))) return null;
  const nums = s.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  return nums.map(Number);
}

const SAMPLE_POINTS = [0.37, 1.3, -0.8, 2.1, -1.7];

export function equivalentExpressions(a: string, b: string, variable: string): boolean | null {
  const ea = safeExpr(a, variable);
  const eb = safeExpr(b, variable);
  if (ea === null || eb === null) return null;
  try {
    const ca = parse(ea).compile();
    const cb = parse(eb).compile();
    for (const p of SAMPLE_POINTS) {
      const va = Number(ca.evaluate({ [variable]: p }));
      const vb = Number(cb.evaluate({ [variable]: p }));
      if (!Number.isFinite(va) || !Number.isFinite(vb)) return null;
      if (Math.abs(va - vb) > 1e-6 * Math.max(1, Math.abs(va), Math.abs(vb))) return false;
    }
    try {
      const diff = simplify(`(${ea}) - (${eb})`).toString();
      if (diff !== "0" && /^-?\d/.test(diff) && Number(diff) !== 0) return false;
    } catch {
      /* simplify is optional */
    }
    return true;
  } catch {
    return null;
  }
}

export function verifyClaim(claim: Claim, checkpoints: Checkpoint[]): Verdict {
  const cp = checkpoints.find((c) => c.id === claim.checkpointId);
  const claimed = String(claim.claimed ?? "").slice(0, 200);
  if (!cp) return { checkpointId: claim.checkpointId || "unknown", label: "", claimed, status: "unverifiable" };
  const base = { checkpointId: cp.id, label: cp.label, claimed };
  // The final answer is never verified in chat.
  if (cp.id === "final") return { ...base, status: "final" };

  if (cp.kind === "number") {
    const n = evalNumber(claimed);
    if (n === null) return { ...base, status: "unverifiable" };
    return { ...base, status: Math.abs(n - cp.value) <= Math.max(cp.tolerance, 1e-9) ? "correct" : "incorrect" };
  }
  if (cp.kind === "expression") {
    const eq = equivalentExpressions(claimed, cp.value, cp.variable);
    if (eq === null) return { ...base, status: "unverifiable" };
    return { ...base, status: eq ? "correct" : "incorrect" };
  }
  const list = parseList(claimed);
  if (list === null) return { ...base, status: "unverifiable" };
  const same = list.length === cp.value.length && list.every((v, i) => Math.abs(v - cp.value[i]) < 1e-9);
  return { ...base, status: same ? "correct" : "incorrect" };
}

export function verifyClaims(claims: Claim[], checkpoints: Checkpoint[]): Verdict[] {
  return claims.slice(0, 6).map((c) => verifyClaim(c, checkpoints));
}

/** Lines for the tutor prompt. Never include expected values. */
export function verdictLines(verdicts: Verdict[]): string[] {
  const lines: string[] = [];
  let finalAdded = false;
  for (const v of verdicts) {
    if (v.status === "final") {
      if (!finalAdded) lines.push("The student proposed a final answer. Do not say whether it is right; ask them to submit it in the answer box.");
      finalAdded = true;
    } else if (v.status === "correct") lines.push(`${v.label}: student said ${v.claimed} → CORRECT`);
    else if (v.status === "incorrect") lines.push(`${v.label}: student said ${v.claimed} → INCORRECT`);
    else if (v.label) lines.push(`${v.label}: student said ${v.claimed} → could not be checked`);
  }
  return lines;
}

/** Client-safe chips: labels only, only correct/incorrect. */
export function verdictChips(verdicts: Verdict[] | null | undefined): { label: string; status: "correct" | "incorrect" }[] {
  return (verdicts ?? [])
    .filter((v) => v.status === "correct" || v.status === "incorrect")
    .map((v) => ({ label: v.label, status: v.status as "correct" | "incorrect" }));
}

/** Gate: skip the extractor for messages with no digits, operators or code-like tokens. */
export function looksMathy(message: string): boolean {
  return /\d|[+*/^=<>%\[\]]|\s-\s|\bsqrt\b|\bpi\b|\bx\b|range|print/i.test(message);
}
