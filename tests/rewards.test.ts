import { describe, expect, it } from "vitest";
import { computeReward } from "../lib/rewards";

const base = { difficulty: 1, hintsUsed: 0, wrongAttempts: 0, explainPassed: true, flagged: false, earnedToday: 0, dailyCap: 1000 };

describe("computeReward", () => {
  it("d1, 0 hints, 0 wrong → 100", () => {
    expect(computeReward(base).amount).toBe(100);
  });
  it("d1, 3 hints, 6 wrong, explain failed → 20 (floor)", () => {
    const r = computeReward({ ...base, hintsUsed: 3, wrongAttempts: 6, explainPassed: false });
    expect(r.amount).toBe(20);
    expect(r.status).toBe("pay");
  });
  it("d2, 1 hint → 150", () => {
    expect(computeReward({ ...base, difficulty: 2, hintsUsed: 1 }).amount).toBe(150);
  });
  it("attempt multiplier bottoms out at 0.6", () => {
    expect(computeReward({ ...base, wrongAttempts: 2 }).amount).toBe(80);
    expect(computeReward({ ...base, wrongAttempts: 10 }).amount).toBe(60);
  });
  it("cap clamps", () => {
    const r = computeReward({ ...base, difficulty: 2, earnedToday: 950 });
    expect(r.amount).toBe(50);
    expect(r.capped).toBe(true);
  });
  it("cap reached → 0", () => {
    expect(computeReward({ ...base, earnedToday: 1000 }).amount).toBe(0);
    expect(computeReward({ ...base, earnedToday: 1200 }).amount).toBe(0);
  });
  it("flagged and failed explain → 0 forfeited", () => {
    const r = computeReward({ ...base, flagged: true, explainPassed: false });
    expect(r.amount).toBe(0);
    expect(r.status).toBe("forfeited");
  });
  it("flagged but passed explain pays normally", () => {
    const r = computeReward({ ...base, flagged: true, explainPassed: true });
    expect(r.amount).toBe(100);
    expect(r.status).toBe("pay");
  });
  it("breakdown text", () => {
    const r = computeReward({ ...base, difficulty: 2, hintsUsed: 1, wrongAttempts: 1 });
    expect(r.amount).toBe(135);
    expect(r.summary).toBe("Base 200 × Hints 0.75 × Attempts 0.9 = 135 LEARN");
  });
});
