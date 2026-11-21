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

