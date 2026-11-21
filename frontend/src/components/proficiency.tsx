import { Compass, Hourglass, RotateCcw, Sparkles, Sprout } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { flavorFor } from "@/components/wonder";
import { api, ApiError, type Proficiency, type Suggestion } from "@/lib/api";

/** Proficiency per topic and suggestions; null if this server doesn't track proficiency yet.
 *  Pass `null` as the key to skip fetching (e.g. until a trial is over). */
export function useProficiency(refreshKey: unknown = 0) {
  const [data, setData] = useState<Proficiency | null>(null);
  useEffect(() => {
    if (refreshKey === null) return;
    let live = true;
    api<Proficiency>("/api/proficiency")
      .then((d) => live && Array.isArray(d?.topics) && setData(d))
      .catch((e) => {
        if ((e as ApiError).status !== 404) console.warn("[proficiency]", (e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [refreshKey]);
  return data;
}

const LEVEL_COLOR: Record<string, string> = {
  Mastered: "var(--potion)",
  Skilled: "var(--gold-soft)",
  Learning: "#6aa6d6",
  Curious: "var(--heart)",
  Unexplored: "var(--border)",
};

export function ProficiencyMeter({ value, level, fading, compact = false }: { value: number; level: string; fading?: boolean; compact?: boolean }) {
  return (
    <div className="space-y-1" title={fading ? "Fading: you haven't visited in a while" : undefined}>
      {!compact && (
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold">{level}</span>
          <span className="flex items-center gap-1 tabular-nums text-muted-foreground">
            {fading && <Hourglass className="size-3" aria-label="fading" />}
            {value}%
          </span>
        </div>
      )}
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={`Proficiency: ${level}, ${value}%`}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: LEVEL_COLOR[level] ?? "var(--tan)" }} />
      </div>
    </div>
  );
}

const KIND: Record<Suggestion["kind"], { label: string; icon: typeof Sparkles }> = {
  new: { label: "New for you", icon: Sparkles },
  strengthen: { label: "Strengthen", icon: Sprout },
  review: { label: "Review", icon: RotateCcw },
  foundation: { label: "Build the foundation", icon: Compass },
};

export function SuggestionCards({ suggestions, onOpen, busy }: { suggestions: Suggestion[]; onOpen: (templateId: string) => void; busy: boolean }) {
  if (!suggestions.length) return null;
  return (
    <section aria-labelledby="suggested-heading" className="space-y-3">
      <h2 id="suggested-heading" className="font-display text-2xl">
        Suggested for you
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 min-[1780px]:grid-cols-3">
        {suggestions.map((sg) => {
          const k = KIND[sg.kind] ?? KIND.new;
          const Icon = k.icon;
          const f = flavorFor(sg.templateId);
          return (
            <article key={sg.templateId + sg.kind} className="parchment flex flex-col gap-2 rounded-2xl p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--tan)]">
                <Icon className="size-3.5" /> {k.label}
              </p>
              <h3 className="font-display text-lg leading-tight">{sg.title}</h3>
              <p className="text-sm text-muted-foreground">{sg.reason}</p>
              <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                <span className="text-xs text-muted-foreground">{f?.concept}</span>
                <Button size="sm" disabled={busy} onClick={() => onOpen(sg.templateId)}>
                  Open the door
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
