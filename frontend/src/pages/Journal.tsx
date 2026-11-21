import { ExternalLink, FlaskConical, Hourglass, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Header } from "@/components/header";
import { DreamFooter } from "@/components/scenery";
import { Button } from "@/components/ui/button";
import { CheshireGrin, flavorFor, suitColor, Tart } from "@/components/wonder";
import { api, type JournalEntry, type Problem } from "@/lib/api";
import { DeckPanel, ShareDreamButton } from "@/components/extras";
import { DealtCards, LostInWonderland } from "@/components/skeletons";

function duration(a: string, b: string | null) {
  if (!b) return null;
  const s = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m} min ${s % 60}s` : `${s}s`;
}

function outcome(e: JournalEntry) {
  const r = e.reward;
  if (!r) return { text: "Unbirthday practice", tone: "text-muted-foreground" };
  if (r.status === "paid") return { text: `+${r.amount} tarts`, tone: "text-[var(--gold)]" };
  if (r.status === "forfeited") return { text: "Off with their tarts!", tone: "text-[var(--heart)]" };
  if (r.status === "failed") return { text: "Tarts lost in the post (retry from the dream)", tone: "text-[var(--heart)]" };
  return { text: "Delivering…", tone: "text-muted-foreground" };
}

export function Journal() {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setLoadFailed(false);
    api<JournalEntry[]>("/api/journal")
      .then(setEntries)
      .catch((e) => {
        setLoadFailed(true);
        toast.error(e.message);
      });
    api<Problem[]>("/api/problems").then(setProblems).catch(() => {});
  }, [attempt]);

  const total = entries?.reduce((sum, e) => sum + (e.reward?.status === "paid" ? e.reward.amount : 0), 0) ?? 0;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl space-y-8 px-4 py-10">
        <section className="space-y-2 text-center">
          <h1 className="font-display text-4xl text-[var(--night)] dark:text-foreground sm:text-5xl">Dream Journal</h1>
          <p className="text-muted-foreground">
            Every dream you've found your way out of, with the testimony that proved it.
            {entries && entries.length > 0 && (
              <>
                {" "}
                {entries.length} {entries.length === 1 ? "dream" : "dreams"} ·{" "}
                <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                  <Tart /> {total} tarts
                </span>
              </>
            )}
          </p>
        </section>

        {problems && problems.length > 0 && <DeckPanel problems={problems} />}

        {!entries && loadFailed && (
          <LostInWonderland title="The pages are stuck together" body="We couldn't load your journal. Check your connection and try again." action={<Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>} />
        )}
        {!entries && !loadFailed && (
          <div className="space-y-6">
            <DealtCards count={2} className="h-44" label="Turning the pages" />
          </div>
        )}

        {entries?.length === 0 && (
          <div className="parchment mx-auto max-w-md space-y-3 rounded-2xl p-8 text-center">
            <CheshireGrin className="mx-auto size-14" fading />
            <p className="font-display text-xl">No dreams recorded yet.</p>
            <p className="text-sm text-muted-foreground">“It's no use going back to yesterday.” Go open a door instead.</p>
            <Link to="/learn">
              <Button>To the Hall of Doors</Button>
            </Link>
          </div>
        )}

        <ol className="space-y-6">
          {entries?.map((e, i) => {
            const f = flavorFor(e.templateId);
            const Icon = f?.icon;
            const suit = f?.suit ?? "♠";
            const o = outcome(e);
            const took = duration(e.startedAt, e.solvedAt);
            return (
              <li
                key={e.sessionId}
                className="parchment flip-in relative rounded-2xl p-6"
                style={{ rotate: `${i % 2 ? 0.5 : -0.5}deg`, animationDelay: `${Math.min(i, 6) * 0.08}s` }}
              >
                <span className={`pip pip-tl ${suitColor(suit)}`}>{suit}</span>
                <div className="flex flex-wrap items-start justify-between gap-3 pl-5">
                  <div className="flex items-center gap-2.5">
                    {Icon && (
                      <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-[var(--primary)]">
                        <Icon className="size-5" />
                      </span>
                    )}
                    <div>
                      <h2 className="font-display text-2xl leading-tight">{e.title}</h2>
                      <p className="text-xs text-muted-foreground">
                        {e.solvedAt ? new Date(e.solvedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : ""}
                        {f && ` · ${f.character}`}
                      </p>
                    </div>
                  </div>
                  <span className={`font-display text-xl ${o.tone}`}>{o.text}</span>
                </div>

                {e.explanation && (
                  <blockquote className="mt-4 border-l-4 border-[var(--gold-soft)] pl-4 font-display text-lg italic leading-snug">“{e.explanation}”</blockquote>
                )}
                {e.explainFeedback && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    <span className="font-semibold">{e.explainPassed ? "The court: " : "The jury: "}</span>
                    {e.explainFeedback}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {took && (
                    <span className="flex items-center gap-1">
                      <Hourglass className="size-3.5" /> {took}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <FlaskConical className="size-3.5" /> {e.hintsUsed} {e.hintsUsed === 1 ? "bottle" : "bottles"}
                  </span>
                  <span className="flex items-center gap-1">
                    <X className="size-3.5" /> {e.wrongAttempts} wrong {e.wrongAttempts === 1 ? "turn" : "turns"}
                  </span>
                  {e.reward?.breakdown && <span>{e.reward.breakdown}</span>}
                  {e.reward?.explorerUrl && (
                    <a href={e.reward.explorerUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-foreground underline">
                      Receipt on Solana Explorer <ExternalLink className="size-3" />
                    </a>
                  )}
                  {e.reward?.status === "paid" && (
                    <ShareDreamButton
                      info={{ title: e.title, templateId: e.templateId, testimony: e.explanation, amount: e.reward.amount, explorerUrl: e.reward.explorerUrl ?? null, date: e.solvedAt }}
                    />
                  )}
                  <Link to={`/learn/${e.sessionId}`} className="ml-auto font-medium text-[var(--primary)] hover:underline">
                    Revisit this dream →
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      </main>
      <DreamFooter />
    </>
  );
}
