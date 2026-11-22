import { BoxSelect, Check, DoorOpen, Lock, Network, Map as MapIcon, Sparkles, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { GraphView } from "@/components/graphview";
import { Header } from "@/components/header";
import { DreamFooter } from "@/components/scenery";
import { DealtCards, LostInWonderland } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Tart } from "@/components/wonder";
import { LevelBadge } from "@/components/proficiency";
import { acceptProposal, api, ApiError, nextStep, startConcept, type ConceptMap, type ConceptNode, type Features, type Proposal } from "@/lib/api";

/** Each subject is a region of Wonderland. */
const REGIONS: Record<string, { name: string; suit: string }> = {
  Algebra: { name: "The White Rabbit's Lane", suit: "♥" },
  Geometry: { name: "The Queen's Croquet Ground", suit: "♦" },
  Calculus: { name: "The Caterpillar's Mushroom Forest", suit: "♣" },
  Physics: { name: "Down the Rabbit Hole", suit: "♠" },
  Statistics: { name: "The Duchess's Kitchen", suit: "♦" },
  "Computer science": { name: "The Mad Hatter's Tea Table", suit: "♣" },
  Chemistry: { name: "The Pool of Tears", suit: "♠" },
};
const OWN_REGION = "__own__";
const VIEW_KEY = "socra:mapView";

/** Longest prerequisite chain, so each region's path runs from basics to advanced. */
function depths(concepts: ConceptNode[]) {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const memo = new Map<string, number>();
  const depth = (id: string, seen = new Set<string>()): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (seen.has(id)) return 0; // guard against a cycle in the data
    seen.add(id);
    const c = byId.get(id);
    const d = c && c.prereqs.length ? 1 + Math.max(...c.prereqs.map((p) => depth(p, seen))) : 0;
    memo.set(id, d);
    return d;
  };
  concepts.forEach((c) => depth(c.id));
  return memo;
}

function StoneIcon({ c }: { c: ConceptNode }) {
  if (c.status === "mastered") return <Check className="size-5" />;
  if (c.status === "locked") return <Lock className="size-4" />;
  if (c.practiceOnly) return <Sparkles className="size-4" />;
  return <DoorOpen className="size-5" />;
}

function readView(): "regions" | "graph" {
  try {
    return localStorage.getItem(VIEW_KEY) === "graph" ? "graph" : "regions";
  } catch {
    return "regions";
  }
}

type NextState =
  | { anchor: string; kind: "loading" }
  | { anchor: string; kind: "existing"; conceptId: string; title: string }
  | { anchor: string; kind: "proposal"; proposal: Proposal }
  | { anchor: string; kind: "error"; message: string };

/** Friendly words for the graph endpoints' errors. */
function nextStepMessage(e: unknown) {
  const err = e as ApiError;
  if (err.status === 429) return err.message || "That's enough new topics for today. Come back tomorrow.";
  if (err.status === 503) return "The Caterpillar is napping (the tutor is busy). Try again in a moment.";
  if (err.status === 502) return "The Caterpillar mumbled something we couldn't read. Try again.";
  return err.message || "Something went wrong. Try again.";
}

export function WonderMap() {
  const [map, setMap] = useState<ConceptMap | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "failed">("loading");
  const [features, setFeatures] = useState<Features | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<"regions" | "graph">(readView);
  const [next, setNext] = useState<NextState | null>(null);
  const [accepting, setAccepting] = useState(false);
  /** Set once the server says personal topics are switched off, to hide "What's next?". */
  const [graphOff, setGraphOff] = useState(false);
  const navigate = useNavigate();
  const loaded = useRef(false);
  const detailRef = useRef<HTMLElement>(null);

  // On narrow screens the details sit below the tunnel: bring them into view when a topic is picked.
  useEffect(() => {
    if (!selected || view !== "graph" || !window.matchMedia?.("(max-width: 1023px)").matches) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => detailRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" }), 60);
    return () => clearTimeout(t);
  }, [selected, view]);

  useEffect(() => {
    // Refreshes after accepting a topic keep the map on screen instead of flashing a skeleton.
    if (!loaded.current) setState("loading");
    api<ConceptMap>("/api/concepts")
      .then((m) => {
        if (!Array.isArray(m?.concepts)) {
          setState("unavailable");
          return;
        }
        loaded.current = true;
        setMap(m);
        setState("ready");
      })
      .catch((e) => {
        if (loaded.current) return toast.error((e as Error).message);
        setState((e as ApiError).status === 404 ? "unavailable" : "failed");
      });
    if (!features) api<Features>("/api/features").then(setFeatures).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  function changeView(v: "regions" | "graph") {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode: just don't remember */
    }
  }

  function select(id: string | null) {
    setSelected(id);
    if (next && next.anchor !== id) setNext(null);
  }

  const titleOf = useMemo(() => {
    const m = new Map(map?.concepts.map((c) => [c.id, c.title]));
    return (id: string) => m.get(id) ?? id;
  }, [map]);
  const order = useMemo(() => (map ? depths(map.concepts) : new Map<string, number>()), [map]);
  const own = map?.concepts.filter((c) => c.practiceOnly) ?? [];
  const subjects = map ? [...new Set(map.concepts.filter((c) => !c.practiceOnly).map((c) => c.subject))] : [];
  const regionKeys = own.length ? [...subjects, OWN_REGION] : subjects;
  const capReached = map ? map.topicRewardsToday >= map.dailyTopicCap : false;
  const sel = map?.concepts.find((c) => c.id === selected) ?? null;
  const mastered = map?.concepts.filter((c) => c.status === "mastered").length ?? 0;

  function earnLabel(c: ConceptNode) {
    if (c.practiceOnly) return "Your own topic: practice only, no tarts. Proficiency still counts.";
    if (c.rewarded) return "Already earned: practice only";
    if (c.status === "locked") return "Locked: master what it builds on first (practice is still open)";
    if (c.bankTemplateId) return "A verified door in the Hall: up to its full tarts";
    return capReached ? "Today's new-topic tarts are used up: practice only" : `Up to ${map?.questBase ?? 50} tarts for a fresh, verified problem`;
  }

  async function start(c: ConceptNode) {
    setStarting(c.id);
    try {
      const { sessionId } = await startConcept(c);
      navigate(`/learn/${sessionId}`, { state: { fresh: true } });
    } catch (e) {
      toast.error((e as Error).message);
      setStarting(null);
    }
  }

  async function askNext(c: ConceptNode) {
    setNext({ anchor: c.id, kind: "loading" });
    try {
      const r = await nextStep(c.id);
      if (r.kind === "existing") {
        // The step may be a topic the map doesn't list yet (e.g. made on another tab): refresh.
        if (!map?.concepts.some((x) => x.id === r.concept.id)) setAttempt((n) => n + 1);
        setNext({ anchor: c.id, kind: "existing", conceptId: r.concept.id, title: r.concept.title });
      } else {
        setNext({ anchor: c.id, kind: "proposal", proposal: r.proposal });
      }
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 404 && /not enabled/i.test(err.message)) {
        setGraphOff(true);
        setNext(null);
        return;
      }
      setNext({ anchor: c.id, kind: "error", message: nextStepMessage(e) });
    }
  }

  async function accept(p: Proposal) {
    setAccepting(true);
    try {
      const { conceptId } = await acceptProposal(p.proposalId);
      toast.success(`“${p.title}” is now on your map`);
      setNext(null);
      setSelected(conceptId);
      setAttempt((n) => n + 1);
    } catch (e) {
      const err = e as ApiError;
      setNext({ anchor: p.anchorId, kind: "error", message: err.status === 404 ? "That suggestion expired. Ask again." : nextStepMessage(e) });
    } finally {
      setAccepting(false);
    }
  }

  const detail = sel && (
    <div className="map-detail flip-in mt-4 rounded-xl border border-[var(--border)] bg-card p-4" role="region" aria-label={`${sel.title} details`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-xl leading-tight">{sel.title}</p>
          <p className="text-xs text-muted-foreground">
            {sel.practiceOnly ? "Your own topic · " : ""}
            {sel.grown ? "🌱 Grown by a student's question · " : ""}
            {{ available: "Open to explore", mastered: "Mastered", locked: "Locked" }[sel.status]}
          </p>
        </div>
        <button type="button" onClick={() => select(null)} className="rounded-full p-1 text-muted-foreground hover:bg-secondary" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      {sel.objective && <p className="mt-2 text-sm italic">{sel.objective}</p>}
      {sel.prereqs.length > 0 && (
        <p className="mt-2 text-sm">
          <span className="text-muted-foreground">Builds on </span>
          {sel.prereqs.map((p, i) => (
            <span key={p}>
              {i > 0 && ", "}
              <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => select(p)}>
                {titleOf(p)}
              </button>
            </span>
          ))}
        </p>
      )}
      <div className="mt-2">
        <LevelBadge level={sel.proficiency ?? "new"} attemptsToday={sel.attemptsToday} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{earnLabel(sel)}</p>

      {next?.anchor === sel.id && next.kind !== "loading" && (
        <div className="next-step mt-3 rounded-lg p-3 text-sm" role="status">
          {next.kind === "existing" && (
            <p>
              Next on your path:{" "}
              <button type="button" className="font-semibold underline underline-offset-2" onClick={() => select(next.conceptId)}>
                {next.title}
              </button>
            </p>
          )}
          {next.kind === "error" && <p>{next.message}</p>}
          {next.kind === "proposal" && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--cheshire)]">
                <Wand2 className="size-3.5" /> The Caterpillar suggests a new topic
              </p>
              <p className="font-display text-lg leading-tight">{next.proposal.title}</p>
              <p>{next.proposal.objective}</p>
              <p className="text-muted-foreground">{next.proposal.reason}</p>
              {next.proposal.prereqIds.length > 0 && <p className="text-xs text-muted-foreground">Builds on {next.proposal.prereqIds.map(titleOf).join(", ")}</p>}
              <p className="text-xs text-muted-foreground">It joins your map as your own topic: practice only, no tarts.</p>
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <Button size="sm" variant="ghost" onClick={() => setNext(null)} disabled={accepting}>
                  Not now
                </Button>
                <Button size="sm" onClick={() => accept(next.proposal)} disabled={accepting}>
                  {accepting ? "Adding…" : "Add to my map"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {!graphOff && features?.personalizedConcepts !== false && next?.kind !== "proposal" && (
          <Button size="sm" variant="outline" disabled={next?.kind === "loading"} onClick={() => askNext(sel)} title="Ask for the next topic after this one">
            <Wand2 /> {next?.anchor === sel.id && next.kind === "loading" ? "Asking the Caterpillar…" : "What's next?"}
          </Button>
        )}
        <Button size="sm" disabled={starting !== null} onClick={() => start(sel)}>
          {starting === sel.id ? "Building a dream…" : sel.status === "locked" || sel.rewarded || sel.practiceOnly ? "Practice here" : "Explore here"}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Header />
      <main className="mx-auto max-w-[90rem] space-y-8 px-4 py-10">
        <section className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--tan)]">✦ Dream to Wonderland ✦</p>
          <h1 className="font-display text-4xl text-[var(--night)] dark:text-foreground sm:text-5xl">The Map of Wonderland</h1>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Every topic is a place. Solve a fresh problem there and explain why your method works to earn its tarts once. A place opens up when you've mastered the
            ones it builds on.
          </p>
          {map && (
            <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
              <span>
                <span className="font-semibold">{mastered}</span> of {map.concepts.length} places mastered
              </span>
              <span className="flex items-center gap-1">
                <Tart /> New-topic tarts today: <span className="font-semibold tabular-nums">{map.topicRewardsToday} / {map.dailyTopicCap}</span>
              </span>
              {map.attemptsDateUtc && (
                <span className="text-muted-foreground" title="Proficiency and attempts are tracked separately from rewards.">
                  Attempts counted for {map.attemptsDateUtc} (UTC)
                </span>
              )}
            </p>
          )}
        </section>

        {state === "loading" && (
          <div className="grid gap-5 md:grid-cols-2">
            <DealtCards count={4} className="h-56" label="Unrolling the map" />
          </div>
        )}
        {state === "unavailable" && (
          <LostInWonderland
            title="The map is still being drawn"
            body="This server doesn't have the Map of Wonderland yet. The verified doors in the Hall are open in the meantime."
            action={<Button onClick={() => navigate("/learn")}>To the Hall of Doors</Button>}
          />
        )}
        {state === "failed" && (
          <LostInWonderland
            title="The map blew away"
            body="We couldn't load the map. Check your connection and try again."
            action={<Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>}
          />
        )}

        {state === "ready" && map && (
          <>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              <div className="view-toggle" role="radiogroup" aria-label="Map view">
                <button type="button" role="radio" aria-checked={view === "regions"} onClick={() => changeView("regions")}>
                  <MapIcon className="size-4" /> Regions
                </button>
                <button type="button" role="radio" aria-checked={view === "graph"} onClick={() => changeView("graph")}>
                  <Network className="size-4" /> Rabbit hole
                </button>
              </div>
              <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground" aria-label="Map legend">
                <li className="flex items-center gap-1.5">
                  <span className="map-stone map-stone-sm is-mastered"><Check className="size-3" /></span> Mastered
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="map-stone map-stone-sm is-available"><DoorOpen className="size-3" /></span> Open to explore
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="map-stone map-stone-sm is-locked"><Lock className="size-3" /></span> Locked
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="map-stone map-stone-sm is-own"><Sparkles className="size-3" /></span> Your own topic
                </li>
              </ul>
            </div>

            {view === "graph" ? (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="min-w-0 space-y-2">
                  <GraphView concepts={map.concepts} selected={selected} onSelect={(id) => select(id === selected ? null : id)} />
                  <p className="text-center text-xs text-muted-foreground">Lines run from a topic to the ones it unlocks. Pick a topic to light up its path; the colored ring is your level.</p>
                </div>
                <aside ref={detailRef} aria-label="Selected topic" className="scroll-mt-24 lg:sticky lg:top-24 lg:self-start">
                  {detail ?? (
                    <div className="parchment rounded-2xl p-5 text-sm text-muted-foreground">
                      <p className="font-display text-xl text-foreground">Pick a place</p>
                      <p className="mt-1">Choose any topic in the rabbit hole to see what it builds on, your level there, and to ask the Caterpillar what to learn next.</p>
                    </div>
                  )}
                </aside>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                {regionKeys.map((subject, si) => {
                  const isOwn = subject === OWN_REGION;
                  const region = isOwn ? { name: "Your Own Corner of Wonderland", suit: "✦" } : (REGIONS[subject] ?? { name: subject, suit: "♠" });
                  const nodes = (isOwn ? own : map.concepts.filter((c) => !c.practiceOnly && c.subject === subject)).sort(
                    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
                  );
                  const done = nodes.filter((c) => c.status === "mastered").length;
                  return (
                    <section
                      key={subject}
                      className={`parchment deal-in relative rounded-2xl p-5 ${isOwn ? "own-region" : ""}`}
                      style={{ animationDelay: `${si * 70}ms` }}
                      aria-labelledby={`region-${si}`}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <h2 id={`region-${si}`} className="font-display text-2xl leading-tight">
                            <span className={isOwn ? "text-[var(--cheshire)]" : region.suit === "♥" || region.suit === "♦" ? "text-[var(--heart)]" : ""}>{region.suit}</span> {region.name}
                          </h2>
                          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tan)]">{isOwn ? "Topics the Caterpillar made for you · practice only" : subject}</p>
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {done}/{nodes.length} mastered
                        </span>
                      </div>
                      {subject === "Computer science" && features?.codeRunner && (
                        <p className="solari-badge mt-2">
                          <BoxSelect className="size-4" /> New problems here are checked by running the code in a Solari sandbox
                        </p>
                      )}
                      <ol className="map-path mt-4">
                        {nodes.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => select(c.id === selected ? null : c.id)}
                              className={`map-node ${selected === c.id ? "is-selected" : ""}`}
                              aria-expanded={selected === c.id}
                              aria-label={`${c.title}: ${c.status}${c.rewarded ? ", earned" : ""}${c.practiceOnly ? ", your own topic" : ""}${c.grown ? ", grown by a student" : ""}`}
                            >
                              <span className={`map-stone is-${c.status} ${c.practiceOnly ? "is-own" : ""}`}>
                                <StoneIcon c={c} />
                              </span>
                              <span className="map-label">{c.title}</span>
                              {c.grown && (
                                <span className="shrink-0 text-xs" title="Grown by a student's question" aria-hidden="true">
                                  🌱
                                </span>
                              )}
                              {c.rewarded && <Tart className="size-3.5 shrink-0" />}
                            </button>
                          </li>
                        ))}
                      </ol>
                      {sel && (isOwn ? sel.practiceOnly : !sel.practiceOnly && sel.subject === subject) && detail}
                    </section>
                  );
                })}
              </div>
            )}
            <p className="text-center text-xs text-muted-foreground">
              Asking for the same topic in different words lands on the same place on the map. Prefer a ready-made problem? Visit the{" "}
              <Link to="/learn" className="underline">
                Hall of Doors
              </Link>
              .
            </p>
          </>
        )}
      </main>
      <DreamFooter />
    </>
  );
}
