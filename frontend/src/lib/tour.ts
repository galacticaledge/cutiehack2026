/* The White Rabbit's tour: remembered per browser so it only plays once. */

const TOUR_KEY = "socra:toured";

export function hasToured() {
  try {
    return localStorage.getItem(TOUR_KEY) === "1";
  } catch {
    return true; // no storage: don't nag every time
  }
}

export function markToured() {
  try {
    localStorage.setItem(TOUR_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** True when a keypress is going into a text box (so page shortcuts stay out of the way). */
export function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}
