import { Clock, Coffee, Crown, Rabbit, Sprout, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

/** The Cheshire Cat's grin (and eyes). `fading` makes it vanish and return, like the Cat. */
export function CheshireGrin({ className = "size-10", fading = false, style }: { className?: string; fading?: boolean; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 64 64" className={`${className} ${fading ? "cheshire-fade" : ""}`} style={style} aria-hidden="true">
      <defs>
        <linearGradient id="fur" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#9a6ad0" />
          <stop offset="1" stopColor="#d2679a" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#fur)" />
      <path d="M8 22c8 2 14 2 20 0M36 22c6 2 12 2 20 0M10 44c6-2 12-2 18 0" stroke="#fff" strokeOpacity=".22" strokeWidth="3" fill="none" />
      <path d="M13 31c6 15 32 15 38 0" fill="#fff" stroke="#2a2140" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M19 34v6M25.5 36v7M32 37v7M38.5 36v7M45 34v6" stroke="#2a2140" strokeWidth="1.4" />
      <ellipse cx="22" cy="20" rx="5.2" ry="4.2" fill="#f5d44a" />
      <ellipse cx="42" cy="20" rx="5.2" ry="4.2" fill="#f5d44a" />
      <rect x="21" y="16.2" width="2" height="7.6" rx="1" fill="#2a2140" />
      <rect x="41" y="16.2" width="2" height="7.6" rx="1" fill="#2a2140" />
    </svg>
  );
}

/** A jam tart, the Queen of Hearts' (and our) currency. */
export function Tart({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M2.5 12.5h19l-2 6.2a2 2 0 0 1-1.9 1.3H6.4a2 2 0 0 1-1.9-1.3z" fill="#e7b863" stroke="#9a6a1f" strokeWidth="1.2" />
      <path d="M4 12.5c0-3.6 3.6-5.5 8-5.5s8 1.9 8 5.5" fill="#c8314a" stroke="#8d1d31" strokeWidth="1.2" />
      <path d="M12 5.2c-.9-1.2-2.8-.6-2.5.9.2.9 2.5 2.4 2.5 2.4s2.3-1.5 2.5-2.4c.3-1.5-1.6-2.1-2.5-.9z" fill="#c8314a" />
    </svg>
  );
}

export interface Flavor {
  character: string;
  blurb: string;
  icon: LucideIcon;
  suit: "♥" | "♠" | "♦" | "♣";
  concept: string;
  practice: string[];
}

/** Story framing for each verified problem (the math itself lives on the server). */
export const FLAVOR: Record<string, Flavor> = {
  "alg-linear-1": { character: "The White Rabbit", blurb: "Solve the riddle stuck on a very late rabbit's pocket watch.", icon: Clock, suit: "♥", concept: "Linear equations", practice: ["Undo operations in reverse order", "Keep both sides balanced", "Check by substituting back"] },
  "cs-trace-loop-1": { character: "The Mad Hatter", blurb: "It's always six o'clock. Trace the tea-party loop.", icon: Coffee, suit: "♣", concept: "Tracing loops (CS1)", practice: ["What range(a, b) really visits", "The % (remainder) operator", "Tracking a running total"] },
  "calc-deriv-poly-1": { character: "The Caterpillar", blurb: "One side makes you grow. How fast is Alice changing?", icon: Sprout, suit: "♦", concept: "Derivatives", practice: ["The power rule, term by term", "Writing f′(x) symbolically", "Evaluating a rate at a point"] },
  "kin-freefall-1": { character: "Alice", blurb: "Down, down, down the rabbit hole. How long is the fall?", icon: Rabbit, suit: "♠", concept: "Free fall", practice: ["Starting from rest: v₀ = 0", "h = ½gt² and when to use it", "Solving for t before plugging in"] },
  "cs-trace-nested-1": { character: "The Queen of Hearts", blurb: "Count the card-soldier croquet hoops, or else.", icon: Crown, suit: "♥", concept: "Nested loops (CS1)", practice: ["Outer vs. inner loop counts", "Loops whose start depends on i", "Summing a pattern of counts"] },
};

export function flavorFor(id?: string | null): Flavor | undefined {
  return id ? FLAVOR[id] : undefined;
}

export function suitColor(suit: string) {
  return suit === "♥" || suit === "♦" ? "text-[var(--heart)]" : "text-[var(--night)]";
}

/** A short shower of falling playing-card suits. Fire with `window.dispatchEvent(new Event("wonder:celebrate"))`. */
export function FallingCards() {
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    const go = () => setBurst((b) => b + 1);
    window.addEventListener("wonder:celebrate", go);
    return () => window.removeEventListener("wonder:celebrate", go);
  }, []);
  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(0), 4500);
    return () => clearTimeout(t);
  }, [burst]);
  if (!burst) return null;
  const suits = ["♥", "♠", "♦", "♣"];
  return (
    <div aria-hidden="true">
      {Array.from({ length: 22 }, (_, i) => {
        const suit = suits[i % 4];
        const style = {
          left: `${(i * 37) % 100}%`,
          "--dx": `${((i * 53) % 120) - 60}px`,
          "--spin": `${360 + ((i * 97) % 360)}deg`,
          "--dur": `${2.6 + ((i * 13) % 14) / 10}s`,
          animationDelay: `${((i * 7) % 10) / 10}s`,
        } as React.CSSProperties;
        return (
          <span key={`${burst}-${i}`} className="falling-card" style={style}>
            <span className={`parchment flex h-10 w-7 items-center justify-center rounded-md text-lg ${suitColor(suit)}`}>{suit}</span>
          </span>
        );
      })}
    </div>
  );
}

export function celebrate() {
  window.dispatchEvent(new Event("wonder:celebrate"));
}
