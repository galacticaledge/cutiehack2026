import { describe, expect, it } from "vitest";
import { checkAnswer, isLocked, parseAnswer } from "../lib/answers";

describe("parseAnswer", () => {
  it.each([
    ["7", 7],
    ["-3", -3],
    ["−3", -3],
    ["2.5", 2.5],
    ["3/4", 0.75],
    ["-14/2", -7],
    ["sqrt(16)", 4],
    ["2*pi", 2 * Math.PI],
    ["√9", 3],
    [" 42 ", 42],
  ])("accepts %s", (input, value) => {
    const p = parseAnswer(input);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.value).toBeCloseTo(value, 9);
  });

  it.each(["", "x = 7", "seven", "7x", "import os", "a".repeat(41), "1".repeat(41), "1/0", "cos(0)", "e^2"])(
    "rejects %s",
    (input) => {
      expect(parseAnswer(input).ok).toBe(false);
    },
  );
});

describe("checkAnswer", () => {
  it("correct within tolerance", () => {
    const r = checkAnswer("3.19", Math.sqrt(100 / 9.8), 0.05);
    expect(r.ok && r.correct).toBe(true);
  });
  it("wrong outside tolerance", () => {
    const r = checkAnswer("3.3", Math.sqrt(100 / 9.8), 0.05);
    expect(r.ok && !r.correct).toBe(true);
  });
  it("exact integers", () => {
    expect(checkAnswer("7", 7, 0)).toMatchObject({ ok: true, correct: true });
    expect(checkAnswer("8", 7, 0)).toMatchObject({ ok: true, correct: false });
  });
  it("unparseable doesn't count", () => {
    expect(checkAnswer("x=7", 7, 0).ok).toBe(false);
  });
});

describe("locking", () => {
  it("locks after 5 wrong, each hint unlocks 2 more", () => {
    expect(isLocked(4, 0)).toBe(false);
    expect(isLocked(5, 0)).toBe(true);
    expect(isLocked(5, 1)).toBe(false);
    expect(isLocked(7, 1)).toBe(true);
  });
});
