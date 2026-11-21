import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Header } from "@/components/header";
import { DreamFooter } from "@/components/scenery";
import { TartRecipePanel, YourDreamPanel } from "@/components/guides";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { flavorFor, suitColor, Tart } from "@/components/wonder";
import { DoorArt } from "@/components/doors";
import { DealtCards, LostInWonderland } from "@/components/skeletons";
import { conceptForTemplate, LevelBadge, LevelSteps, SuggestionCards, suggestFrom, useConceptMap } from "@/components/proficiency";
import { api, mapAvailable, type ConceptNode, type Problem } from "@/lib/api";

function Difficulty({ n }: { n: number }) {
  return (
    <span className="flex gap-0.5 text-sm" aria-label={`Difficulty ${n} of 3`} title={`Difficulty ${n} of 3`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= n ? "text-[var(--heart)]" : "text-[var(--border)]"}>
          ♥
        </span>
      ))}
    </span>
  );
}

function DoorCard({
  p,
  starting,
  busy,
  opening,
  onOpen,
  topic,
}: {
  p: Problem;
  starting: string | null;
  busy: boolean;
  opening: boolean;
  onOpen: () => void;
  topic?: ConceptNode;
}) {
  const [flipped, setFlipped] = useState(false);
  const openDoor = onOpen;
  const f = flavorFor(p.id);
  const Icon = f?.icon;
  const suit = f?.suit ?? "♠";
  return (
    <article className={`flip-card playing-card ${flipped ? "is-flipped" : ""}`}>
      <div className="flip-inner">
        {/* Front */}
        <div className="flip-face parchment relative flex flex-col gap-3 rounded-2xl p-5 pt-9" aria-hidden={flipped}>
          <span className={`pip pip-tl ${suitColor(suit)}`}>{suit}</span>
          <span className={`pip pip-br ${suitColor(suit)}`}>{suit}</span>
          {f && (
            <button type="button" onClick={openDoor} disabled={busy} className="-mt-3 block rounded-xl focus-visible:outline-2" tabIndex={flipped ? -1 : 0} aria-label={`Open the door: ${p.title}`}>
              <DoorArt emblem={f.emblem} open={opening} />
            </button>
          )}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              {Icon && !f && (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-[var(--tan)]">
                  <Icon className="size-5" />
                </span>
              )}
              <div>
                <h2 className="font-display text-xl leading-tight">{p.title}</h2>
                <p className="text-xs text-muted-foreground">{f?.concept ?? p.concept}</p>
              </div>
            </div>
            {p.rewardStatus === "paid" && <Badge className="bg-[var(--gold)] text-white">Eaten</Badge>}
            {p.rewardStatus === "forfeited" && <Badge variant="destructive">Off with it</Badge>}
          </div>
          {f && <p className="text-sm text-muted-foreground">{f.blurb}</p>}
          {topic && topic.proficiency !== "new" && (
            <div className="space-y-1.5">
              <LevelBadge level={topic.proficiency} attemptsToday={topic.attemptsToday} />
              <LevelSteps level={topic.proficiency} />
            </div>
          )}
          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <div className="space-y-1">
              <Difficulty n={p.difficulty} />
              <span className="flex items-center gap-1 text-sm font-medium">
                {p.rewardStatus === "failed" || p.rewardStatus === "minting" ? (
                  <span className="text-muted-foreground" title="Your reward is saved and will be delivered once payouts are set up.">
                    <Tart /> Tarts saved, delivery pending
                  </span>
                ) : p.rewardStatus ? (
                  <span className="text-muted-foreground">Unbirthday practice</span>
                ) : (
                  <>
                    <Tart /> Up to {p.maxReward} tarts
                  </>
                )}
              </span>
            </div>
            <Button disabled={busy || flipped} onClick={openDoor}>
              {starting === p.id ? "Opening…" : "Open the door"}
            </Button>
          </div>
          {f && (
            <button type="button" onClick={() => setFlipped(true)} className="self-start text-xs font-medium text-[var(--tan)] hover:underline" tabIndex={flipped ? -1 : 0}>
              Tap to flip: what's behind this door? ↻
            </button>
          )}
        </div>

        {/* Back */}
        {f && (
          <div className="flip-face flip-back card-back-pattern relative flex flex-col gap-3 rounded-2xl p-5 text-[#faf8f1]" aria-hidden={!flipped}>
            <p className="font-display text-xl">{f.character}</p>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--gold-soft)]">You'll practice</p>
              <ul className="mt-1 space-y-1 text-sm">
                {f.practice.map((x) => (
                  <li key={x} className="flex gap-2">
                    <span className="text-[var(--gold-soft)]">✦</span>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-[#d6ecf7]">Your numbers are unique to you. Drink Me bottles (hints) and wrong answers shrink the tart; chatting with the Cat is always free.</p>
            <button
              type="button"
              onClick={() => setFlipped(false)}
              className="mt-auto flex items-center gap-1 self-start rounded-full bg-white/10 px-3 py-1 text-xs font-medium hover:bg-white/20"
              tabIndex={flipped ? 0 : -1}
            >
              <RotateCcw className="size-3.5" /> Flip back
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export function Learn() {
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [kind, setKind] = useState<"problem" | "topic">("problem");
  const [text, setText] = useState("");
  const [starting, setStarting] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [hasMap, setHasMap] = useState(false);
  const concepts = useConceptMap();
  const suggestions = problems ? suggestFrom(concepts) : [];
  useEffect(() => {
    void mapAvailable().then(setHasMap);
  }, []);
  const navigate = useNavigate();

  // One door at a time: swing it open, then go through.
  function openDoor(id: string) {
    if (starting !== null || openingId !== null) return;
    setOpeningId(id);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    setTimeout(() => void start({ templateId: id }, id), reduce ? 0 : 650);
  }

  useEffect(() => {
    setLoadFailed(false);
    api<Problem[]>("/api/problems")
      .then(setProblems)
      .catch((e) => {
        setLoadFailed(true);
        toast.error(e.message);
      });
  }, [attempt]);

  async function start(body: unknown, key: string) {
    setStarting(key);
    try {
      const { sessionId } = await api<{ sessionId: string }>("/api/sessions", body);
      navigate(`/learn/${sessionId}`, { state: { fresh: true } });
    } catch (e) {
      toast.error((e as Error).message);
      setStarting(null);
      setOpeningId(null);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto grid max-w-[90rem] gap-8 px-4 py-10 xl:grid-cols-[16rem_minmax(0,1fr)_17rem]">
        <aside aria-label="Your progress" className="hidden xl:block">
          <div className="sticky top-24">
            <YourDreamPanel problems={problems} concepts={concepts} />
          </div>
        </aside>
        <div className="min-w-0 space-y-10">
        <section className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--tan)]">✦ Dream to Wonderland ✦</p>
          <h1 className="font-display text-4xl text-[var(--night)] dark:text-foreground sm:text-5xl">The Hall of Doors</h1>
          <p className="mx-auto max-w-xl text-muted-foreground">
            Every door opens onto a different dream. Find your own way through and you'll wake up with tarts.
          </p>
        </section>

        {/* Top row: compact suggestions on the left, the Caterpillar's "ask anything" box beside them. */}
        <div className={suggestions.length ? "grid items-start gap-5 lg:grid-cols-2" : ""}>
          {suggestions.length > 0 && (
            <SuggestionCards
              compact
              suggestions={suggestions}
              busy={starting !== null || openingId !== null}
              onOpen={(c) => (c.bankTemplateId ? openDoor(c.bankTemplateId) : void start({ custom: { kind: "topic", text: c.title } }, c.id))}
            />
          )}
        <section aria-labelledby="ask-cat-heading" className={`parchment space-y-3 rounded-2xl p-5 ${suggestions.length ? "" : "mx-auto max-w-3xl"}`}>
          <div>
            <h2 id="ask-cat-heading" className="font-display text-xl leading-tight">“Who are <em>you</em>?” asked the Caterpillar.</h2>
            <p className="text-sm text-muted-foreground">
              …and what are you stuck on? Paste a homework problem or name a topic. The Cat will guide you, but it won't do it for you.
            </p>
          </div>
          <div className="inline-flex rounded-full border bg-background/60 p-0.5" role="tablist">
            {(["problem", "topic"] as const).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={`rounded-full px-4 py-1 text-sm capitalize transition ${kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {k}
              </button>
            ))}
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            rows={kind === "problem" ? 3 : 1}
            className="bg-background/60"
            placeholder={kind === "problem" ? "Paste your homework problem here…" : "e.g. recursion, the chain rule, free fall"}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {kind === "topic" && hasMap ? (
                <>
                  Topics on the{" "}
                  <Link to="/map" className="font-medium text-[var(--tan)] underline">
                    Map of Wonderland
                  </Link>{" "}
                  get a fresh, verified problem that can earn tarts.
                </>
              ) : (
                "Practice only: your own problems don't pay tarts, but we'll point you to a verified door that does."
              )}
            </span>
            <Button disabled={!text.trim() || starting !== null || openingId !== null} onClick={() => start({ custom: { kind, text } }, "custom")}>
              {starting === "custom" ? "The Caterpillar is reading…" : "Ask the Cat"}
            </Button>
          </div>
        </section>
        </div>

        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 min-[1780px]:grid-cols-3">
          {!problems && !loadFailed && <DealtCards count={5} label="Unlocking the doors" />}
          {!problems && loadFailed && (
            <div className="sm:col-span-2 lg:col-span-3 xl:col-span-2 min-[1780px]:col-span-3">
              <LostInWonderland title="The doors are stuck" body="We couldn't reach the server. Check your connection and try again." action={<Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>} />
            </div>
          )}
          {problems?.map((p) => (
            <DoorCard
              key={p.id}
              p={p}
              starting={starting}
              busy={starting !== null || openingId !== null}
              opening={openingId === p.id}
              onOpen={() => openDoor(p.id)}
              topic={conceptForTemplate(concepts, p.id)}
            />
          ))}
        </section>
        <p className="-mt-6 text-center text-xs text-muted-foreground">
          Everyone dreams different numbers, so shared answers won't get you anywhere. Already earned one? It becomes an unbirthday: practice, no tarts. Repeating the same question counts once toward proficiency, so the suggestions point you somewhere new.
        </p>

        </div>
        <aside aria-label="How rewards work" className="hidden xl:block">
          <div className="sticky top-24">
            <TartRecipePanel />
          </div>
        </aside>
      </main>
      <DreamFooter />
    </>
  );
}
