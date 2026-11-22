
export type DoorState = "idle" | "rattle" | "open";

function DoorPanelSvg({ wood = "#8d6a43", trim = "#5f4a2c", locked = false }: { wood?: string; trim?: string; locked?: boolean }) {
  return (
    <svg viewBox="0 0 40 52" className="size-full" aria-hidden="true">
      <path d="M2 51V20a18 18 0 0 1 36 0v31z" fill={wood} stroke={trim} strokeWidth="2" />
      <path d="M8 46V22a12 12 0 0 1 24 0v24z" fill="none" stroke={trim} strokeOpacity=".45" strokeWidth="1.4" />
      <path d="M20 10v36" stroke={trim} strokeOpacity=".3" strokeWidth="1" />
      <circle cx="30" cy="31" r="2.2" fill="#e0b775" stroke={trim} strokeWidth=".8" />
      {locked ? (
        <g>
          <rect x="15" y="29" width="10" height="8" rx="1.5" fill="#e0b775" stroke={trim} strokeWidth=".8" />
          <path d="M17 29v-2.5a3 3 0 0 1 6 0V29" fill="none" stroke="#e0b775" strokeWidth="1.6" />
        </g>
      ) : (
        <path d="M20 29.5a2 2 0 0 1 1.2 3.6l.8 4h-4l.8-4A2 2 0 0 1 20 29.5z" fill="#241a10" />
      )}
    </svg>
  );
}

export function AnswerDoor({ state, locked = false }: { state: DoorState; locked?: boolean }) {
  return (
    <div className={`answer-door door-${state} ${locked ? "door-locked" : ""}`} aria-hidden="true">
      <div className="door-frame" />
      <div className="door-light" />
      <div className="door-panel">
        <DoorPanelSvg locked={locked} />
      </div>
    </div>
  );
}

export type Emblem = "watch" | "hat" | "mushroom" | "hole" | "crown";

const DOOR_COLORS: Record<Emblem, { wood: string; trim: string; glow: string }> = {
  watch: { wood: "#c9a26b", trim: "#7a5a2e", glow: "#fbe7b5" },
  hat: { wood: "#7d8fb0", trim: "#3f4d6a", glow: "#e2ecff" },
  mushroom: { wood: "#8fae7c", trim: "#4d6a3e", glow: "#eef8d9" },
  hole: { wood: "#6b5a7e", trim: "#3d3050", glow: "#e8dcff" },
  crown: { wood: "#b5485c", trim: "#6d2433", glow: "#ffd9df" },
};

function EmblemSvg({ emblem }: { emblem: Emblem }) {
  switch (emblem) {
    case "watch":
      return (
        <g>
          <path d="M50 22c-4-9 4-14 10-10" fill="none" stroke="#e0b775" strokeWidth="2" strokeDasharray="2 2" />
          <circle cx="50" cy="40" r="15" fill="#f3d18a" stroke="#7a5a2e" strokeWidth="2.5" />
          <circle cx="50" cy="40" r="11.5" fill="#fffaf1" />
          <circle cx="50" cy="25" r="2.6" fill="none" stroke="#7a5a2e" strokeWidth="2" />
          <path d="M50 40V32M50 40l5 3" stroke="#334356" strokeWidth="2" strokeLinecap="round" />
          {[0, 90, 180, 270].map((a) => (
            <path key={a} d="M50 29.5v2" stroke="#334356" strokeWidth="1.4" transform={`rotate(${a} 50 40)`} />
          ))}
        </g>
      );
    case "hat":
      return (
        <g>
          <ellipse cx="50" cy="52" rx="20" ry="4.5" fill="#334356" />
          <path d="M37 52l3-27h20l3 27z" fill="#3f4d6a" stroke="#22304a" strokeWidth="1.5" />
          <path d="M38.6 44h22.8l.7 6H37.9z" fill="#c8314a" />
          <rect x="52" y="35" width="9" height="7" rx="1" fill="#fffaf1" transform="rotate(-8 56 38)" />
          <text x="56.5" y="40.6" fontSize="4.2" textAnchor="middle" fill="#334356" transform="rotate(-8 56 38)" fontFamily="serif">10/6</text>
        </g>
      );
    case "mushroom":
      return (
        <g>
          <path d="M45 40h10l2 16H43z" fill="#f4ead3" stroke="#8d7350" strokeWidth="1.5" />
          <path d="M28 41c0-14 10-21 22-21s22 7 22 21z" fill="#c8314a" stroke="#7a1f35" strokeWidth="1.8" />
          <circle cx="40" cy="31" r="3" fill="#fffaf1" />
          <circle cx="54" cy="27" r="2.5" fill="#fffaf1" />
          <circle cx="62" cy="35" r="2.2" fill="#fffaf1" />
          <g fill="#5cb85c">
            <circle cx="41" cy="18" r="2.6" />
            <circle cx="45.5" cy="16" r="2.8" />
            <circle cx="50" cy="15.5" r="3" />
          </g>
          <circle cx="51.5" cy="14.6" r=".8" fill="#334356" />
        </g>
      );
    case "hole":
      return (
        <g>
          <ellipse cx="50" cy="48" rx="20" ry="7" fill="#1d2633" stroke="#5a7a3e" strokeWidth="2.5" />
          <path d="M44 34c-3-10-1-18 2-18s3 9 2 18M54 34c1-9 1-18 4-18s3 8 0 18" fill="#fffaf1" stroke="#8d7350" strokeWidth="1.3" />
          <path d="M45.3 30c-1-5-.5-10 .7-10M55.5 30c.7-5 1.2-10 2-10" stroke="#f2b8c6" strokeWidth="1.3" />
          <ellipse cx="50" cy="40" rx="8" ry="6.5" fill="#fffaf1" stroke="#8d7350" strokeWidth="1.3" />
          <circle cx="47" cy="39" r="1" fill="#334356" />
          <circle cx="53" cy="39" r="1" fill="#334356" />
        </g>
      );
    case "crown":
      return (
        <g>
          <path d="M32 50l-3-20 10 9 11-15 11 15 10-9-3 20z" fill="#e0b775" stroke="#8d6a20" strokeWidth="2" strokeLinejoin="round" />
          <rect x="32" y="50" width="36" height="6" rx="1.5" fill="#c9962b" stroke="#8d6a20" strokeWidth="1.5" />
          <path d="M50 39.5c-1.3-1.8-4.3-.9-3.8 1.4.4 1.4 3.8 3.6 3.8 3.6s3.4-2.2 3.8-3.6c.5-2.3-2.5-3.2-3.8-1.4z" fill="#c8314a" />
          <circle cx="29" cy="30" r="2" fill="#c8314a" />
          <circle cx="50" cy="24" r="2" fill="#c8314a" />
          <circle cx="71" cy="30" r="2" fill="#c8314a" />
        </g>
      );
  }
}

export function DoorArt({ emblem, open = false }: { emblem: Emblem; open?: boolean }) {
  const c = DOOR_COLORS[emblem];
  return (
    <div className={`door-art ${open ? "is-open" : ""}`} aria-hidden="true">
      <div className="door-art-light" style={{ background: `radial-gradient(ellipse at 50% 60%, #fffaf1 0%, ${c.glow} 45%, #e0b775 100%)` }} />
      <div className="door-art-panel">
        <svg viewBox="0 0 100 120" className="size-full">
          <path d="M6 118V48a44 44 0 0 1 88 0v70z" fill={c.wood} stroke={c.trim} strokeWidth="3" />
          <path d="M14 112V50a36 36 0 0 1 72 0v62z" fill="none" stroke={c.trim} strokeOpacity=".35" strokeWidth="2" />
          <path d="M14 78h72" stroke={c.trim} strokeOpacity=".25" strokeWidth="1.5" />
          <g transform="translate(0 6)">
            <EmblemSvg emblem={emblem} />
          </g>
          <circle cx="78" cy="92" r="4" fill="#e0b775" stroke={c.trim} strokeWidth="1.5" />
          <path d="M50 88a3 3 0 0 1 1.8 5.4l1.2 5.6h-6l1.2-5.6A3 3 0 0 1 50 88z" fill="#241a10" opacity=".75" />
        </svg>
      </div>
    </div>
  );
}
