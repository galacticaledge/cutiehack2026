/**
 * Socra's logo: a name-plate sign with a branching tree of questions hanging from it.
 * Every branch is one guiding question leading to the next, like a path through the
 * Map of Wonderland. The Cheshire Cat remains the tutor's face; this is the app's mark.
 */

const C = {
  gold: "#e0b775",
  heart: "#c8314a",
  cat: "#8a5cc4",
  potion: "#2f8f86",
  sky: "#6aa6d6",
  rose: "#f2a6bd",
  tan: "#8d7350",
};

type Node = { id: string; x: number; y: number; r: number; fill: string; parent?: string; curve?: string };

// Hero layout (viewBox 0 0 360 300), shaped after the original sketch: an asymmetric tree.
const HERO: Node[] = [
  { id: "root", x: 180, y: 152, r: 12, fill: C.gold },
  { id: "l", x: 118, y: 208, r: 10.5, fill: C.heart, parent: "root", curve: "M180 152 C163 168 133 188 118 208" },
  { id: "r", x: 236, y: 196, r: 9.5, fill: C.cat, parent: "root", curve: "M180 152 C206 148 225 170 236 196" },
  { id: "ll", x: 72, y: 262, r: 9.5, fill: C.potion, parent: "l", curve: "M118 208 C104 226 86 244 72 262" },
  { id: "lr", x: 150, y: 268, r: 9, fill: C.sky, parent: "l", curve: "M118 208 C134 222 145 246 150 268" },
  { id: "rd", x: 232, y: 252, r: 10, fill: C.rose, parent: "r", curve: "M236 196 C234 214 233 234 232 252" },
  { id: "rr", x: 294, y: 228, r: 7.5, fill: C.gold, parent: "r", curve: "M236 196 C260 198 282 208 294 228" },
];
// The path a learner "lights up" in the idle animation.
const LIT = ["root", "l", "ll"];

function NodeDot({ n, i, lit }: { n: Node; i: number; lit: boolean }) {
  return (
    <g className="logo-node" style={{ animationDelay: `${0.55 + i * 0.12}s`, transformOrigin: `${n.x}px ${n.y}px` }}>
      {lit && <circle className="logo-glow" cx={n.x} cy={n.y} r={n.r + 7} fill={C.gold} style={{ animationDelay: `${2.2 + LIT.indexOf(n.id) * 0.45}s` }} />}
      <circle cx={n.x} cy={n.y} r={n.r} fill={n.fill} stroke="currentColor" strokeWidth="2.6" />
      <circle cx={n.x - n.r * 0.32} cy={n.y - n.r * 0.34} r={n.r * 0.32} fill="#fff" opacity=".55" />
    </g>
  );
}

/** Full logo for the landing page: the sign carries the wordmark. */
export function SocraLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 300" className={`socra-logo text-[var(--night)] dark:text-[#e6dcf5] ${className}`} role="img" aria-label="Socra">
      {/* the sign */}
      <g className="logo-sign">
        <rect x="58" y="10" width="244" height="88" rx="24" fill="#faf8f1" stroke={C.tan} strokeWidth="3" />
        <rect x="67" y="19" width="226" height="70" rx="17" fill="none" stroke={C.tan} strokeOpacity=".35" strokeWidth="1.5" />
        <text x="180" y="72" textAnchor="middle" fontSize="54" fill="#334356" fontFamily='"IM Fell English", Georgia, serif'>
          Socra
        </text>
        <path d="M86 54h10M264 54h10" stroke={C.tan} strokeOpacity=".5" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="180" cy="102" r="4.5" fill="none" stroke={C.tan} strokeWidth="2.2" />
      </g>
      {/* the chain down to the first question */}
      <path className="logo-branch" d="M180 107 L180 140" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" fill="none" strokeDasharray="2 5" />
      {/* branches */}
      {HERO.filter((n) => n.curve).map((n, i) => (
        <path
          key={n.id}
          className="logo-branch"
          d={n.curve}
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
          pathLength={100}
          style={{ animationDelay: `${0.25 + i * 0.1}s` }}
        />
      ))}
      {/* nodes */}
      {HERO.map((n, i) => (
        <NodeDot key={n.id} n={n} i={i} lit={LIT.includes(n.id)} />
      ))}
    </svg>
  );
}

/** Compact mark for the header and the browser tab. */
export function SocraMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect x="9" y="3" width="30" height="10" rx="3.5" fill="#faf8f1" stroke={C.gold} strokeWidth="1.8" />
      <path d="M24 13v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="1 2" />
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none">
        <path d="M24 21C21 24 17 27 15 30" />
        <path d="M24 21C29 21 32 24 33 28" />
        <path d="M15 30C13 34 11 37 9 40" />
        <path d="M15 30C17 33 19 37 19.5 41" />
        <path d="M33 28L32.5 39.5" />
        <path d="M33 28C37 28.5 40 31 41 34" />
      </g>
      {[
        [24, 21, 3.6, C.gold],
        [15, 30, 3.1, C.heart],
        [33, 28, 2.9, C.cat],
        [9, 40.5, 2.8, C.potion],
        [19.5, 41.5, 2.7, C.sky],
        [32.5, 40, 3, C.rose],
        [41, 34.5, 2.3, C.gold],
      ].map(([x, y, r, fill], i) => (
        <circle key={i} cx={x as number} cy={y as number} r={r as number} fill={fill as string} stroke="currentColor" strokeWidth="1.4" />
      ))}
    </svg>
  );
}
