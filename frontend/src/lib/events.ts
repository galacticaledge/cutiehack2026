
function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function heartsBurst() {
  window.dispatchEvent(new Event("socra:hearts"));
}

export function celebrate() {
  window.dispatchEvent(new Event("wonder:celebrate"));
}

export type WakeDetail = { amount: number | null; resolve: () => void };

export function wakeUp(amount: number | null): Promise<void> {
  if (reducedMotion()) return Promise.resolve();
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent<WakeDetail>("socra:wakeup", { detail: { amount, resolve } }));
    setTimeout(resolve, 3200);
  });
}
