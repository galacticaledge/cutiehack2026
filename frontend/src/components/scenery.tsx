import { BookOpen, Clock, Coffee, Crown, Feather, FlaskConical, Heart, KeyRound, Moon, Rabbit, Spade, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/* ---------------- Side rails: the wide-screen margins become Wonderland ---------------- */

const FALLING = [Clock, KeyRound, Coffee, BookOpen, FlaskConical, Spade, Crown, Heart, Feather, Rabbit];

const QUOTES = [
  { q: "Why, sometimes I've believed as many as six impossible things before breakfast.", who: "The White Queen" },
  { q: "If you don't know where you are going, any road will get you there.", who: "after the Cheshire Cat" },
  { q: "Begin at the beginning, and go on till you come to the end: then stop.", who: "The King of Hearts" },
  { q: "Curiouser and curiouser!", who: "Alice" },
  { q: "It's no use going back to yesterday, because I was a different person then.", who: "Alice" },
  { q: "Everything's got a moral, if only you can find it.", who: "The Duchess" },
  { q: "I can't explain myself, I'm afraid, sir, because I'm not myself, you see.", who: "Alice" },
];

/** Left rail: things tumbling down the rabbit hole, forever. */
function RabbitHoleRail() {
  return (
    <div className="rail rail-left" aria-hidden="true">
      <div className="hole-mouth" />
      {FALLING.map((Icon, i) => (
        <Icon
          key={i}
          className="tumble"
          strokeWidth={1.4}
          style={
            {
              left: `${18 + ((i * 29) % 62)}%`,
              animationDelay: `${-i * 2.3}s`,
              animationDuration: `${17 + (i % 4) * 3}s`,
              "--sway": `${((i * 17) % 28) - 14}px`,
              "--rest": `${10 + i * 8.5}%`,
            } as React.CSSProperties
          }
        />
      ))}
      <p className="rail-caption font-display">Down, down, down…</p>
    </div>
  );
}

/** Right rail: a swinging pocket watch above a slowly turning book of quotes. */
function QuoteRail() {
  const [i, setI] = useState(() => Math.floor(Math.random() * QUOTES.length));
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % QUOTES.length), 11000);
    return () => clearInterval(t);
  }, []);
  const q = QUOTES[i];
  return (
    <div className="rail rail-right" aria-hidden="true">
      <div className="pendulum">
        <div className="chain" />
        <WatchFace className="size-16" />
      </div>
      <figure key={i} className="quote-card parchment flip-in">
        <blockquote className="font-display italic">“{q.q}”</blockquote>
        <figcaption>— {q.who}</figcaption>
      </figure>
      <div className="suit-ribbon font-display">♠ ♥ ♦ ♣</div>
    </div>
  );
}

export function WonderSides() {
  return (
    <>
      <RabbitHoleRail />
      <QuoteRail />
    </>
  );
}

/* ---------------- The White Rabbit's pocket watch ---------------- */

export function WatchFace({ className = "size-8", seconds }: { className?: string; seconds?: number }) {
  const sec = seconds ?? 0;
  const secAngle = sec * 6; // cumulative, so the hand never sweeps backwards past 12
  const minAngle = ((sec / 60) % 60) * 6;
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle cx="24" cy="5" r="3" fill="none" stroke="#c9962b" strokeWidth="2" />
      <circle cx="24" cy="27" r="19" fill="#e7c06a" stroke="#9a6a1f" strokeWidth="2" />
      <circle cx="24" cy="27" r="15.5" fill="#fffaf1" stroke="#c9962b" strokeWidth="1" />
      {Array.from({ length: 12 }, (_, k) => (
        <line key={k} x1="24" y1="13.5" x2="24" y2={k % 3 === 0 ? 16.5 : 15.2} stroke="#2a2140" strokeWidth={k % 3 === 0 ? 1.4 : 0.8} transform={`rotate(${k * 30} 24 27)`} />
      ))}
      <line x1="24" y1="27" x2="24" y2="18" stroke="#2a2140" strokeWidth="1.8" strokeLinecap="round" transform={`rotate(${minAngle} 24 27)`} />
      <line
        x1="24"
        y1="29"
        x2="24"
        y2="15"
        stroke="#c8314a"
        strokeWidth="0.9"
        strokeLinecap="round"
        style={{ transform: `rotate(${secAngle}deg)`, transformOrigin: "24px 27px", transition: seconds === undefined ? undefined : "transform 0.25s cubic-bezier(.4,2.2,.6,1)" }}
        className={seconds === undefined ? "tick-forever" : undefined}
      />
      <circle cx="24" cy="27" r="1.4" fill="#2a2140" />
    </svg>
  );
}

/** Ticks from `startedAt` until `stoppedAt` (if solved). */
export function PocketWatch({ startedAt, stoppedAt }: { startedAt: string; stoppedAt?: string | null }) {
  const start = new Date(startedAt).getTime();
  const end = stoppedAt ? new Date(stoppedAt).getTime() : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (end) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [end]);
  const secs = Math.max(0, Math.floor(((end ?? now) - start) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const sStr = String(secs % 60).padStart(2, "0");
  const label = h ? `${h}:${String(m).padStart(2, "0")}:${sStr}` : `${m}:${sStr}`;
  return (
    <span
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#ead9b8] bg-[#fff6e3] px-2 py-0.5 text-xs font-semibold tabular-nums text-[#7a5414] dark:border-[#5a4a2a] dark:bg-[#3a2e1a] dark:text-[#f1d79a]"
      title={end ? "Time in the dream" : "The White Rabbit's watch: time in this dream. No rush, slow thinking pays."}
    >
      <WatchFace className="size-5" seconds={secs} />
      {label}
    </span>
  );
}

/* ---------------- Through the Looking-Glass (dark mode) ---------------- */

const KEY = "socra:looking-glass";

export function initLookingGlass() {
  try {
    if (localStorage.getItem(KEY) === "1") document.documentElement.classList.add("dark");
  } catch {
    /* storage unavailable: stay on this side of the glass */
  }
}

export function useLookingGlass() {
  const [on, setOn] = useState(() => document.documentElement.classList.contains("dark"));
  function toggle() {
    const next = !on;
    const root = document.documentElement;
    root.classList.remove("through-glass");
    void root.offsetWidth; // restart the animation
    root.classList.add("through-glass");
    setTimeout(() => root.classList.toggle("dark", next), 280);
    setTimeout(() => root.classList.remove("through-glass"), 700);
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    setOn(next);
  }
  return { on, toggle };
}

export function LookingGlassToggle({ className = "" }: { className?: string }) {
  const { on, toggle } = useLookingGlass();
  return (
    <button
      type="button"
      onClick={toggle}
      className={`flex size-8 items-center justify-center rounded-full transition hover:bg-white/10 ${className}`}
      aria-label={on ? "Step back through the looking-glass (light mode)" : "Step through the looking-glass (dark mode)"}
      title={on ? "Back through the looking-glass" : "Through the looking-glass"}
    >
      {on ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

/* ---------------- Shrinking tart: hints and wrong tries make it smaller ---------------- */

export function ShrinkingTart({ value, max }: { value: number; max: number }) {
  const ratio = max > 0 ? Math.max(0.2, Math.min(1, value / max)) : 1;
  const prev = useRef(value);
  const [pulse, setPulse] = useState<{ cls: "" | "shrink-pop" | "grow-pop"; n: number }>({ cls: "", n: 0 });
  useEffect(() => {
    if (value === prev.current) return;
    const cls = value < prev.current ? "shrink-pop" : "grow-pop";
    prev.current = value;
    setPulse((p) => ({ cls, n: p.n + 1 }));
    const t = setTimeout(() => setPulse((p) => ({ ...p, cls: "" })), 900);
    return () => clearTimeout(t);
  }, [value]);
  const size = 14 + 22 * ratio;
  return (
    <span className="flex items-center gap-1.5" title="Each Drink Me bottle and wrong attempt makes the tart shrink. Chatting with the Cat is always free.">
      <span className="flex size-9 items-end justify-center">
        <svg key={pulse.n} viewBox="0 0 24 24" className={`tart-size ${pulse.cls}`} style={{ width: size, height: size }} aria-hidden="true">
          <path d="M2.5 12.5h19l-2 6.2a2 2 0 0 1-1.9 1.3H6.4a2 2 0 0 1-1.9-1.3z" fill="#e7b863" stroke="#9a6a1f" strokeWidth="1.2" />
          <path d="M4 12.5c0-3.6 3.6-5.5 8-5.5s8 1.9 8 5.5" fill="#c8314a" stroke="#8d1d31" strokeWidth="1.2" />
          <path d="M12 5.2c-.9-1.2-2.8-.6-2.5.9.2.9 2.5 2.4 2.5 2.4s2.3-1.5 2.5-2.4c.3-1.5-1.6-2.1-2.5-.9z" fill="#c8314a" />
        </svg>
      </span>
      <span>
        <span className="tabular-nums">{value}</span> tarts on the table
      </span>
    </span>
  );
}

/* ---------------- Dream clouds (echoing Cutie Hack 2026's sky) ---------------- */

function Cloud({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 200 80" className={`cloud ${className}`} style={style} aria-hidden="true">
      <path
        fill="currentColor"
        d="M30 70c-15 0-26-9-26-21s11-20 24-20c2-14 15-24 31-24 12 0 22 5 27 14 5-4 12-6 19-6 17 0 30 11 31 25 3-1 6-1 9-1 16 0 29 9 29 21s-12 12-27 12z"
      />
    </svg>
  );
}

const CLOUDS = [
  { top: "9%", w: 220, dur: 140, delay: -20, blue: false },
  { top: "22%", w: 140, dur: 110, delay: -75, blue: true },
  { top: "41%", w: 260, dur: 170, delay: -120, blue: false },
  { top: "63%", w: 170, dur: 130, delay: -40, blue: true },
  { top: "80%", w: 200, dur: 155, delay: -95, blue: false },
];

export function DreamClouds() {
  return (
    <div className="clouds" aria-hidden="true">
      {CLOUDS.map((c, i) => (
        <Cloud
          key={i}
          className={c.blue ? "blue" : ""}
          style={{ top: c.top, width: c.w, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s`, "--rest-x": `${[4, 70, 30, 82, 12][i]}vw` } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

/* ---------------- Footer ---------------- */

export function DreamFooter() {
  return (
    <footer className="relative z-[1] mt-16">
      <div className="checker" />
      <div className="bg-[var(--night)] px-4 py-5 text-center text-xs text-[#d6ecf7]">
        <p className="font-display text-base text-[#faf8f1]">Dream to Wonderland ✦ Cutie Hack 2026</p>
        <p className="mt-1">Made with 💗 and 🫖 at UC Riverside · Tarts are devnet tokens: for eating, not selling.</p>
      </div>
    </footer>
  );
}
