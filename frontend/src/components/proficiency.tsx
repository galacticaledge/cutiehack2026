import { Compass, Sparkles, Sprout, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, type ConceptMap, type ConceptNode } from "@/lib/api";

/**
 * Learning progress comes from the backend's concept proficiency (backend/src/proficiency.rs):
 * New → Learning → Demonstrated → Proficient, tracked separately from rewards. Repeating the
 * same question counts once, so "Proficient" needs verified solves on two different problems.
 * This file only displays it and suggests where to go next; it computes no scores of its own.
 */

export type Level = ConceptNode["proficiency"];

export const LEVELS: Record<Level, { label: string; hint: string; color: string }> = {
  new: { label: "New", hint: "No checked attempt yet.", color: "var(--border)" },
  learning: { label: "Learning", hint: "You've made at least one checked attempt.", color: "#6aa6d6" },
  demonstrated: { label: "Demonstrated", hint: "A verified solve and a convincing testimony.", color: "var(--gold-soft)" },
  proficient: { label: "Proficient", hint: "Verified solves with convincing testimonies on two different problems.", color: "var(--potion)" },
};

/** The concept map (with each concept's proficiency), or null if this server has none. Pass null to skip. */
export function useConceptMap(refreshKey: unknown = 0) {
  const [map, setMap] = useState<ConceptMap | null>(null);
  useEffect(() => {
    if (refreshKey === null) return;
    let live = true;
    api<ConceptMap>("/api/concepts")
      .then((m) => live && Array.isArray(m?.concepts) && setMap(m))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [refreshKey]);
  return map;
}

export function conceptForTemplate(map: ConceptMap | null, templateId: string | null | undefined) {
  return templateId ? map?.concepts.find((c) => c.bankTemplateId === templateId) : undefined;
}

export function LevelBadge({ level, attemptsToday }: { level: Level; attemptsToday?: number }) {
  const l = LEVELS[level] ?? LEVELS.new;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="level-badge" style={{ borderColor: l.color }} title={l.hint}>
        <span className="level-dot" style={{ background: l.color }} aria-hidden="true" />
        {l.label}
      </span>
      {attemptsToday !== undefined && attemptsToday > 0 && <span className="text-muted-foreground">{attemptsToday} checked {attemptsToday === 1 ? "attempt" : "attempts"} today</span>}
    </span>
  );
}

/** Four steps, filled up to the current level. */
export function LevelSteps({ level }: { level: Level }) {
  const order: Level[] = ["new", "learning", "demonstrated", "proficient"];
  const at = order.indexOf(level);
  return (
    <div className="flex gap-1" role="img" aria-label={`Proficiency: ${LEVELS[level].label}`}>
      {order.slice(1).map((l, i) => (
        <span key={l} className="h-1.5 flex-1 rounded-full" style={{ background: i < at ? LEVELS[level].color : "var(--muted)" }} />
      ))}
    </div>
  );
}

export interface Suggestion {
  concept: ConceptNode;
  kind: "finish" | "continue" | "new";
  reason: string;
}

/**
 * Up to three suggestions from the map: concepts one different problem away from Proficient,
 * ones already started, then open concepts not tried yet (easiest foundations first).
 */
export function suggestFrom(map: ConceptMap | null, limit = 3): Suggestion[] {
  if (!map) return [];
  const byId = new Map(map.concepts.map((c) => [c.id, c]));
  const open = map.concepts.filter((c) => c.status !== "locked");
  const out: Suggestion[] = [];
  for (const c of open.filter((c) => c.proficiency === "demonstrated")) {
    out.push({ concept: c, kind: "finish", reason: "One more convincing solve on a different problem makes you Proficient." });
  }
  for (const c of open.filter((c) => c.proficiency === "learning")) {
    out.push({ concept: c, kind: "continue", reason: "You've started this one. Solve it and convince the court to demonstrate it." });
  }
  const fresh = open
    .filter((c) => c.proficiency === "new")
    .sort((a, b) => a.prereqs.length - b.prereqs.length || Number(!a.bankTemplateId) - Number(!b.bankTemplateId));
  for (const c of fresh) {
    const built = c.prereqs.map((p) => byId.get(p)?.title).filter(Boolean);
    out.push({ concept: c, kind: "new", reason: built.length ? `You're ready: it builds on ${built.join(" and ")}.` : "A good place to start." });
  }
  return out.slice(0, limit);
}

const KIND: Record<Suggestion["kind"], { label: string; icon: typeof Sparkles }> = {
  finish: { label: "Almost Proficient", icon: Trophy },
  continue: { label: "Keep going", icon: Sprout },
  new: { label: "New for you", icon: Sparkles },
};

export function SuggestionCards({
  suggestions,
  onOpen,
  busy,
  compact = false,
}: {
  suggestions: Suggestion[];
  onOpen: (c: ConceptNode) => void;
  busy: boolean;
  compact?: boolean;
}) {
  if (!suggestions.length) return null;
  if (compact) {
    return (
      <section aria-labelledby="suggested-heading" className="parchment space-y-2.5 rounded-2xl p-5">
        <h2 id="suggested-heading" className="font-display text-xl leading-tight">
          Suggested for you
        </h2>
        <ul className="space-y-2">
          {suggestions.map(({ concept: c, kind, reason }) => {
            const k = KIND[kind];
            const Icon = k.icon;
            return (
              <li key={c.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-background/50 px-3 py-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[var(--tan)]" title={k.label}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-display text-base leading-tight">{c.title}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--tan)]">{k.label}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground" title={reason}>
                    {reason}
                  </p>
                </div>
                <Button size="xs" variant="outline" disabled={busy} onClick={() => onOpen(c)} aria-label={`${c.bankTemplateId ? "Open the door" : "Explore"}: ${c.title}`}>
                  {c.bankTemplateId ? "Open" : "Explore"}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }
  return (
    <section aria-labelledby="suggested-heading" className="space-y-3">
      <h2 id="suggested-heading" className="font-display text-2xl">
        Suggested for you
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 min-[1780px]:grid-cols-3">
        {suggestions.map(({ concept: c, kind, reason }) => {
          const k = KIND[kind];
          const Icon = k.icon;
          return (
            <article key={c.id} className="parchment flex flex-col gap-2 rounded-2xl p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--tan)]">
                <Icon className="size-3.5" /> {k.label}
              </p>
              <h3 className="font-display text-lg leading-tight">{c.title}</h3>
              <p className="text-sm text-muted-foreground">{reason}</p>
              <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                <LevelBadge level={c.proficiency} />
                <Button size="sm" disabled={busy} onClick={() => onOpen(c)}>
                  {c.bankTemplateId ? "Open the door" : (
                    <>
                      <Compass /> Explore
                    </>
                  )}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
