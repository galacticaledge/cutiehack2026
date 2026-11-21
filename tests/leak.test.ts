import { describe, expect, it } from "vitest";
import { deterministicLeak, extractNumbers } from "../lib/leak";

const prompt = "Solve for $x$: $2x + 3 = 17$";

describe("deterministicLeak", () => {
  it.each([
    "So x = 7.",
    "x equals 7",
    "That gives $x = \\frac{14}{2}$",
    "You get 14/2, which is the answer.",
    "Great, so $x=7$!",
  ])("catches %s", (reply) => {
    expect(deterministicLeak(reply, 7, 1e-9, prompt)).toBe(true);
  });

  it("passes a reply containing only numbers from the prompt", () => {
    expect(deterministicLeak("You have $2x + 3 = 17$. What could you do with the 3?", 7, 1e-9, prompt)).toBe(false);
  });

  it("passes a reply with intermediate numbers", () => {
    expect(deterministicLeak("Nice, $2x = 14$. What's next?", 7, 1e-9, prompt)).toBe(false);
  });

  it("does not flag when the answer number is already in the prompt", () => {
    expect(deterministicLeak("Look at the 3 on the left.", 3, 1e-9, prompt)).toBe(false);
  });

  it("catches negative answers stated as magnitude or with unicode minus", () => {
    const p = "Solve for $x$: $3x + 5 = -16$";
    expect(deterministicLeak("x = −7", -7, 1e-9, p)).toBe(true);
    expect(deterministicLeak("x is negative 7", -7, 1e-9, p)).toBe(true);
  });

  it("respects tolerance for decimals", () => {
    const ans = Math.sqrt(100 / 9.8);
    expect(deterministicLeak("about 3.19 seconds", ans, 0.05, "dropped from 50 m")).toBe(true);
    expect(deterministicLeak("use g = 9.8", ans, 0.05, "dropped from 50 m")).toBe(false);
  });
});

describe("extractNumbers", () => {
  it("handles commas and fractions", () => {
    expect(extractNumbers("1,234 and \\dfrac{3}{4}")).toEqual(expect.arrayContaining([1234, 0.75]));
  });
});
