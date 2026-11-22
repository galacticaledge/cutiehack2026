import { Coins, ExternalLink, FlaskConical, Minus, Plus, Scale, Sparkles, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Header } from "@/components/header";
import { DreamFooter } from "@/components/scenery";
import { DealtCards, LostInWonderland } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Tart } from "@/components/wonder";
import { api, getFeatures, isGuestName, type Me, type TartsEstimate, type TartsLedgerEntry, type Treasury } from "@/lib/api";

const RATE_KEY = "socra:tart-rate";
const DEFAULT_RATE = 1; // what-if dollars per 100 tarts

function loadRate() {
  try {
    const v = Number(localStorage.getItem(RATE_KEY));
    return v > 0 && v <= 10 ? v : DEFAULT_RATE;
  } catch {
    return DEFAULT_RATE;
  }
}

const usd = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tarts = (n: number) => Math.round(n).toLocaleString();

export function Tarts() {
  const [me, setMe] = useState<Me | null>(null);
  const [t, setT] = useState<Treasury | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [solana, setSolana] = useState(false);
  const [rate, setRate] = useState(loadRate);

  useEffect(() => {
    setFailed(false);
    Promise.all([api<Me>("/api/me"), api<Treasury>("/api/tarts")])
      .then(([m, tr]) => {
        setMe(m);
        setT(tr);
      })
      .catch((e) => {
        setFailed(true);
        toast.error(e.message);
      });
    void getFeatures().then((f) => setSolana(Boolean(f?.solana)));
  }, [attempt]);

  useEffect(() => {
    try {
      localStorage.setItem(RATE_KEY, String(rate));
    } catch {
      /* per-viewer convenience only */
    }
  }, [rate]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-10">
        <section className="space-y-2 text-center">
          <h1 className="font-display text-4xl text-[var(--night)] dark:text-foreground sm:text-5xl">The Tart Treasury</h1>
          <p className="mx-auto max-w-xl text-muted-foreground">
            “The Queen of Hearts, she made some tarts.” Here you earn them by thinking: every tart is a problem you solved and explained in your own words.
          </p>
        </section>

        {!t && failed && (
          <LostInWonderland title="The treasury door is stuck" body="We couldn't count your tarts. Check your connection and try again." action={<Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>} />
        )}
        {!t && !failed && <DealtCards count={3} className="h-40" label="Counting your tarts" />}

        {t && me && (
          <>
            <BalanceCard me={me} t={t} solana={solana} />
            <DailyBars daily={t.daily} />
            <div className="grid gap-6 lg:grid-cols-2">
              <PayEstimator t={t} rate={rate} />
              <WorthEstimator me={me} t={t} rate={rate} setRate={setRate} />
            </div>
            <Recipe t={t} />
            <Ledger entries={t.ledger} />
          </>
        )}
      </main>
      <DreamFooter />
    </>
  );
}

/* ---------------- Balance ---------------- */

function BalanceCard({ me, t, solana }: { me: Me; t: Treasury; solana: boolean }) {
  const todayShare = t.dailyCap > 0 ? Math.min(1, t.earnedToday / t.dailyCap) : 0;
  const onChain = me.balanceSource === "chain";
  return (
    <section className="parchment rounded-3xl p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Tart className="size-16 shrink-0 sm:size-20" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Your tarts</p>
            <p className="text-5xl font-extrabold leading-none tabular-nums text-[var(--night)] dark:text-foreground sm:text-6xl">{tarts(me.balance)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {onChain ? "Read live from your Solana devnet wallet" : "From the treasury's records"}
              {isGuestName(me.username) && " · guest accounts don't get a wallet"}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-4 text-center sm:gap-8">
          <Stat label="Earned in total" value={tarts(t.totals.paid)} />
          <Stat label="Payouts" value={String(t.totals.paidCount)} />
          <Stat label="Taken by the Queen" value={String(t.totals.forfeitedCount)} />
        </dl>
      </div>

      <div className="mt-6 space-y-1.5">
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <span className="font-medium">Baked today</span>
          <span className="tabular-nums text-muted-foreground">
            {tarts(t.earnedToday)} / {tarts(t.dailyCap)} tarts · new topics {t.topicRewardsToday} / {t.dailyTopicCap}
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label="Tarts earned today" aria-valuemin={0} aria-valuemax={t.dailyCap} aria-valuenow={t.earnedToday}>
          <div className="h-full rounded-full bg-[var(--heart)] transition-[width] duration-700" style={{ width: `${todayShare * 100}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">The daily cap resets at midnight UTC.</p>
      </div>

      {solana && !isGuestName(me.username) && (
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <a href={me.walletUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-medium underline underline-offset-4">
            <Wallet className="size-4" /> Your wallet on Solana Explorer <ExternalLink className="size-3" />
          </a>
          {t.mintUrl && (
            <a href={t.mintUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-medium underline underline-offset-4">
              <Coins className="size-4" /> The TARTS token <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-bold tabular-nums sm:text-3xl">{value}</dd>
    </div>
  );
}

/* ---------------- Last 14 days ---------------- */

function DailyBars({ daily }: { daily: Treasury["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.amount));
  const total = daily.reduce((s, d) => s + d.amount, 0);
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <section className="parchment rounded-2xl p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl">The last two weeks</h2>
        <span className="text-sm text-muted-foreground">{tarts(total)} tarts in 14 days</span>
      </div>
      <ol className="mt-4 flex h-32 items-end gap-1.5 sm:gap-2" aria-label="Tarts earned per day, last 14 days">
        {daily.map((d) => (
          <li key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${day(d.date)}: ${tarts(d.amount)} tarts`}>
            <span className="sr-only">
              {day(d.date)}: {tarts(d.amount)} tarts
            </span>
            {d.amount > 0 && <span className="hidden text-[10px] tabular-nums text-muted-foreground sm:block">{tarts(d.amount)}</span>}
            <span
              className={`w-full max-w-8 rounded-t-md ${d.amount > 0 ? "bg-[var(--heart)]" : "bg-secondary"}`}
              style={{ height: d.amount > 0 ? `${Math.max(6, (d.amount / max) * 100)}%` : "3px" }}
            />
          </li>
        ))}
      </ol>
      <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
        <span>{daily[0] ? day(daily[0].date) : ""}</span>
        <span>Today</span>
      </div>
    </section>
  );
}

/* ---------------- Estimator 1: what a solve pays (computed by the server's payout formula) ---------------- */

function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              value === v ? "border-[var(--night)] bg-[var(--night)] text-[#faf8f1] dark:border-[var(--gold)] dark:bg-[var(--gold)] dark:text-[var(--night)]" : "border-border hover:bg-muted"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <span className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <Minus />
        </Button>
        <span className="w-6 text-center tabular-nums" aria-live="polite">
          {value}
        </span>
        <Button variant="outline" size="icon-sm" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <Plus />
        </Button>
      </span>
    </div>
  );
}

function PayEstimator({ t, rate }: { t: Treasury; rate: number }) {
  const [kind, setKind] = useState<"problem" | "topic">("problem");
  const [difficulty, setDifficulty] = useState(1);
  const [hints, setHints] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [testimony, setTestimony] = useState(true);
  const [est, setEst] = useState<TartsEstimate | null>(null);

  useEffect(() => {
    let live = true;
    const q = new URLSearchParams({ kind, difficulty: String(difficulty), hints: String(hints), wrong: String(wrong), testimony: String(testimony) });
    const timer = setTimeout(() => {
      api<TartsEstimate>(`/api/tarts/estimate?${q}`)
        .then((e) => live && setEst(e))
        .catch(() => {});
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [kind, difficulty, hints, wrong, testimony, t.earnedToday]);

  return (
    <section className="parchment flex flex-col rounded-2xl p-6">
      <h2 className="flex items-center gap-2 font-display text-2xl">
        <Scale className="size-5 text-[var(--gold)]" /> What will a solve pay?
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Set up a solve and the treasury runs it through the same formula it pays with, including today's cap.</p>

      <div className="mt-5 space-y-4">
        <Segmented
          label="Kind of problem"
          value={kind}
          onChange={setKind}
          options={[
            ["problem", "Verified problem"],
            ["topic", "New topic (map)"],
          ]}
        />
        {kind === "problem" && (
          <Segmented
            label="Difficulty"
            value={difficulty}
            onChange={setDifficulty}
            options={[
              [1, "1 ♥"],
              [2, "2 ♥♥"],
              [3, "3 ♥♥♥"],
            ]}
          />
        )}
        {kind === "problem" ? (
          <Stepper label="Drink Me bottles" value={hints} min={0} max={3} onChange={setHints} />
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <FlaskConical className="size-4" /> New-topic problems have no Drink Me bottles.
          </p>
        )}
        <Stepper label="Wrong turns" value={wrong} min={0} max={6} onChange={setWrong} />
        <Segmented
          label="Testimony (your explanation)"
          value={testimony ? "pass" : "miss"}
          onChange={(v) => setTestimony(v === "pass")}
          options={[
            ["pass", "Convinces the court"],
            ["miss", "Doesn't"],
          ]}
        />
      </div>

      <div className="mt-6 rounded-xl bg-secondary/60 p-4" aria-live="polite">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <span className="flex items-center gap-2 text-4xl font-extrabold tabular-nums">
            <Tart className="size-8" /> {est ? tarts(est.amount) : "…"}
          </span>
          {est && <span className="text-sm text-muted-foreground">≈ {usd((est.amount / 100) * rate)} at your what-if rate</span>}
        </div>
        {est && <p className="mt-2 text-sm">{est.summary}</p>}
        {est?.note && <p className="mt-1 text-sm text-[var(--heart)]">{est.note}</p>}
        {est && est.amount > 0 && est.amount < est.uncapped && <p className="mt-1 text-sm text-muted-foreground">Full amount without today's cap: {tarts(est.uncapped)}.</p>}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Each problem pays once. A suspicious solve (pasting, leaving the tab, racing) whose testimony fails pays nothing.</p>
    </section>
  );
}

/* ---------------- Estimator 2: what-if dollar value ---------------- */

function WorthEstimator({ me, t, rate, setRate }: { me: Me; t: Treasury; rate: number; setRate: (r: number) => void }) {
  const week = useMemo(() => t.daily.slice(-7).reduce((s, d) => s + d.amount, 0), [t.daily]);
  const perDay = week / 7;
  const perMonth = Math.min(perDay, t.dailyCap) * 30;
  const value = (n: number) => usd((n / 100) * rate);

  return (
    <section className="parchment flex flex-col rounded-2xl p-6">
      <h2 className="flex items-center gap-2 font-display text-2xl">
        <Sparkles className="size-5 text-[var(--gold)]" /> What could they be worth?
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Today, nothing: TARTS live on Solana's devnet, a test network, so they can't be sold. Imagine a school or sponsor backed them, and pick a rate to see what your learning would add up to.
      </p>

      <div className="mt-5 space-y-2">
        <label htmlFor="tart-rate" className="flex items-baseline justify-between gap-2 text-sm font-medium">
          <span>What-if rate</span>
          <span className="text-lg font-bold tabular-nums">{usd(rate)} per 100 tarts</span>
        </label>
        <input
          id="tart-rate"
          type="range"
          min={0.1}
          max={5}
          step={0.1}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          className="w-full accent-[var(--heart)]"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>$0.10</span>
          <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setRate(DEFAULT_RATE)}>
            Reset to $1.00
          </button>
          <span>$5.00</span>
        </div>
      </div>

      <dl className="mt-5 divide-y divide-border rounded-xl bg-secondary/60">
        <Row label="Your tarts" tartsValue={me.balance} money={value(me.balance)} strong />
        <Row label="At your pace (last 7 days), per month" tartsValue={perMonth} money={value(perMonth)} />
        <Row label="The most anyone can earn in a day" tartsValue={t.dailyCap} money={value(t.dailyCap)} />
      </dl>

      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        <p className="text-xs text-muted-foreground">A what-if, not a price. Real value today: {usd(0)}.</p>
        <Link to="/map" className="shrink-0 text-sm font-medium text-[var(--primary)] hover:underline">
          Earn more →
        </Link>
      </div>
    </section>
  );
}

function Row({ label, tartsValue, money, strong }: { label: string; tartsValue: number; money: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <dt className="text-sm">
        {label}
        <span className="block text-xs text-muted-foreground tabular-nums">{tarts(tartsValue)} tarts</span>
      </dt>
      <dd className={`font-bold tabular-nums ${strong ? "text-3xl" : "text-xl"}`}>{money}</dd>
    </div>
  );
}

/* ---------------- How tarts are baked ---------------- */

function Recipe({ t }: { t: Treasury }) {
  const r = t.rates;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const items: [string, string][] = [
    ["Base", `Verified problems pay ${r.bankBase.map(tarts).join(" / ")} tarts by difficulty. New topics on the map pay ${tarts(r.questBase)}.`],
    ["Drink Me bottles", `Each bottle shrinks the tart: ${r.hintMult.map(pct).join(" → ")}. Chatting with the Cat is always free.`],
    ["Wrong turns", `Each one takes ${pct(r.attemptStep)} off, but never below ${pct(r.attemptFloor)}.`],
    ["Testimony", `Explain why your method works. A testimony that doesn't convince the court pays ${pct(r.testimonyMiss)} on verified problems and nothing on new topics.`],
    ["Floor", `A solve that pays never pays less than ${pct(r.minimumShare)} of its base.`],
    ["Limits", `Each problem and each map topic pays once. Up to ${tarts(t.dailyCap)} tarts and ${t.dailyTopicCap} new topics per day.`],
  ];
  return (
    <section className="parchment rounded-2xl p-6">
      <h2 className="font-display text-2xl">How tarts are baked</h2>
      <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt className="font-semibold">{k}</dt>
            <dd className="text-sm text-muted-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ---------------- Ledger ---------------- */

function statusText(e: TartsLedgerEntry) {
  if (e.status === "paid") return { text: `+${tarts(e.amount)}`, tone: "text-[var(--gold)]" };
  if (e.status === "forfeited") return { text: "Off with their tarts!", tone: "text-[var(--heart)]" };
  if (e.status === "failed") return { text: "Lost in the post", tone: "text-[var(--heart)]" };
  return { text: "Delivering…", tone: "text-muted-foreground" };
}

function Ledger({ entries }: { entries: TartsLedgerEntry[] }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl">The ledger</h2>
      {entries.length === 0 ? (
        <div className="parchment rounded-2xl p-6 text-center text-sm text-muted-foreground">
          No tarts yet.{" "}
          <Link to="/learn" className="font-medium text-[var(--primary)] hover:underline">
            Open a door
          </Link>{" "}
          and solve your first problem.
        </div>
      ) : (
        <ol className="parchment divide-y divide-border overflow-hidden rounded-2xl">
          {entries.map((e) => {
            const s = statusText(e);
            return (
              <li key={e.sessionId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <Link to={`/learn/${e.sessionId}`} className="font-medium hover:underline">
                    {e.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {e.kind === "topic" ? "New topic" : "Verified problem"} · {new Date(e.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    {e.breakdown && ` · ${e.breakdown.replace(/\bLEARN\b/, "TARTS")}`}
                  </p>
                </div>
                {e.explorerUrl && (
                  <a href={e.explorerUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium underline">
                    Receipt <ExternalLink className="size-3" />
                  </a>
                )}
                <span className={`flex items-center gap-1 text-lg font-bold tabular-nums ${s.tone}`}>
                  {e.status === "paid" && <Tart />}
                  {s.text}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
