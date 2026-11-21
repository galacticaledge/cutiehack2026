import { BoxSelect, Check, DoorOpen, Lock, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Header } from "@/components/header";
import { DreamFooter } from "@/components/scenery";
import { DealtCards, LostInWonderland } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Tart } from "@/components/wonder";
import { api, ApiError, type ConceptMap, type ConceptNode, type Features } from "@/lib/api";

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
  return <DoorOpen className="size-5" />;
}

export function WonderMap() {
  const [map, setMap] = useState<ConceptMap | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "failed">("loading");
  const [features, setFeatures] = useState<Features | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    setState("loading");
    api<ConceptMap>("/api/concepts")
      .then((m) => {
        if (!Array.isArray(m?.concepts)) {
          setState("unavailable");
          return;
        }
        setMap(m);
        setState("ready");
      })
      .catch((e) => setState((e as ApiError).status === 404 ? "unavailable" : "failed"));
    api<Features>("/api/features").then(setFeatures).catch(() => {});
  }, [attempt]);

  const titleOf = useMemo(() => {
    const m = new Map(map?.concepts.map((c) => [c.id, c.title]));
    return (id: string) => m.get(id) ?? id;
  }, [map]);
  const order = useMemo(() => (map ? depths(map.concepts) : new Map<string, number>()), [map]);
  const subjects = map ? [...new Set(map.concepts.map((c) => c.subject))] : [];
  const capReached = map ? map.topicRewardsToday >= map.dailyTopicCap : false;
  const sel = map?.concepts.find((c) => c.id === selected) ?? null;
  const mastered = map?.concepts.filter((c) => c.status === "mastered").length ?? 0;

  function earnLabel(c: ConceptNode) {
    if (c.rewarded) return "Already earned: practice only";
    if (c.status === "locked") return "Locked: master what it builds on first (practice is still open)";
    if (c.bankTemplateId) return "A verified door in the Hall: up to its full tarts";
    return capReached ? "Today's new-topic tarts are used up: practice only" : `Up to ${map?.questBase ?? 50} tarts for a fresh, verified problem`;
  }

  async function start(c: ConceptNode) {
    setStarting(c.id);
    try {
      const body = c.bankTemplateId ? { templateId: c.bankTemplateId } : { custom: { kind: "topic", text: c.title } };
      const { sessionId } = await api<{ sessionId: string }>("/api/sessions", body);
      navigate(`/learn/${sessionId}`, { state: { fresh: true } });
    } catch (e) {
      toast.error((e as Error).message);
      setStarting(null);
    }
  }

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
            </ul>

            <div className="grid gap-6 md:grid-cols-2">
              {subjects.map((subject, si) => {
                const region = REGIONS[subject] ?? { name: subject, suit: "♠" };
                const nodes = map.concepts.filter((c) => c.subject === subject).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
                const done = nodes.filter((c) => c.status === "mastered").length;
                return (
                  <section key={subject} className="parchment deal-in relative rounded-2xl p-5" style={{ animationDelay: `${si * 70}ms` }} aria-labelledby={`region-${si}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <h2 id={`region-${si}`} className="font-display text-2xl leading-tight">
                          <span className={region.suit === "♥" || region.suit === "♦" ? "text-[var(--heart)]" : ""}>{region.suit}</span> {region.name}
                        </h2>
                        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tan)]">{subject}</p>
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
                            onClick={() => setSelected(c.id === selected ? null : c.id)}
                            className={`map-node ${selected === c.id ? "is-selected" : ""}`}
                            aria-expanded={selected === c.id}
                            aria-label={`${c.title}: ${c.status}${c.rewarded ? ", earned" : ""}`}
                          >
                            <span className={`map-stone is-${c.status}`}>
                              <StoneIcon c={c} />
                            </span>
                            <span className="map-label">{c.title}</span>
                            {c.rewarded && <Tart className="size-3.5 shrink-0" />}
                          </button>
                        </li>
                      ))}
                    </ol>

                    {sel && sel.subject === subject && (
                      <div className="map-detail flip-in mt-4 rounded-xl border border-[var(--border)] bg-card p-4" role="region" aria-label={`${sel.title} details`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-display text-xl leading-tight">{sel.title}</p>
                            <p className="text-xs capitalize text-muted-foreground">{sel.status === "available" ? "open to explore" : sel.status}</p>
                          </div>
                          <button type="button" onClick={() => setSelected(null)} className="rounded-full p-1 text-muted-foreground hover:bg-secondary" aria-label="Close">
                            <X className="size-4" />
                          </button>
                        </div>
                        {sel.prereqs.length > 0 && (
                          <p className="mt-2 text-sm">
                            <span className="text-muted-foreground">Builds on </span>
                            {sel.prereqs.map((p, i) => (
                              <span key={p}>
                                {i > 0 && ", "}
                                <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => setSelected(p)}>
                                  {titleOf(p)}
                                </button>
                              </span>
                            ))}
                          </p>
                        )}
                        <p className="mt-1 text-sm text-muted-foreground">{earnLabel(sel)}</p>
                        <div className="mt-3 flex justify-end">
                          <Button size="sm" disabled={starting !== null} onClick={() => start(sel)}>
                            {starting === sel.id ? "Building a dream…" : sel.status === "locked" || sel.rewarded ? "Practice here" : "Explore here"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
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
