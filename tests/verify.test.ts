import { describe, expect, it } from "vitest";
import type { Checkpoint } from "../lib/problems/types";
import { TEMPLATES } from "../lib/problems";
import { verdictChips, verdictLines, verifyClaim, verifyClaims } from "../lib/verify";

const cps: Checkpoint[] = [
  { id: "rhs", label: "right-hand side after removing the constant", kind: "number", value: 21, tolerance: 1e-9 },
  { id: "t2", label: "t squared", kind: "number", value: 10.2, tolerance: 0.05 },
  { id: "derivative", label: "the derivative f'(x)", kind: "expression", value: "21*x^2+8*x-3", variable: "x" },
  { id: "kept_values", label: "the values added to total", kind: "list", value: [3, 6, 9] },
  { id: "final", label: "value of x", kind: "number", value: 7, tolerance: 1e-9 },
];

const v = (checkpointId: string, claimed: string) => verifyClaim({ checkpointId, claimed }, cps).status;

describe("verifyClaim", () => {
  it("number within / outside tolerance", () => {
    expect(v("rhs", "21")).toBe("correct");
    expect(v("rhs", "20")).toBe("incorrect");
    expect(v("rhs", "42/2")).toBe("correct");
    expect(v("t2", "10.22")).toBe("correct");
    expect(v("t2", "10.4")).toBe("incorrect");
  });
  it("expression equivalence", () => {
    expect(v("derivative", "21x^2+8x-3")).toBe("correct");
    expect(v("derivative", "8x - 3 + 21*x^2")).toBe("correct");
    expect(v("derivative", "f'(x) = 21x^2 + 8x - 3")).toBe("correct");
    expect(v("derivative", "21x^2 + 8x")).toBe("incorrect");
  });
  it("list order matters", () => {
    expect(v("kept_values", "[3, 6, 9]")).toBe("correct");
    expect(v("kept_values", "3, 6 and 9")).toBe("correct");
    expect(v("kept_values", "[9, 6, 3]")).toBe("incorrect");
    expect(v("kept_values", "[3, 6]")).toBe("incorrect");
  });
  it("garbage input → unverifiable", () => {
    expect(v("rhs", "banana")).toBe("unverifiable");
    expect(v("derivative", "import os")).toBe("unverifiable");
    expect(v("kept_values", "some numbers")).toBe("unverifiable");
    expect(v("unknown", "21")).toBe("unverifiable");
  });
  it("final claims are never marked correct/incorrect", () => {
    expect(v("final", "7")).toBe("final");
    expect(v("final", "8")).toBe("final");
  });
});

describe("verdict rendering", () => {
  const verdicts = verifyClaims(
    [
      { checkpointId: "rhs", claimed: "20" },
      { checkpointId: "final", claimed: "7" },
      { checkpointId: "kept_values", claimed: "[3,6,9]" },
    ],
    cps,
  );
  it("lines never include expected values", () => {
    const lines = verdictLines(verdicts).join("\n");
    expect(lines).toContain("student said 20 → INCORRECT");
    expect(lines).not.toContain("21");
    expect(lines).toContain("Do not say whether it is right");
  });
  it("chips omit final and unverifiable", () => {
    expect(verdictChips(verdicts)).toEqual([
      { label: "right-hand side after removing the constant", status: "incorrect" },
      { label: "the values added to total", status: "correct" },
    ]);
  });
});

describe("templates", () => {
  it("checkpoints verify against their own ground truth and steps never contain the answer", () => {
    for (const t of TEMPLATES) {
      for (const seed of [1, 2, 3, 42, 999]) {
        const p = t.generate(seed);
        expect(p.checkpoints.some((c) => c.id === "final")).toBe(true);
        for (const c of p.checkpoints) {
          if (c.id === "final") continue;
          const claimed = c.kind === "list" ? JSON.stringify(c.value) : String(c.value);
          expect(verifyClaim({ checkpointId: c.id, claimed }, p.checkpoints).status).toBe("correct");
          expect(c.label).not.toContain(String(c.value));
        }
      }
    }
  });
  it("two seeds give different numbers", () => {
    for (const t of TEMPLATES) {
      expect(t.generate(1).prompt === t.generate(2).prompt && t.generate(3).prompt === t.generate(4).prompt).toBe(false);
    }
  });
});
