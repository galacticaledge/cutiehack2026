
const KEY = "socra:sfx";
export type Sound = "clink" | "pop" | "gavel" | "chime" | "boing";

let ctx: AudioContext | null = null;

export function sfxEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setSfxEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("socra:sfx"));
}

function audio(): AudioContext | null {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(a: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain: number, endFreq?: number) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(a.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

export function play(sound: Sound) {
  if (!sfxEnabled()) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  switch (sound) {
    case "clink":
      tone(a, 2093, t, 0.25, "sine", 0.12);
      tone(a, 3136, t + 0.06, 0.3, "sine", 0.08);
      break;
    case "pop":
      tone(a, 600, t, 0.12, "triangle", 0.2, 120);
      break;
    case "gavel":
      tone(a, 140, t, 0.12, "square", 0.08, 70);
      tone(a, 140, t + 0.18, 0.14, "square", 0.08, 60);
      break;
    case "chime":
      [523, 659, 784, 1047].forEach((f, i) => tone(a, f, t + i * 0.09, 0.45, "sine", 0.1));
      break;
    case "boing":
      tone(a, 220, t, 0.3, "sine", 0.12, 110);
      break;
  }
}
