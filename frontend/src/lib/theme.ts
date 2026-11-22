import { useEffect, useState } from "react";

const KEY = "socra:looking-glass";
const THEME_EVENT = "socra:theme";

function storedPref(): "dark" | "light" | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "1" ? "dark" : v === "0" ? "light" : null;
  } catch {
    return null;
  }
}

function systemDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function applyDark(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function isDark() {
  return document.documentElement.classList.contains("dark");
}

export function initLookingGlass() {
  const pref = storedPref();
  document.documentElement.classList.toggle("dark", pref ? pref === "dark" : systemDark());
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", (e) => {
    if (!storedPref()) applyDark(e.matches);
  });
}

const SPAM_CLICKS = 10;
const SPAM_WINDOW_MS = 6500;
let recentClicks: number[] = [];
function countClick() {
  const now = Date.now();
  recentClicks = [...recentClicks.filter((t) => now - t < SPAM_WINDOW_MS), now];
  if (recentClicks.length >= SPAM_CLICKS) {
    recentClicks = [];
    window.dispatchEvent(new Event("socra:flashbang"));
  }
}

export function useLookingGlass() {
  const [on, setOn] = useState(isDark);
  useEffect(() => {
    const sync = () => setOn(isDark());
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);
  function toggle() {
    countClick();
    const root = document.documentElement;
    if (root.classList.contains("through-glass")) return;
    const next = !isDark();
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduce) {
      applyDark(next);
      return;
    }
    root.classList.add("through-glass");
    setTimeout(() => applyDark(next), 140);
    setTimeout(() => root.classList.remove("through-glass"), 330);
  }
  return { on, toggle };
}
