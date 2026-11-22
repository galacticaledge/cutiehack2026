import { useEffect, useId, useState } from "react";
import { suitColor } from "@/lib/flavor";

export type CatMood = "neutral" | "delighted" | "puzzled" | "secretive";

export function CheshireGrin({
  className = "size-10",
  fading = false,
  style,
  mood = "neutral",
}: {
  className?: string;
  fading?: boolean;
  style?: React.CSSProperties;
  mood?: CatMood;
}) {
  const id = useId().replace(/:/g, "");
  const tilt = mood === "puzzled" ? "rotate(-14 32 32)" : undefined;
  return (
    <svg viewBox="0 0 64 64" className={`${className} ${fading ? "cheshire-fade" : ""}`} style={style} aria-hidden="true" data-mood={mood}>
      <defs>
        <linearGradient id={`fur-${id}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#9a6ad0" />
          <stop offset="1" stopColor="#d2679a" />
        </linearGradient>
      </defs>
      <g transform={tilt} className="cat-face">
        <circle cx="32" cy="32" r="30" fill={`url(#fur-${id})`} />
        <path d="M8 22c8 2 14 2 20 0M36 22c6 2 12 2 20 0M10 44c6-2 12-2 18 0" stroke="#fff" strokeOpacity=".22" strokeWidth="3" fill="none" />
        {mood === "secretive" ? (
          <path d="M16 36c6 7 26 7 32 0" fill="none" stroke="#2a2140" strokeWidth="2.5" strokeLinecap="round" />
        ) : mood === "delighted" ? (
          <>
            <path d="M10 29c7 19 37 19 44 0" fill="#fff" stroke="#2a2140" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M17 33v7M24 35v8M32 36v8M40 35v8M47 33v7" stroke="#2a2140" strokeWidth="1.4" />
          </>
        ) : mood === "puzzled" ? (
          <>
            <path d="M17 35c5 9 25 9 30 0" fill="#fff" stroke="#2a2140" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M24 37v5M32 38v5M40 37v5" stroke="#2a2140" strokeWidth="1.3" />
          </>
        ) : (
          <>
            <path d="M13 31c6 15 32 15 38 0" fill="#fff" stroke="#2a2140" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M19 34v6M25.5 36v7M32 37v7M38.5 36v7M45 34v6" stroke="#2a2140" strokeWidth="1.4" />
          </>
        )}
        {mood === "delighted" ? (
          <>
            <path d="M16.5 21c2-4 9-4 11 0" fill="none" stroke="#2a2140" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M36.5 21c2-4 9-4 11 0" fill="none" stroke="#2a2140" strokeWidth="2.4" strokeLinecap="round" />
          </>
        ) : mood === "secretive" ? (
          <>
            <path d="M16.8 20h10.4a5.2 2.4 0 0 1-10.4 0z" fill="#f5d44a" />
            <path d="M36.8 20h10.4a5.2 2.4 0 0 1-10.4 0z" fill="#f5d44a" />
            <path d="M16 19.5h12M36 19.5h12" stroke="#2a2140" strokeWidth="2" strokeLinecap="round" />
            <rect x="26" y="20" width="1.6" height="2.4" rx=".8" fill="#2a2140" />
            <rect x="46" y="20" width="1.6" height="2.4" rx=".8" fill="#2a2140" />
          </>
        ) : (
          <>
            <ellipse cx="22" cy="20" rx="5.2" ry={mood === "puzzled" ? 3.2 : 4.2} fill="#f5d44a" />
            <ellipse cx="42" cy="20" rx={mood === "puzzled" ? 6 : 5.2} ry={mood === "puzzled" ? 5 : 4.2} fill="#f5d44a" />
            <rect x="21" y="16.2" width="2" height="7.6" rx="1" fill="#2a2140" />
            <rect x="41" y="16.2" width="2" height="7.6" rx="1" fill="#2a2140" />
          </>
        )}
      </g>
    </svg>
  );
}

export function CheshireAppearing({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`cat-appearing ${className}`} aria-hidden="true">
      <circle className="ca-face" cx="32" cy="32" r="30" fill="#b07acb" />
      <g className="ca-eyes">
        <ellipse cx="22" cy="20" rx="5.2" ry="4.2" fill="#f5d44a" />
        <ellipse cx="42" cy="20" rx="5.2" ry="4.2" fill="#f5d44a" />
        <rect x="21" y="16.2" width="2" height="7.6" rx="1" fill="#2a2140" />
        <rect x="41" y="16.2" width="2" height="7.6" rx="1" fill="#2a2140" />
      </g>
      <path className="ca-grin" d="M13 31c6 15 32 15 38 0" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" pathLength={100} />
      <path className="ca-teeth" d="M19 34v6M25.5 36v7M32 37v7M38.5 36v7M45 34v6" stroke="#fff" strokeWidth="1.6" />
    </svg>
  );
}

export function Tart({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M2.5 12.5h19l-2 6.2a2 2 0 0 1-1.9 1.3H6.4a2 2 0 0 1-1.9-1.3z" fill="#e7b863" stroke="#9a6a1f" strokeWidth="1.2" />
      <path d="M4 12.5c0-3.6 3.6-5.5 8-5.5s8 1.9 8 5.5" fill="#c8314a" stroke="#8d1d31" strokeWidth="1.2" />
      <path d="M12 5.2c-.9-1.2-2.8-.6-2.5.9.2.9 2.5 2.4 2.5 2.4s2.3-1.5 2.5-2.4c.3-1.5-1.6-2.1-2.5-.9z" fill="#c8314a" />
    </svg>
  );
}

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
