// Deterministic seeded RNG (mulberry32). Same seed → same problem numbers.
export interface Rng {
  next(): number; // [0, 1)
  int(min: number, max: number): number; // inclusive
  intExcept(min: number, max: number, except: number[]): number;
  pick<T>(items: readonly T[]): T;
}

export function rng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    intExcept(min, max, except) {
      for (let i = 0; i < 100; i++) {
        const v = int(min, max);
        if (!except.includes(v)) return v;
      }
      throw new Error("intExcept: no valid value");
    },
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2_000_000_000);
}

// Stable 31-bit hash of a string (used for fixed demo seeds).
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2_000_000_000;
}
