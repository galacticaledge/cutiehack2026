import { BookHeart, Check, Clock, Crown, FlaskConical, Gavel, KeyRound, Rabbit, ScrollText, ShieldCheck, Sigma, Sparkles, Sprout, Sunrise, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheshireGrin, flavorFor, Tart } from "@/components/wonder";
import { api, type Me, type Problem, type SessionView } from "@/lib/api";

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`parchment rounded-2xl p-4 ${className}`}>
      <h2 className="mb-3 font-display text-lg leading-tight">{title}</h2>
      {children}
    </section>
  );
}

/* ---------------- Hall of Doors: left column ---------------- */

export function YourDreamPanel({ problems }: { problems: Problem[] | null }) {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    const load = () => api<Me>("/api/me").then(setMe).catch(() => {});
    load();
    window.addEventListener("socra:balance", load);
    return () => window.removeEventListener("socra:balance", load);
  }, []);
  const eaten = problems?.filter((p) => p.rewardStatus === "paid").length ?? 0;
  const total = problems?.length ?? 0;
  const capPct = me && me.dailyCap > 0 ? Math.min(100, (me.earnedToday / me.dailyCap) * 100) : 0;

  return (
    <div className="space-y-4">
      <Panel title="Your dream">
        <div className="flex items-center gap-3">
          <CheshireGrin className="grin-mirror size-11" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{me?.username ?? "…"}</p>
            <p className="flex items-center gap-1 text-2xl font-semibold tabular-nums">
              <Tart className="size-5" /> {me ? me.balance.toLocaleString() : "–"}
              <span className="text-sm font-medium text-muted-foreground">tarts</span>
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Baked today</span>
            <span className="tabular-nums">
              {me ? `${me.earnedToday} / ${me.dailyCap}` : "–"}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(capPct)} aria-valuemin={0} aria-valuemax={100} aria-label="Daily tart cap">
            <div className="h-full rounded-full bg-[var(--gold-soft)] transition-all duration-700" style={{ width: `${capPct}%` }} />
          </div>
          <p className="text-[11px] text-muted-foreground">The Queen's treasury opens fresh every day.</p>
        </div>
      </Panel>

      <Panel title={`Doors opened · ${problems ? `${eaten}/${total}` : "…"}`}>
        <ul className="space-y-2 text-sm">
          {problems?.map((p) => {
            const f = flavorFor(p.id);
            const Icon = f?.icon ?? KeyRound;
            const status = p.rewardStatus;
            return (
              <li key={p.id} className="flex items-center gap-2">
                <Icon className="size-4 shrink-0 text-[var(--tan)]" />
                <span className="min-w-0 flex-1 truncate">{f?.character ?? p.title}</span>
                {status === "paid" && <Check className="size-4 text-[var(--potion)]" aria-label="earned" />}
                {status === "forfeited" && <X className="size-4 text-[var(--heart)]" aria-label="forfeited" />}
                {!status && <span className="text-xs tabular-nums text-muted-foreground">{p.maxReward}</span>}
              </li>
            );
          })}
        </ul>
        <Link to="/journal" className="mt-3 flex items-center gap-1 text-xs font-medium text-[var(--tan)] hover:underline">
          <BookHeart className="size-3.5" /> Read your dream journal
        </Link>
      </Panel>
    </div>
  );
}

/* ---------------- Hall of Doors: right column ---------------- */

const RECIPE: { icon: typeof Tart | typeof FlaskConical; label: string; value: string; note: string }[] = [
  { icon: Sparkles, label: "Base", value: "100 × ♥", note: "per heart of difficulty" },
  { icon: FlaskConical, label: "Drink Me", value: "×1 · .75 · .5 · .3", note: "for 0–3 hints" },
  { icon: X, label: "Wrong turns", value: "−10% each", note: "never below ×0.6" },
  { icon: Gavel, label: "Testimony", value: "×1 or ×0.5", note: "convincing within 3 tries, or not" },
];

export function TartRecipePanel() {
  const [dailyCap, setDailyCap] = useState<number | null>(null);
  useEffect(() => {
    api<Me>("/api/me").then((m) => setDailyCap(m.dailyCap)).catch(() => {});
  }, []);
  return (
    <div className="space-y-4">
      <Panel title="How tarts are baked">
        <ul className="space-y-2.5">
          {RECIPE.map(({ icon: Icon, label, value, note }) => (
            <li key={label} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[var(--tan)]">
                <Icon className="size-3.5" />
              </span>
              <div className="min-w-0 text-sm">
                <p className="flex flex-wrap justify-between gap-x-2">
                  <span className="font-semibold">{label}</span>
                  <span className="tabular-nums text-muted-foreground">{value}</span>
                </p>
                <p className="text-xs text-muted-foreground">{note}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 rounded-lg bg-secondary/70 p-2 text-xs text-muted-foreground">
          Chatting with the Cat is always free. Everyone keeps at least 20% of the base, and you can bake up to {dailyCap ?? "…"} tarts a day.
        </p>
      </Panel>

      <Panel title="Rules of Wonderland">
        <ul className="space-y-2 text-sm">
          <li className="flex gap-2">
            <CheshireGrin className="mt-0.5 size-4 shrink-0" />
            <span>The Cat never tells you the answer, however nicely you ask.</span>
          </li>
          <li className="flex gap-2">
            <Sigma className="mt-0.5 size-4 shrink-0 text-[var(--tan)]" />
            <span>A math engine checks every step, not the AI.</span>
          </li>
          <li className="flex gap-2">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-[var(--tan)]" />
            <span>Your numbers are yours alone. One payout per door.</span>
          </li>
          <li className="flex gap-2">
            <Crown className="mt-0.5 size-4 shrink-0 text-[var(--heart)]" />
            <span>Suspiciously fast or pasted solves go to trial. Three tries to convince the court, or it's off with the tarts.</span>
          </li>
        </ul>
      </Panel>
    </div>
  );
}

/* ---------------- Workspace: the dream map ---------------- */

type Stop = { label: string; done: boolean; current?: boolean; icon: typeof Rabbit; detail?: string };

export function DreamMap({ s, correctLabels }: { s: SessionView; correctLabels: string[] }) {
  const isBank = s.source === "bank" || s.source === "quest"; // both have a verified answer and a trial
  const solved = s.status !== "active";
  const done = s.status === "done";
  const stops: Stop[] = [{ label: "Fell down the rabbit hole", done: true, icon: Rabbit }];
  if (isBank) {
    for (let i = 0; i < s.checkpointCount; i++) {
      const label = correctLabels[i];
      stops.push({ label: label ? `Step confirmed` : `Step ${i + 1}`, detail: label, done: Boolean(label) || solved, icon: Sigma });
    }
    stops.push({ label: "Found the way out", done: solved, icon: KeyRound, detail: solved ? "Correct answer" : undefined });
    stops.push({ label: "The trial", done, icon: Gavel, detail: s.explainPassed === true ? "Testimony accepted" : s.explainPassed === false ? "Jury unconvinced" : undefined });
    stops.push({
      label: "Woke up",
      done: done,
      icon: Sunrise,
      detail:
        s.reward?.status === "paid"
          ? `+${s.reward.amount} tarts`
          : s.reward?.status === "failed" || s.reward?.status === "minting"
            ? "Tarts saved, delivery pending"
            : s.reward?.status === "forfeited"
              ? "Off with the tarts"
              : done
                ? "No tarts this time"
                : undefined,
    });
  } else {
    stops.push({ label: "Talk it through with the Cat", done: false, current: true, icon: Sprout });
    if (s.matchedTemplate) stops.push({ label: "Try a verified door", done: false, icon: KeyRound, detail: s.matchedTemplate.title });
  }
  const firstOpen = stops.findIndex((x) => !x.done);
  if (firstOpen >= 0) stops[firstOpen].current = true;

  return (
    <div className="space-y-4">
      <Panel title="Dream map">
        <ol className="relative space-y-3 before:absolute before:bottom-3 before:left-[13px] before:top-3 before:w-px before:border-l-2 before:border-dashed before:border-[var(--border)]">
          {stops.map((st, i) => {
            const Icon = st.icon;
            return (
              <li key={i} className="relative flex items-start gap-2.5">
                <span
                  className={`relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full border-2 ${
                    st.done
                      ? "border-[var(--potion)] bg-[var(--potion)] text-white"
                      : st.current
                        ? "border-[var(--gold-soft)] bg-card text-[var(--tan)] ring-4 ring-[var(--gold-soft)]/25"
                        : "border-[var(--border)] bg-card text-muted-foreground"
                  }`}
                >
                  {st.done ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
                </span>
                <div className="min-w-0 pt-0.5 text-sm">
                  <p className={st.done || st.current ? "font-semibold" : "text-muted-foreground"}>{st.label}</p>
                  {st.detail && <p className="truncate text-xs text-muted-foreground" title={st.detail}>{st.detail}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </Panel>

      {isBank && (
        <Panel title="Pockets">
          <dl className="grid grid-cols-2 gap-2 text-center text-xs">
            {s.source === "bank" && (
              <div className="rounded-lg bg-secondary/70 p-2">
              <dt className="text-muted-foreground">Bottles drunk</dt>
              <dd className="text-lg font-semibold tabular-nums">{s.hintsUsed}/3</dd>
            </div>
            )}
            <div className="rounded-lg bg-secondary/70 p-2">
              <dt className="text-muted-foreground">Wrong turns</dt>
              <dd className="text-lg font-semibold tabular-nums">{s.wrongAttempts}</dd>
            </div>
            <div className="col-span-2 rounded-lg bg-secondary/70 p-2">
              <dt className="text-muted-foreground">Tries before the door locks</dt>
              <dd className="text-lg font-semibold tabular-nums">{s.status === "active" ? s.attemptsLeft : "–"}</dd>
            </div>
          </dl>
        </Panel>
      )}
    </div>
  );
}

/* ---------------- Landing: side columns ---------------- */

const CAST = [
  { icon: CheshireGrin, name: "The Cheshire Cat", role: "Your tutor. Answers questions with questions and never gives the answer away." },
  { icon: Clock, name: "The White Rabbit", role: "Keeps time on every problem. No hurry: slow thinking pays." },
  { icon: Sprout, name: "The Caterpillar", role: "“Who are you?” Bring your own homework or topic to practice." },
  { icon: Crown, name: "The Queen of Hearts", role: "Guards fairness and holds the trial where you explain your answer." },
];

export function CastPanel() {
  return (
    <Panel title="Meet the cast">
      <ul className="space-y-3">
        {CAST.map(({ icon: Icon, name, role }) => (
          <li key={name} className="flex gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[var(--tan)]">
              <Icon className="size-5" />
            </span>
            <div className="text-sm">
              <p className="font-semibold">{name}</p>
              <p className="text-xs text-muted-foreground">{role}</p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const WHY = [
  { icon: ScrollText, title: "Slow on purpose", body: "UC Irvine research found slow, Socratic AI tutoring helped students learn, most of all those with less background." },
  { icon: ShieldCheck, title: "Math engine, not vibes", body: "The AI only reads your words. Deterministic code decides whether each step is right, so the Cat can't flatter you." },
  { icon: Gavel, title: "Proof of learning", body: "Tarts are minted on Solana devnet only after you solve it and explain why, with a public receipt." },
];

export function WhyPanel() {
  return (
    <Panel title="Why it works">
      <ul className="space-y-3">
        {WHY.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-2.5">
            <Icon className="mt-0.5 size-4 shrink-0 text-[var(--tan)]" />
            <div className="text-sm">
              <p className="font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
