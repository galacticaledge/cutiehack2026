import { Compass, Sparkles, Sprout, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConceptNode } from "@/lib/api";
import { LEVELS, type Level, type Suggestion } from "@/lib/proficiency";

export type { Level, Suggestion };

/**
 * Learning progress comes from the backend's concept proficiency (backend/src/proficiency.rs):
 * New → Learning → Demonstrated → Proficient, tracked separately from rewards. Repeating the
 * same question counts once, so "Proficient" needs verified solves on two different problems.
 * This file only displays it and suggests where to go next; it computes no scores of its own.
 */

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
