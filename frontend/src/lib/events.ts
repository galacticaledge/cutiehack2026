/*
 * Fire-and-forget signals to the celebration layers mounted once in App.tsx
 * (kept apart from the components so this module stays tiny and import-safe).
 */

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Hearts rise when the court is convinced. */
export function heartsBurst() {
  window.dispatchEvent(new Event("socra:hearts"));
}

/** A short shower of falling playing-card suits. */
export function celebrate() {
  window.dispatchEvent(new Event("wonder:celebrate"));
}

export type WakeDetail = { amount: number | null; resolve: () => void };

/** Plays the sunrise and resolves when it's over (immediately for reduced motion). */
export function wakeUp(amount: number | null): Promise<void> {
  if (reducedMotion()) return Promise.resolve();
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent<WakeDetail>("socra:wakeup", { detail: { amount, resolve } }));
    setTimeout(resolve, 3200); // safety net if nothing is listening
  });
}
