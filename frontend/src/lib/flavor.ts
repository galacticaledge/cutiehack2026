import { Clock, Coffee, Crown, Rabbit, Sprout, type LucideIcon } from "lucide-react";
import type { Emblem } from "@/components/doors";

export interface Flavor {
  character: string;
  blurb: string;
  icon: LucideIcon;
  suit: "♥" | "♠" | "♦" | "♣";
  concept: string;
  practice: string[];
  emblem: Emblem;
}

/** Story framing for each verified problem (the math itself lives on the server). */
export const FLAVOR: Record<string, Flavor> = {
  "alg-linear-1": { character: "The White Rabbit", blurb: "Solve the riddle stuck on a very late rabbit's pocket watch.", icon: Clock, suit: "♥", concept: "Linear equations", practice: ["Undo operations in reverse order", "Keep both sides balanced", "Check by substituting back"], emblem: "watch" },
  "cs-trace-loop-1": { character: "The Mad Hatter", blurb: "It's always six o'clock. Trace the tea-party loop.", icon: Coffee, suit: "♣", concept: "Tracing loops (CS1)", practice: ["What range(a, b) really visits", "The % (remainder) operator", "Tracking a running total"], emblem: "hat" },
  "calc-deriv-poly-1": { character: "The Caterpillar", blurb: "One side makes you grow. How fast is Alice changing?", icon: Sprout, suit: "♦", concept: "Derivatives", practice: ["The power rule, term by term", "Writing f′(x) symbolically", "Evaluating a rate at a point"], emblem: "mushroom" },
  "kin-freefall-1": { character: "Alice", blurb: "Down, down, down the rabbit hole. How long is the fall?", icon: Rabbit, suit: "♠", concept: "Free fall", practice: ["Starting from rest: v₀ = 0", "h = ½gt² and when to use it", "Solving for t before plugging in"], emblem: "hole" },
  "cs-trace-nested-1": { character: "The Queen of Hearts", blurb: "Count the card-soldier croquet hoops, or else.", icon: Crown, suit: "♥", concept: "Nested loops (CS1)", practice: ["Outer vs. inner loop counts", "Loops whose start depends on i", "Summing a pattern of counts"], emblem: "crown" },
};

export function flavorFor(id?: string | null): Flavor | undefined {
  return id ? FLAVOR[id] : undefined;
}

export function suitColor(suit: string) {
  return suit === "♥" || suit === "♦" ? "text-[var(--heart)]" : "text-[var(--night)]";
}
