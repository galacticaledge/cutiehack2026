import { BookOpen, Clock, Coffee, Crown, Download, FlaskConical, Heart, KeyRound, Rabbit, Share2, Spade, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { flavorFor, suitColor } from "@/components/wonder";
import { type Problem } from "@/lib/api";
import { play, setSfxEnabled, sfxEnabled } from "@/lib/sfx";

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/* ---------------- Sound toggle ---------------- */

export function SoundToggle({ className = "" }: { className?: string }) {
  const [on, setOn] = useState(sfxEnabled);
  useEffect(() => {
    const sync = () => setOn(sfxEnabled());
    window.addEventListener("socra:sfx", sync);
    return () => window.removeEventListener("socra:sfx", sync);
  }, []);
  return (
    <button
      type="button"
      onClick={() => {
        setSfxEnabled(!on);
        if (!on) setTimeout(() => play("clink"), 0);
      }}
      className={`flex size-8 items-center justify-center rounded-full transition hover:bg-white/10 ${className}`}
      aria-label={on ? "Turn sound effects off" : "Turn sound effects on"}
      aria-pressed={on}
      title={on ? "Sound effects on" : "Sound effects off"}
    >
      {on ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
    </button>
  );
}

/* ---------------- Falling intro (first open of a door) ---------------- */

const TUMBLERS = [Clock, KeyRound, Coffee, BookOpen, FlaskConical, Spade, Crown, Heart, Rabbit];

export function FallingIntro({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    if (reducedMotion()) {
      onDone();
      return;
    }
    const t = setTimeout(onDone, 2300);
    return () => clearTimeout(t);
  }, [onDone]);
  if (reducedMotion()) return null;
  return (
    <div className="falling-intro" onClick={onDone} role="presentation">
      {TUMBLERS.map((Icon, i) => (
        <Icon
          key={i}
          className="intro-tumble"
          strokeWidth={1.3}
          style={{ left: `${8 + ((i * 37) % 84)}%`, animationDelay: `${(i % 5) * 0.12}s`, animationDuration: `${1.3 + (i % 3) * 0.35}s` } as React.CSSProperties}
        />
      ))}
      <p className="intro-text font-display">Down, down, down…</p>
      <p className="intro-skip">click to land</p>
    </div>
  );
}

/* ---------------- The White Rabbit's tour ---------------- */

export interface TourStep {
  target: string; // data-tour value
  title: string;
  body: string;
}

const TOUR_KEY = "socra:toured";

export function hasToured() {
  try {
    return localStorage.getItem(TOUR_KEY) === "1";
  } catch {
    return true; // no storage: don't nag every time
  }
}

function markToured() {
  try {
    localStorage.setItem(TOUR_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function RabbitTour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const available = steps.filter((s) => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${s.target}"]`);
    return el && el.getClientRects().length > 0;
  });
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = available[i];

  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "auto" });
    measure();
  }, [step, measure]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  const close = useCallback(() => {
    markToured();
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, available.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, available.length]);

  useEffect(() => {
    if (!step) close(); // nothing on screen to point at
  }, [step, close]);

  if (!step || !rect) return null;
  const pad = 8;
  const below = rect.bottom + 220 < window.innerHeight;
  const tipLeft = Math.min(Math.max(12, rect.left), window.innerWidth - 332);
  const tipTop = below ? rect.bottom + pad + 10 : Math.max(12, rect.top - pad - 10 - 190);
  const last = i === available.length - 1;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="The White Rabbit's tour">
      <div className="absolute inset-0" onClick={close} />
      <div
        className="tour-spotlight"
        style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
      />
      <div className="parchment absolute w-[20rem] rounded-2xl p-4" style={{ left: tipLeft, top: tipTop }}>
        <div className="flex items-start gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-[var(--tan)]">
            <Rabbit className="size-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--tan)]">
              The White Rabbit · {i + 1}/{available.length}
            </p>
            <p className="font-display text-lg leading-tight">{step.title}</p>
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
        <div className="mt-3 flex items-center justify-between">
          <button type="button" onClick={close} className="text-xs text-muted-foreground hover:underline">
            Skip the tour
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <Button size="sm" variant="outline" onClick={() => setI(i - 1)}>
                Back
              </Button>
            )}
            <Button size="sm" onClick={() => (last ? close() : setI(i + 1))}>
              {last ? "I'm ready" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Keyboard shortcuts ---------------- */

export const SHORTCUTS: [string, string][] = [
  ["/", "Talk to the Cat (focus the chat)"],
  ["A", "Jump to the answer box"],
  ["H", "Drink the next bottle (hint)"],
  ["T", "Take the White Rabbit's tour"],
  ["?", "Show these shortcuts"],
  ["Esc", "Leave a text box"],
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Shortcuts through the looking-glass</DialogTitle>
          <DialogDescription>They work whenever you're not typing in a box.</DialogDescription>
        </DialogHeader>
        <dl className="space-y-2 text-sm">
          {SHORTCUTS.map(([k, d]) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{d}</dt>
              <dd>
                <kbd className="rounded-md border border-[var(--border)] bg-secondary px-2 py-0.5 font-mono text-xs">{k}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

export function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/* ---------------- Shareable "I woke up" card ---------------- */

export interface ShareInfo {
  title: string;
  templateId: string | null;
  testimony: string | null;
  amount: number | null;
  explorerUrl: string | null;
  date: string | null;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else {
      line = test;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
  }
  return lines;
}

async function drawCard(info: ShareInfo): Promise<Blob | null> {
  const W = 720;
  const H = 1008;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  try {
    await Promise.all([document.fonts.load('48px "IM Fell English"'), document.fonts.load('italic 30px "IM Fell English"'), document.fonts.load('600 22px "Nunito"')]);
  } catch {
    /* fall back to serif */
  }
  const f = flavorFor(info.templateId);
  const suit = f?.suit ?? "♠";
  const red = suit === "♥" || suit === "♦";
  const ink = "#334356";
  const tan = "#8d7350";

  // card
  ctx.fillStyle = "#d6ecf7";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#faf8f1";
  ctx.strokeStyle = tan;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(24, 24, W - 48, H - 48, 36);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(141,115,80,.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(44, 44, W - 88, H - 88, 24);
  ctx.stroke();

  // pips
  ctx.fillStyle = red ? "#c8314a" : ink;
  ctx.font = '56px "IM Fell English", Georgia, serif';
  ctx.textAlign = "left";
  ctx.fillText(suit, 68, 118);
  ctx.save();
  ctx.translate(W - 68, H - 118);
  ctx.rotate(Math.PI);
  ctx.fillText(suit, 0, 0);
  ctx.restore();

  ctx.textAlign = "center";
  ctx.fillStyle = tan;
  ctx.font = '600 20px "Nunito", sans-serif';
  ctx.fillText("✦ DREAM TO WONDERLAND ✦", W / 2, 150);

  ctx.fillStyle = ink;
  ctx.font = 'italic 34px "IM Fell English", Georgia, serif';
  ctx.fillText("I woke up from", W / 2, 230);
  ctx.font = '54px "IM Fell English", Georgia, serif';
  wrap(ctx, info.title, W - 160, 2).forEach((l, i) => ctx.fillText(l, W / 2, 300 + i * 62));
  if (f) {
    ctx.fillStyle = tan;
    ctx.font = '600 22px "Nunito", sans-serif';
    ctx.fillText(`${f.character} · ${f.concept}`, W / 2, 420);
  }

  if (info.testimony) {
    ctx.fillStyle = ink;
    ctx.font = 'italic 30px "IM Fell English", Georgia, serif';
    const lines = wrap(ctx, `“${info.testimony}”`, W - 200, 5);
    lines.forEach((l, i) => ctx.fillText(l, W / 2, 510 + i * 42));
    ctx.fillStyle = "#5b6a7c";
    ctx.font = '600 18px "Nunito", sans-serif';
    ctx.fillText("— my testimony at the trial", W / 2, 510 + lines.length * 42 + 16);
  }

  if (info.amount && info.amount > 0) {
    ctx.fillStyle = "#c8314a";
    ctx.font = '64px "IM Fell English", Georgia, serif';
    ctx.fillText(`+${info.amount} TARTS`, W / 2, 820);
  }

  ctx.fillStyle = "#5b6a7c";
  ctx.font = '600 18px "Nunito", sans-serif';
  const date = info.date ? new Date(info.date).toLocaleDateString(undefined, { dateStyle: "medium" }) : "";
  ctx.fillText(["Socra · Cutie Hack 2026", date].filter(Boolean).join(" · "), W / 2, 880);
  if (info.explorerUrl) {
    const sig = info.explorerUrl.split("/tx/")[1]?.split("?")[0] ?? "";
    if (sig) ctx.fillText(`Solana devnet tx ${sig.slice(0, 6)}…${sig.slice(-6)}`, W / 2, 910);
  }

  return new Promise((resolve) => c.toBlob(resolve, "image/png"));
}

export function ShareDreamButton({ info, size = "sm" }: { info: ShareInfo; size?: "sm" | "default" }) {
  const [busy, setBusy] = useState(false);
  async function share() {
    setBusy(true);
    try {
      const blob = await drawCard(info);
      if (!blob) return;
      const file = new File([blob], "socra-dream.png", { type: "image/png" });
      const text = `I woke up from "${info.title}" on Socra${info.amount ? ` with ${info.amount} TARTS` : ""}. #CutieHack2026`;
      // Phones get the native share sheet; desktops just download the image.
      const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
      if (touch && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text, url: info.explorerUrl ?? undefined });
          return;
        } catch (e) {
          if ((e as DOMException).name === "AbortError") return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "socra-dream.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } finally {
      setBusy(false);
    }
  }
  const canNativeShare = typeof navigator !== "undefined" && "share" in navigator && (window.matchMedia?.("(pointer: coarse)").matches ?? false);
  return (
    <Button size={size} variant="outline" onClick={share} disabled={busy}>
      {canNativeShare ? <Share2 /> : <Download />}
      {busy ? "Painting the card…" : "Share your dream card"}
    </Button>
  );
}

/* ---------------- Card-suit collection ---------------- */

const SUIT_TITLES: Record<string, string> = {
  "♥": "The Queen's favour",
  "♣": "The Hatter's guest",
  "♦": "The Caterpillar's riddle",
  "♠": "Down the rabbit hole",
};

export function DeckPanel({ problems }: { problems: Problem[] }) {
  const cards = problems.map((p) => ({ p, f: flavorFor(p.id) }));
  const suits = ["♥", "♣", "♦", "♠"] as const;
  const suitStatus = suits.map((suit) => {
    const inSuit = cards.filter((c) => (c.f?.suit ?? "♠") === suit);
    const won = inSuit.filter((c) => c.p.rewardStatus === "paid").length;
    return { suit, won, total: inSuit.length, complete: inSuit.length > 0 && won === inSuit.length };
  });
  const fullDeck = cards.length > 0 && cards.every((c) => c.p.rewardStatus === "paid");

  return (
    <section className="parchment space-y-4 rounded-2xl p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl">Your deck</h2>
          <p className="text-sm text-muted-foreground">Each door you wake up from deals you its card. Complete a suit to earn its title.</p>
        </div>
        {fullDeck && <span className="rounded-full bg-[var(--gold)] px-3 py-1 text-xs font-semibold text-white">✦ Full deck: every dream solved</span>}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {cards.map(({ p, f }) => {
          const suit = f?.suit ?? "♠";
          const won = p.rewardStatus === "paid";
          const lost = p.rewardStatus === "forfeited";
          const Icon = f?.icon;
          return (
            <div
              key={p.id}
              className={`relative flex h-36 w-24 flex-col items-center justify-center gap-1 rounded-xl border-2 p-2 text-center ${
                won ? "border-[var(--tan)]/60 bg-card" : "card-back-pattern border-transparent text-[#faf8f1]"
              }`}
              title={won ? p.title : lost ? `${p.title}: forfeited at the trial` : `${p.title}: not yet won`}
            >
              {won ? (
                <>
                  <span className={`absolute left-1.5 top-1 font-display ${suitColor(suit)}`}>{suit}</span>
                  {Icon && <Icon className="size-6 text-[var(--tan)]" />}
                  <span className="font-display text-xs leading-tight">{f?.character ?? p.title}</span>
                </>
              ) : (
                <span className="font-display text-2xl opacity-60">{lost ? "✕" : "?"}</span>
              )}
            </div>
          );
        })}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {suitStatus.map((s) => (
          <li key={s.suit} className={`flex items-center gap-2 rounded-lg p-2 text-sm ${s.complete ? "bg-[var(--gold-soft)]/25" : "bg-secondary/60"}`}>
            <span className={`font-display text-lg ${suitColor(s.suit)}`}>{s.suit}</span>
            <span className="flex-1">{SUIT_TITLES[s.suit]}</span>
            <span className="tabular-nums text-xs text-muted-foreground">
              {s.complete ? "complete ✦" : `${s.won}/${s.total}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
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
