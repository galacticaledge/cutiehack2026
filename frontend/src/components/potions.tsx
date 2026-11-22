import { useEffect, useId, useRef, useState } from "react";

const LIQUIDS = ["#5cc2b8", "#b78cf0", "#f0647a"];

function Bottle({ full, color, gulp }: { full: boolean; color: string; gulp: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 28 44" className={`potion text-[#334356] dark:text-[#d6ecf7] ${gulp ? "potion-gulp" : ""} ${full ? "" : "potion-empty"}`} aria-hidden="true">
      <defs>
        <clipPath id={`body-${id}`}>
          <path d="M10 13h8v5c4.5 2 7 5.5 7 10.5C25 36 20 41 14 41S3 36 3 28.5C3 23.5 5.5 20 10 18z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#body-${id})`}>
        <rect className="potion-liquid" x="0" y="20" width="28" height="24" fill={color} style={{ transform: full ? "translateY(0)" : "translateY(24px)" }} />
        <rect className="potion-liquid" x="0" y="19" width="28" height="2.4" fill="#fff" opacity=".35" style={{ transform: full ? "translateY(0)" : "translateY(26px)" }} />
      </g>
      <path d="M10 13h8v5c4.5 2 7 5.5 7 10.5C25 36 20 41 14 41S3 36 3 28.5C3 23.5 5.5 20 10 18z" fill="#ffffff" fillOpacity=".18" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6.5 25c.5-2 1.6-3.4 3-4.3" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" opacity=".8" />
      <rect x="7" y="27" width="14" height="7" rx="1" fill="#faf8f1" stroke="#8d7350" strokeWidth=".6" />
      <path d="M9 30.5h10" stroke="#8d7350" strokeWidth=".8" strokeDasharray="1.4 .8" />
      <rect className="potion-cork" x="9.5" y="6" width="9" height="7.5" rx="1.5" fill="#c9a26b" stroke="#7a5a2e" strokeWidth="1" />
    </svg>
  );
}

export function DrinkMeBottles({ drunk }: { drunk: number }) {
  const prev = useRef(drunk);
  const [gulping, setGulping] = useState<number | null>(null);
  useEffect(() => {
    if (drunk > prev.current) {
      setGulping(drunk - 1);
      const t = setTimeout(() => setGulping(null), 900);
      prev.current = drunk;
      return () => clearTimeout(t);
    }
    prev.current = drunk;
  }, [drunk]);
  return (
    <span className="flex items-end gap-1" role="img" aria-label={`${3 - Math.min(3, drunk)} of 3 Drink Me bottles left`}>
      {LIQUIDS.map((c, i) => (
        <Bottle key={i} full={i >= drunk} color={c} gulp={gulping === i} />
      ))}
    </span>
  );
}
