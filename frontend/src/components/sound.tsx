import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { play, setSfxEnabled, sfxEnabled } from "@/lib/sfx";

/* ---------------- Sound toggle ---------------- */

export function SoundToggle({ className = "" }: { className?: string }) {
  const [on, setOn] = useState(sfxEnabled);
  useEffect(() => {
    const sync = () => setOn(sfxEnabled());
    window.addEventListener("socra:sfx", sync);
    return () => window.removeEventListener("socra:sfx", sync);
  }, []);
  return (
    <button
      type="button"
      onClick={() => {
        setSfxEnabled(!on);
        if (!on) setTimeout(() => play("clink"), 0);
      }}
      className={`flex size-8 items-center justify-center rounded-full transition hover:bg-white/10 ${className}`}
      aria-label={on ? "Turn sound effects off" : "Turn sound effects on"}
      aria-pressed={on}
      title={on ? "Sound effects on" : "Sound effects off"}
    >
      {on ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
    </button>
  );
}
