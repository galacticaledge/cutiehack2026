import { rng } from "../rng";
import type { ProblemTemplate } from "./types";

export const traceLoop1: ProblemTemplate = {
  id: "cs-trace-loop-1",
  title: "Trace a loop (CS1)",
  concept: "code-tracing-loops",
  difficulty: 2,
  minSolveSeconds: 40,
  learnMoreQuery: "python for loop range modulo tracing explained",
  generate(seed) {
    const r = rng(seed);
    const a = r.int(1, 5);
    const b = r.int(12, 25);
    const k = r.int(2, 4);
    // Ground truth: run the same loop in TypeScript.
    const rangeValues: number[] = [];
    const kept: number[] = [];
    let total = 0;
    for (let i = a; i < b; i++) {
      rangeValues.push(i);
      if (i % k === 0) {
        kept.push(i);
        total += i;
      }
    }
    const firstMultiple = Math.ceil(a / k) * k;
    const code = [
      "total = 0",
      `for i in range(${a}, ${b}):`,
      `    if i % ${k} == 0:`,
      "        total += i",
      "print(total)",
    ].join("\n");
    return {
      prompt: `What does this Python code print?\n\n\`\`\`python\n${code}\n\`\`\``,
      answer: total,
      tolerance: 0,
      solutionSteps: [
        `List the values range(${a}, ${b}) produces: from ${a} up to ${b - 1} (${b} is excluded).`,
        `Keep only the values where i % ${k} == 0, i.e. multiples of ${k}.`,
        "Add the kept values together; that sum is what gets printed.",
      ],
      hints: [
        "Which values does `i` take? Is `" + b + "` included?",
        "`%` gives the remainder; which values leave remainder 0?",
        `The first value that counts is ${firstMultiple}. Keep going.`,
      ],
      checkpoints: [
        { id: "range_values", label: "every value of i the loop visits", kind: "list", value: rangeValues },
        { id: "kept_values", label: "the values added to total", kind: "list", value: kept },
        { id: "final", label: "the printed total", kind: "number", value: total, tolerance: 0 },
      ],
    };
  },
};

export const traceNested1: ProblemTemplate = {
  id: "cs-trace-nested-1",
  title: "Count nested loop iterations (CS1)",
  concept: "code-tracing-nested-loops",
  difficulty: 3,
  minSolveSeconds: 60,
  learnMoreQuery: "nested loops counting iterations python explained",
  generate(seed) {
    const r = rng(seed);
    const n = r.int(3, 6);
    const m = r.int(n + 1, n + 5);
    const inner: number[] = [];
    let count = 0;
    for (let i = 0; i < n; i++) {
      let c = 0;
      for (let j = i; j < m; j++) c++;
      inner.push(c);
      count += c;
    }
    const code = [
      "count = 0",
      `for i in range(${n}):`,
      `    for j in range(i, ${m}):`,
      "        count += 1",
      "print(count)",
    ].join("\n");
    return {
      prompt: `What does this Python code print?\n\n\`\`\`python\n${code}\n\`\`\``,
      answer: count,
      tolerance: 0,
      solutionSteps: [
        `The outer loop runs once for each i in range(${n}).`,
        `For a given i, the inner loop runs for j from i up to ${m - 1}, so ${m} - i times.`,
        "Add up the inner-loop counts for every value of i.",
      ],
      hints: [
        "How many times does the outer loop run? Which values does i take?",
        "The inner loop's start depends on i. How many values are in range(i, " + m + ")?",
        `When i = 0 the inner loop runs ${m} times. How many times when i = 1?`,
      ],
      checkpoints: [
        { id: "outer_count", label: "number of outer-loop iterations", kind: "number", value: n, tolerance: 0 },
        { id: "inner_count", label: "inner-loop iterations for each value of i, in order", kind: "list", value: inner },
        { id: "final", label: "the printed count", kind: "number", value: count, tolerance: 0 },
      ],
    };
  },
};
