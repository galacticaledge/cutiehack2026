import { useEffect, useState } from "react";
import { api, type ConceptMap, type ConceptNode } from "@/lib/api";

export type Level = ConceptNode["proficiency"];

export const LEVELS: Record<Level, { label: string; hint: string; color: string }> = {
  new: { label: "New", hint: "No checked attempt yet.", color: "var(--border)" },
  learning: { label: "Learning", hint: "You've made at least one checked attempt.", color: "#6aa6d6" },
  demonstrated: { label: "Demonstrated", hint: "A verified solve and a convincing testimony.", color: "var(--gold-soft)" },
  proficient: { label: "Proficient", hint: "Verified solves with convincing testimonies on two different problems.", color: "var(--potion)" },
};

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

export interface Suggestion {
  concept: ConceptNode;
  kind: "finish" | "continue" | "new";
  reason: string;
}

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
