import { useEffect, useId, useMemo, useRef } from "react";
import { LEVELS } from "@/lib/proficiency";
import type { ConceptNode } from "@/lib/api";

/**
 * The Rabbit hole (the knowledge graph): the basics sit at the mouth of the hole and every
 * step of prerequisites is a ledge further down the tunnel. Lines run from a topic down to
 * what it unlocks. Picking a topic lights up what it builds on and what it opens; links
 * between subjects show only then, so the tunnel stays readable. Your own topics have a
 * dashed ring.
 */

const COLS = 6; // topics per row before a ledge wraps
const COL_W = 158;
const ROW_H = 92;
const LEDGE_HEAD = 46;
const MOUTH_H = 70;
const SIDE = 56; // room for the walls and the things tumbling past them
const R = 12;

const SUBJECT_ORDER = ["Algebra", "Geometry", "Statistics", "Computer science", "Calculus", "Physics", "Chemistry"];
const SUIT: Record<string, string> = {
  Algebra: "♥",
  Geometry: "♦",
  Calculus: "♣",
  Physics: "♠",
  Statistics: "♦",
  "Computer science": "♣",
  Chemistry: "♠",
};

const LEDGES = [
  "The mouth of the hole",
  "Falling past cupboards and bookshelves",
  "Deeper: a jar of orange marmalade",
  "Deeper still: the hall of tiny doors",
  "Curiouser and curiouser",
];

const subjectRank = (s: string) => {
  const i = SUBJECT_ORDER.indexOf(s);
  return i === -1 ? SUBJECT_ORDER.length : i;
};

function layout(concepts: ConceptNode[]) {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const depth = new Map<string, number>();
  const visit = (id: string, seen: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0; // guard against a cycle in the data
    seen.add(id);
    const known = (byId.get(id)?.prereqs ?? []).filter((p) => byId.has(p));
    const d = known.length ? 1 + Math.max(...known.map((p) => visit(p, seen))) : 0;
    depth.set(id, d);
    return d;
  };
  concepts.forEach((c) => visit(c.id, new Set()));

  const levels = new Map<number, ConceptNode[]>();
  for (const c of concepts) {
    const d = depth.get(c.id) ?? 0;
    levels.set(d, [...(levels.get(d) ?? []), c]);
  }
  const width = SIDE * 2 + COLS * COL_W;
  const pos = new Map<string, { x: number; y: number; depth: number }>();
  const ledges: { depth: number; y: number; label: string }[] = [];
  let y = MOUTH_H;
  for (const d of [...levels.keys()].sort((a, b) => a - b)) {
    const list = levels
      .get(d)!
      .sort((a, b) => Number(!!a.practiceOnly) - Number(!!b.practiceOnly) || subjectRank(a.subject) - subjectRank(b.subject) || a.title.localeCompare(b.title));
    ledges.push({ depth: d, y, label: LEDGES[Math.min(d, LEDGES.length - 1)] });
    y += LEDGE_HEAD;
    for (let row = 0; row * COLS < list.length; row++) {
      const chunk = list.slice(row * COLS, row * COLS + COLS);
      // Center each row; on wide ledges every other row shifts sideways, like a tumble.
      const nudge = list.length > COLS ? (row % 2 ? COL_W / 4 : -COL_W / 4) : 0;
      const left = SIDE + ((COLS - chunk.length) * COL_W) / 2 + nudge;
      chunk.forEach((c, i) => pos.set(c.id, { x: left + COL_W / 2 + i * COL_W, y: y + R + 4, depth: d }));
      y += ROW_H;
    }
  }
  return { pos, ledges, width, height: y + 30 };
}

/** Things Alice saw on the way down, drifting past the tunnel walls. */
function Clutter({ height, width }: { height: number; width: number }) {
  const glyphs = ["♥", "◷", "♠", "⚿", "♦", "☕", "♣", "♥"];
  const items = [];
  for (let i = 0, y = 130; y < height - 50; i++, y += 140) {
    const x = i % 2 === 0 ? SIDE / 2 + 2 : width - SIDE / 2 - 2;
    items.push(
      <text key={i} x={x} y={y} textAnchor="middle" className="rh-clutter" style={{ animationDelay: `${(i % 5) * -1.3}s`, transformOrigin: `${x}px ${y}px` }}>
        {glyphs[i % glyphs.length]}
      </text>,
    );
  }
  return <g aria-hidden="true">{items}</g>;
}

/** A small stable number from a string, so each pebble keeps its own shape between renders. */
function seed(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

/** A lumpy pebble of about radius r: a circle with a few soft bumps, smoothed with quadratic curves. */
function pebble(r: number, s: number) {
  const n = 12;
  const pts = Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2 + s * 6;
    const k = 1 + 0.2 * Math.sin(3 * t + s * 11) + 0.11 * Math.sin(5 * t + s * 23) + 0.05 * Math.sin(7 * t + s * 5);
    return [Math.cos(t) * r * k, Math.sin(t) * r * k];
  });
  const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(pts[n - 1], pts[0]);
  let d = `M${start[0].toFixed(2)} ${start[1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    d += ` Q${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)} ${m[0].toFixed(2)} ${m[1].toFixed(2)}`;
  }
  return d + "Z";
}

/** One earthen wall from the mouth to the bottom, with lumps of rock and roots. */
function wallPoints(x: number, top: number, bottom: number, dir: 1 | -1, salt: number) {
  const segs: { c: [number, number]; to: [number, number] }[] = [];
  let y = top;
  for (let i = 0; y < bottom; i++) {
    const ny = Math.min(bottom, y + 30 + ((i * 37 + salt) % 23));
    const bump = dir * (7 + ((i * 53 + salt) % 14));
    segs.push({ c: [x + bump, (y + ny) / 2], to: [x + dir * (((i * 29 + salt) % 9) - 4), ny] });
    y = ny;
  }
  return segs;
}

/** The tunnel's outline: down the left wall, across the bottom, back up the right wall. */
function tunnelPath(left: number, right: number, top: number, bottom: number) {
  const l = wallPoints(left, top, bottom, -1, 3);
  const r = wallPoints(right, top, bottom, 1, 11);
  const f = (n: number) => n.toFixed(1);
  let d = `M${left} ${top}`;
  for (const s of l) d += ` Q${f(s.c[0])} ${f(s.c[1])} ${f(s.to[0])} ${f(s.to[1])}`;
  d += ` L${f(r[r.length - 1].to[0])} ${bottom}`;
  for (let k = r.length - 1; k >= 0; k--) {
    const from = k > 0 ? r[k - 1].to : ([right, top] as [number, number]);
    d += ` Q${f(r[k].c[0])} ${f(r[k].c[1])} ${f(from[0])} ${f(from[1])}`;
  }
  return d + " Z";
}

const STATUS_FILL: Record<ConceptNode["status"], string> = {
  mastered: "var(--pebble-mastered)",
  available: "var(--pebble)",
  locked: "var(--pebble-locked)",
};

export function GraphView({ concepts, selected, onSelect }: { concepts: ConceptNode[]; selected: string | null; onSelect: (id: string) => void }) {
  const { pos, ledges, width, height } = useMemo(() => layout(concepts), [concepts]);
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const sel = concepts.find((c) => c.id === selected);
  const byId = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts]);
  const box = useRef<HTMLDivElement>(null);
  const related = useMemo(() => {
    if (!sel) return new Set<string>();
    const s = new Set<string>([sel.id, ...sel.prereqs]);
    concepts.forEach((c) => c.prereqs.includes(sel.id) && s.add(c.id));
    return s;
  }, [sel, concepts]);

  // Bring the selected topic into view inside the scroll box (it may be chosen from the side panel).
  useEffect(() => {
    const at = selected ? pos.get(selected) : undefined;
    const el = box.current;
    if (!at || !el) return;
    const svgLeft = (el.firstElementChild as HTMLElement | null)?.offsetLeft ?? 0;
    const x = svgLeft + at.x;
    const inX = x > el.scrollLeft + 60 && x < el.scrollLeft + el.clientWidth - 60;
    const inY = at.y > el.scrollTop + 30 && at.y < el.scrollTop + el.clientHeight - 60;
    if (inX && inY) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    el.scrollTo({ left: inX ? el.scrollLeft : x - el.clientWidth / 2, top: inY ? el.scrollTop : at.y - el.clientHeight / 2, behavior: reduce ? "auto" : "smooth" });
  }, [selected, pos]);

  const rx = width / 2 - SIDE + 22;
  const ry = MOUTH_H / 2 - 6;
  return (
    <div ref={box} className="graph-scroll rabbit-hole rounded-2xl" role="group" aria-label="Rabbit hole: your knowledge graph">
      <svg width={width} height={height} className="graph-svg">
        <title>Down the rabbit hole: the basics are at the top, and each ledge down builds on the ones above</title>
        <defs>
          <linearGradient id={`shaft-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="rh-stop-top" />
            <stop offset="100%" className="rh-stop-bottom" />
          </linearGradient>
          <linearGradient id={`walls-${gid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" className="rh-wall-dark" />
            <stop offset="14%" className="rh-wall-clear" />
            <stop offset="86%" className="rh-wall-clear" />
            <stop offset="100%" className="rh-wall-dark" />
          </linearGradient>
          <radialGradient id={`mouth-${gid}`} cx="50%" cy="45%" r="60%">
            <stop offset="0%" className="rh-mouth-in" />
            <stop offset="100%" className="rh-mouth-out" />
          </radialGradient>
        </defs>

        {/* the tunnel with wobbly earthen walls */}
        <path
          d={tunnelPath(SIDE - 16, width - SIDE + 16, MOUTH_H / 2, height)}
          fill={`url(#shaft-${gid})`}
          className="rh-shaft"
        />
        <rect x={SIDE - 30} y={MOUTH_H / 2} width={width - 2 * SIDE + 60} height={height - MOUTH_H / 2} fill={`url(#walls-${gid})`} aria-hidden="true" />
        {/* the mouth, ringed with grass */}
        <ellipse cx={width / 2} cy={MOUTH_H / 2} rx={rx} ry={ry} fill={`url(#mouth-${gid})`} className="rh-mouth" />
        <path
          d={Array.from({ length: 40 }, (_, i) => {
            const t = (i / 39) * Math.PI;
            const x = width / 2 - Math.cos(t) * rx;
            const y0 = MOUTH_H / 2 - Math.sin(t) * ry;
            return `M${x.toFixed(1)} ${y0.toFixed(1)} l${(i % 3) - 1} -${7 + (i % 4) * 2}`;
          }).join(" ")}
          className="rh-grass"
          aria-hidden="true"
        />
        <Clutter height={height} width={width} />

        {/* ledges */}
        {ledges.map((l) => (
          <g key={l.depth} aria-hidden="true">
            {l.depth > 0 && <line x1={SIDE + 4} x2={width - SIDE - 4} y1={l.y + 8} y2={l.y + 8} className="rh-ledge" />}
            <text x={width / 2} y={l.y + 30} textAnchor="middle" className="rh-ledge-label">
              {l.depth === 0 ? "" : `${l.depth} ${l.depth === 1 ? "step" : "steps"} down · `}
              {l.label}
            </text>
          </g>
        ))}

        {/* links: prerequisite (above) → what it unlocks (below) */}
        {concepts.flatMap((c) =>
          c.prereqs
            .filter((p) => pos.has(p))
            .map((p) => {
              const a = pos.get(p)!;
              const b = pos.get(c.id)!;
              const on = sel && (c.id === sel.id || p === sel.id);
              const cross = byId.get(p)?.subject !== c.subject;
              if (cross && !on) return null;
              const my = (a.y + b.y) / 2;
              return (
                <path
                  key={`${p}->${c.id}`}
                  d={`M${a.x} ${a.y + R + 38} C${a.x} ${my + 20}, ${b.x} ${my}, ${b.x} ${b.y - R - 4}`}
                  className={`graph-edge ${on ? "is-on" : sel ? "is-dim" : ""} ${c.practiceOnly ? "is-personal" : ""}`}
                />
              );
            }),
        )}

        {/* topics */}
        {concepts.map((c) => {
          const p = pos.get(c.id)!;
          const dim = sel && !related.has(c.id);
          const ring = LEVELS[c.proficiency ?? "new"]?.color ?? "var(--border)";
          const suit = c.practiceOnly ? "✦" : (SUIT[c.subject] ?? "♠");
          return (
            <g key={c.id} transform={`translate(${p.x} ${p.y})`}>
              <g
                className={`graph-node rh-fall ${selected === c.id ? "is-selected" : ""} ${dim ? "is-dim" : ""}`}
                style={{ animationDelay: `${p.depth * 180 + Math.round(p.x) % 7 * 25}ms` }}
                role="button"
                tabIndex={0}
                aria-label={`${c.title} (${c.subject}): ${c.status}${c.practiceOnly ? ", your own topic" : ""}`}
                aria-pressed={selected === c.id}
                onClick={() => onSelect(c.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(c.id))}
              >
                <path d={pebble(R + 4.5, seed(c.id))} fill="none" stroke={ring} strokeWidth="3" strokeDasharray={c.practiceOnly ? "4 3" : undefined} className="graph-ring" />
                <path d={pebble(R, seed(c.id))} fill={c.practiceOnly ? "var(--pebble-own)" : STATUS_FILL[c.status]} stroke={c.practiceOnly ? "var(--cheshire)" : "var(--pebble-edge)"} strokeWidth="1.5" className="rh-pebble" />
                {c.status === "locked" && <path d="M-4 1h8v5h-8zM-2.5 1v-2a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="var(--pebble-ink)" strokeWidth="1.3" />}
                {c.status === "mastered" && <path d="M-4.5 0.5l3 3 6-6.5" fill="none" stroke="var(--potion)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
                {c.status === "available" && (
                  <text y={4.5} textAnchor="middle" className={`rh-suit ${suit === "♥" || suit === "♦" ? "is-red" : ""} ${suit === "✦" ? "is-own" : ""}`}>
                    {suit}
                  </text>
                )}
                <text y={R + 20} textAnchor="middle" className="graph-label">
                  {c.title.length > 22 ? `${c.title.slice(0, 21)}…` : c.title}
                </text>
                <text y={R + 34} textAnchor="middle" className="graph-sublabel">
                  {c.practiceOnly ? "your own" : c.subject}
                </text>
                <title>{`${c.title} · ${c.subject}`}</title>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
