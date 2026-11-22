import { Bot, Copy, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CheshireGrin, Tart } from "@/components/wonder";
import { api } from "@/lib/api";

export function WhySocra() {
  return (
    <section aria-labelledby="why-socra" className="space-y-3">
      <h2 id="why-socra" className="text-center font-display text-2xl">
        Why Socra?
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <figure className="why-card is-other rounded-2xl p-4">
          <figcaption className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Bot className="size-3.5" /> A typical AI chatbot
          </figcaption>
          <div className="mt-3 space-y-2 text-sm">
            <p className="why-bubble is-student">What's x if 3x + 5 = 20?</p>
            <p className="why-bubble is-bot">x = 5.</p>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Copy className="size-3.5 shrink-0" /> Copied, submitted, forgotten. Nothing learned.
          </p>
        </figure>
        <figure className="why-card is-socra rounded-2xl p-4">
          <figcaption className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--cheshire)]">
            <CheshireGrin className="h-3 w-6" /> The Cheshire Cat
          </figcaption>
          <div className="mt-3 space-y-2 text-sm">
            <p className="why-bubble is-student">What's x if 3x + 5 = 20?</p>
            <p className="why-bubble is-cat">Curious! What could you do to both sides to get 3x on its own?</p>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Tart className="size-3.5 shrink-0" /> You find it, explain why it works, and earn tarts.
          </p>
        </figure>
      </div>
    </section>
  );
}

interface Stats {
  verifiedSolves: number;
  convincingTestimonies: number;
  pastesCaught: number;
  tartsPaid: number;
  onChain: boolean;
}

function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const el = ref.current;
    if (reduce || !el || typeof IntersectionObserver === "undefined") {
      setShown(value);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / 1100);
        setShown(Math.round(value * (1 - Math.pow(1 - k, 3))));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);
  return (
    <span ref={ref} className="tabular-nums">
      {shown.toLocaleString()}
    </span>
  );
}

export function LiveStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    let live = true;
    api<Stats>("/api/stats")
      .then((s) => live && typeof s?.verifiedSolves === "number" && setStats(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!stats || stats.verifiedSolves + stats.tartsPaid === 0) return null;
  const items = [
    { icon: Sparkles, value: stats.verifiedSolves, label: "answers found by students, checked by code" },
    { icon: ShieldCheck, value: stats.convincingTestimonies, label: "explanations that convinced the court" },
    { icon: Copy, value: stats.pastesCaught, label: "pasted answers caught" },
    { icon: Tart, value: Math.round(stats.tartsPaid), label: stats.onChain ? "TARTS paid on Solana devnet" : "TARTS earned" },
  ];
  return (
    <section aria-label="Socra so far" className="live-stats parchment grid grid-cols-2 gap-x-3 gap-y-4 rounded-2xl p-4 sm:grid-cols-4">
      {items.map(({ icon: Icon, value, label }) => (
        <div key={label} className="text-center">
          <p className="flex items-center justify-center gap-1.5 font-display text-2xl leading-none">
            <Icon className="size-4 text-[var(--tan)]" />
            <CountUp value={value} />
          </p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{label}</p>
        </div>
      ))}
      <p className="col-span-full -mt-1 text-center text-[10px] uppercase tracking-[0.2em] text-[var(--tan)]">
        <span className="live-dot" aria-hidden="true" /> Live from this server
      </p>
    </section>
  );
}
