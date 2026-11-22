import { useEffect, useMemo, useRef } from "react";
import { LEVELS } from "@/lib/proficiency";
import type { ConceptNode } from "@/lib/api";

/**
 * The knowledge graph drawn as a picture: columns by depth (how many steps of prerequisites
 * lead to a topic), curved lines from each prerequisite to what it unlocks. Selecting a topic
 * highlights what it builds on and what it opens up. Personal topics have a dashed purple ring.
 */

const COL_W = 190;
const ROW_H = 66;
const BAND_HEAD = 34;
const BAND_GAP = 18;
const PAD_X = 90;
const PAD_Y = 12;
const R = 11;

/**
 * One horizontal band per subject (your own topics sit in their subject's band), columns by
 * prerequisite depth within that subject. Links between subjects show only for the selected topic.
 */
function layout(concepts: ConceptNode[]) {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const depth = new Map<string, number>();
  const visit = (id: string, seen: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0; // guard against a cycle in the data
    seen.add(id);
    // Columns count steps within the subject; links to other subjects are drawn on demand.
    const me = byId.get(id);
    const known = (me?.prereqs ?? []).filter((p) => byId.get(p)?.subject === me?.subject);
    const d = known.length ? 1 + Math.max(...known.map((p) => visit(p, seen))) : 0;
    depth.set(id, d);
    return d;
  };
  concepts.forEach((c) => visit(c.id, new Set()));
  const subjects = [...new Set(concepts.map((c) => c.subject))];
  const pos = new Map<string, { x: number; y: number }>();
  const bands: { subject: string; y: number; height: number }[] = [];
  let y = PAD_Y;
  let maxDepth = 0;
  for (const subject of subjects) {
    const cols = new Map<number, ConceptNode[]>();
    for (const c of concepts.filter((c) => c.subject === subject)) {
      const d = depth.get(c.id) ?? 0;
      maxDepth = Math.max(maxDepth, d);
      cols.set(d, [...(cols.get(d) ?? []), c]);
    }
    let rows = 1;
    for (const [d, list] of cols) {
      list.sort((a, b) => Number(!!a.practiceOnly) - Number(!!b.practiceOnly) || a.title.localeCompare(b.title));
      rows = Math.max(rows, list.length);
      list.forEach((c, i) => pos.set(c.id, { x: PAD_X + R + d * COL_W, y: y + BAND_HEAD + R + i * ROW_H }));
    }
    const height = BAND_HEAD + rows * ROW_H;
    bands.push({ subject, y, height });
    y += height + BAND_GAP;
  }
  return { pos, bands, width: PAD_X + maxDepth * COL_W + COL_W + 20, height: y - BAND_GAP + PAD_Y };
}

const STATUS_FILL: Record<ConceptNode["status"], string> = {
  mastered: "var(--potion)",
  available: "#fff8e6",
  locked: "var(--muted)",
};

export function GraphView({ concepts, selected, onSelect }: { concepts: ConceptNode[]; selected: string | null; onSelect: (id: string) => void }) {
  const { pos, bands, width, height } = useMemo(() => layout(concepts), [concepts]);
  const sel = concepts.find((c) => c.id === selected);
  const byId = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts]);
  const box = useRef<HTMLDivElement>(null);
  // Bring the selected topic into view inside the scroll box (it may be chosen from the side panel).
  useEffect(() => {
    const at = selected ? pos.get(selected) : undefined;
    const el = box.current;
    if (!at || !el) return;
    const svgLeft = (el.firstElementChild as HTMLElement | null)?.offsetLeft ?? 0;
    const x = svgLeft + at.x;
    const y = at.y;
    const inX = x > el.scrollLeft + 40 && x < el.scrollLeft + el.clientWidth - 120;
    const inY = y > el.scrollTop + 30 && y < el.scrollTop + el.clientHeight - 50;
    if (inX && inY) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    el.scrollTo({ left: inX ? el.scrollLeft : x - el.clientWidth / 2, top: inY ? el.scrollTop : y - el.clientHeight / 2, behavior: reduce ? "auto" : "smooth" });
  }, [selected, pos]);
  const related = useMemo(() => {
    if (!sel) return new Set<string>();
    const s = new Set<string>([sel.id, ...sel.prereqs]);
    concepts.forEach((c) => c.prereqs.includes(sel.id) && s.add(c.id));
    return s;
  }, [sel, concepts]);

  return (
    <div ref={box} className="graph-scroll parchment rounded-2xl" role="group" aria-label="Knowledge graph">
      <svg width={width} height={height} className="graph-svg" aria-hidden="false">
        <title>Knowledge graph: lines run from each topic to the topics it unlocks</title>
        {bands.map((band, i) => (
          <g key={band.subject}>
            <rect x={4} y={band.y} width={width - 8} height={band.height} rx={14} className={`graph-band ${i % 2 ? "is-alt" : ""}`} />
            <text x={18} y={band.y + 22} className="graph-band-label">
              {band.subject}
            </text>
          </g>
        ))}
        {/* edges */}
        {concepts.flatMap((c) =>
          c.prereqs
            .filter((p) => pos.has(p))
            .map((p) => {
              const a = pos.get(p)!;
              const b = pos.get(c.id)!;
              const mx = (a.x + b.x) / 2;
              const on = sel && (c.id === sel.id || p === sel.id);
              const cross = byId.get(p)?.subject !== c.subject;
              if (cross && !on) return null;
              return (
                <path
                  key={`${p}->${c.id}`}
                  d={`M${a.x + R} ${a.y} C${mx} ${a.y}, ${mx} ${b.y}, ${b.x - R} ${b.y}`}
                  className={`graph-edge ${on ? "is-on" : sel ? "is-dim" : ""} ${c.practiceOnly ? "is-personal" : ""}`}
                />
              );
            }),
        )}
        {/* nodes */}
        {concepts.map((c) => {
          const p = pos.get(c.id)!;
          const dim = sel && !related.has(c.id);
          const ring = LEVELS[c.proficiency ?? "new"]?.color ?? "var(--border)";
          return (
            <g
              key={c.id}
              className={`graph-node ${selected === c.id ? "is-selected" : ""} ${dim ? "is-dim" : ""}`}
              transform={`translate(${p.x} ${p.y})`}
              role="button"
              tabIndex={0}
              aria-label={`${c.title}: ${c.status}${c.practiceOnly ? ", your own topic" : ""}`}
              aria-pressed={selected === c.id}
              onClick={() => onSelect(c.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(c.id))}
            >
              <circle r={R + 4} fill="none" stroke={ring} strokeWidth="3" strokeDasharray={c.practiceOnly ? "4 3" : undefined} className="graph-ring" />
              <circle r={R} fill={c.practiceOnly ? "#efe2ff" : STATUS_FILL[c.status]} stroke={c.practiceOnly ? "var(--cheshire)" : "currentColor"} strokeWidth="1.5" />
              {c.status === "locked" && <path d="M-4 1h8v5h-8zM-2.5 1v-2a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.3" />}
              {c.status === "mastered" && <path d="M-4.5 0.5l3 3 6-6.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
              <text y={R + 19} textAnchor="middle" className="graph-label">
                {c.title.length > 24 ? `${c.title.slice(0, 23)}…` : c.title}
              </text>
              <title>{c.title}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
