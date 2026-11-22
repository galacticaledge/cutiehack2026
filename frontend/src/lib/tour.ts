
const TOUR_KEY = "socra:toured";

export function hasToured() {
  try {
    return localStorage.getItem(TOUR_KEY) === "1";
  } catch {
    return true;
  }
}

export function markToured() {
  try {
    localStorage.setItem(TOUR_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}
