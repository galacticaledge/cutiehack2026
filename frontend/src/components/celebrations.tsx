import { useEffect, useState } from "react";

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/* ---------------- Hearts burst (the court is convinced) ---------------- */

export function heartsBurst() {
  window.dispatchEvent(new Event("socra:hearts"));
}

export function HeartsBurst() {
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    const go = () => setBurst((n) => n + 1);
    window.addEventListener("socra:hearts", go);
    return () => window.removeEventListener("socra:hearts", go);
  }, []);
  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(0), 1600);
    return () => clearTimeout(t);
  }, [burst]);
  if (!burst || reducedMotion()) return null;
  const N = 16;
  return (
    <div className="hearts-burst" aria-hidden="true">
      {Array.from({ length: N }, (_, i) => {
        const angle = (360 / N) * i + (i % 2 ? 8 : -8);
        const dist = 120 + ((i * 47) % 90);
        return (
          <span
            key={`${burst}-${i}`}
            className="burst-heart"
            style={
              {
                "--angle": `${angle}deg`,
                "--dist": `${dist}px`,
                "--size": `${14 + ((i * 7) % 16)}px`,
                animationDelay: `${(i % 4) * 40}ms`,
                color: i % 3 === 0 ? "#f2b8c6" : "#c8314a",
              } as React.CSSProperties
            }
          >
            ♥
          </span>
        );
      })}
    </div>
  );
}

/* ---------------- Sparkle trail (landing page, mouse only) ---------------- */

const SPARKLE_COLORS = ["#e0b775", "#f2b8c6", "#b9deff", "#c79bf5"];

export function SparkleTrail() {
  useEffect(() => {
    const finePointer = window.matchMedia?.("(pointer: fine)").matches ?? false;
    if (!finePointer || reducedMotion()) return;
    const layer = document.createElement("div");
    layer.className = "sparkle-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
    let last = 0;
    let n = 0;
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - last < 40 || layer.childElementCount > 40) return;
      last = now;
      const s = document.createElement("span");
      s.className = "sparkle";
      s.textContent = n++ % 3 === 0 ? "✦" : "✧";
      s.style.left = `${e.clientX}px`;
      s.style.top = `${e.clientY}px`;
      s.style.color = SPARKLE_COLORS[n % SPARKLE_COLORS.length];
      s.style.setProperty("--dx", `${(Math.random() - 0.5) * 30}px`);
      s.style.setProperty("--dy", `${14 + Math.random() * 22}px`);
      s.style.fontSize = `${9 + Math.random() * 9}px`;
      s.addEventListener("animationend", () => s.remove(), { once: true });
      layer.appendChild(s);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      layer.remove();
    };
  }, []);
  return null;
}


/* ---------------- Waking up: a short sunrise when the trial ends ---------------- */

type WakeDetail = { amount: number | null; resolve: () => void };

/** Plays the sunrise and resolves when it's over (immediately for reduced motion). */
export function wakeUp(amount: number | null): Promise<void> {
  if (reducedMotion()) return Promise.resolve();
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent<WakeDetail>("socra:wakeup", { detail: { amount, resolve } }));
    setTimeout(resolve, 3200); // safety net if nothing is listening
  });
}

export function WakeUp() {
  const [wake, setWake] = useState<WakeDetail | null>(null);
  useEffect(() => {
    const on = (e: Event) => setWake((e as CustomEvent<WakeDetail>).detail);
    window.addEventListener("socra:wakeup", on);
    return () => window.removeEventListener("socra:wakeup", on);
  }, []);
  useEffect(() => {
    if (!wake) return;
    const t = setTimeout(() => {
      wake.resolve();
      setWake(null);
    }, 2400);
    return () => clearTimeout(t);
  }, [wake]);
  if (!wake) return null;
  const finish = () => {
    wake.resolve();
    setWake(null);
  };
  return (
    <div className="wakeup" onClick={finish} role="status" aria-live="polite">
      <div className="wakeup-stars" />
      <div className="wakeup-sun" />
      <div className="wakeup-hills" />
      <div className="wakeup-text">
        <p className="font-display">You woke up!</p>
        {wake.amount ? <p className="wakeup-tarts">+{wake.amount} tarts</p> : null}
      </div>
    </div>
  );
}

/* ---------------- Easter egg: the Cheshire flashbang ---------------- */

/** Spam the light/dark toggle (10 clicks in 4 s) and the Cat goes off like a flashbang.
 *  Skipped for reduced motion: it's a bright full-screen flash. */
export function Flashbang() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const go = () => {
      if (!reducedMotion()) setOn(true);
    };
    window.addEventListener("socra:flashbang", go);
    return () => window.removeEventListener("socra:flashbang", go);
  }, []);
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOn(false);
    window.addEventListener("keydown", onKey);
    const safety = setTimeout(() => setOn(false), 6000); // never get stuck if the video can't play
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(safety);
    };
  }, [on]);
  if (!on) return null;
  return (
    <div className="flashbang" onClick={() => setOn(false)} role="presentation" aria-hidden="true">
      <video src="/easter/flashbang.mp4" autoPlay muted playsInline onEnded={() => setOn(false)} onError={() => setOn(false)} />
    </div>
  );
}
