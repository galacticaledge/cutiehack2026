import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";

/**
 * Judge mode: a presenter panel for the 3-minute pitch. Hidden unless opened with
 * `?judge` in the URL or Shift+J. It never shows answers (they stay on the server);
 * it only sets up the demo moments and keeps time.
 */
const KEY = "socra:judge";
const PITCH_SECONDS = 180;

const MOMENTS: { title: string; say: string }[] = [
  {
    title: "1 · The hook",
    say: "AI tutors hand students the answer. UC Irvine research found slow, Socratic tutoring helps students learn more, but students reach for fast tools anyway. Socra makes the slow path the one that pays.",
  },
  {
    title: "2 · The refusal",
    say: "Ask the Cat for the answer. It refuses and asks a guiding question. State a wrong step: ✗ and the Cat points at it. Fix it: ✓. Every step is checked by a math engine, not the AI.",
  },
  {
    title: "3 · The payout",
    say: "Solve it, testify why it works at the trial, and TARTS land in a Solana devnet wallet with a public receipt. Fewer hints and wrong turns, more tarts.",
  },
  {
    title: "4 · The catch",
    say: "A copycat pastes an answer instantly: flagged. Weak testimony: off with the tarts. Everyone gets different numbers, and you have to explain it. Copying doesn't pay.",
  },
];

function readEnabled() {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
function writeEnabled(on: boolean) {
  try {
    sessionStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Ask the problem page to put text in the chat box (it isn't sent; the presenter presses Enter). */
export function prefillChat(text: string) {
  window.dispatchEvent(new CustomEvent("socra:prefill-chat", { detail: text }));
}

export function PresenterPanel() {
  const location = useLocation();
  const navigate = useNavigate();
  const [on, setOn] = useState(readEnabled);
  const [open, setOpen] = useState(true);
  const [moment, setMoment] = useState(0);
  const [left, setLeft] = useState(PITCH_SECONDS);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ?judge in the URL turns it on (and ?judge=0 off) for this browser tab.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.has("judge")) {
      const enable = q.get("judge") !== "0";
      setOn(enable);
      writeEnabled(enable);
    }
  }, [location.search]);

  // Shift+J toggles it (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.shiftKey && (e.key === "J" || e.key === "j")) {
        setOn((v) => {
          writeEnabled(!v);
          return !v;
        });
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [running]);
  useEffect(() => {
    if (left === 0) setRunning(false);
  }, [left]);

  if (!on) return null;

  async function freshDoor(prefix: string, templateId: string, key: string) {
    setBusy(key);
    try {
      await api("/api/auth/login", { username: `${prefix}-${Math.random().toString(36).slice(2, 7)}` });
      try {
        localStorage.setItem("socra:toured", "1"); // no tour popping up mid-pitch
      } catch {
        /* ignore */
      }
      const { sessionId } = await api<{ sessionId: string }>("/api/sessions", { templateId });
      navigate(`/learn/${sessionId}`);
      window.dispatchEvent(new Event("socra:balance"));
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  const onProblem = /^\/learn\/[^/]+$/.test(location.pathname);

  if (!open) {
    return (
      <button type="button" className="presenter-tab" onClick={() => setOpen(true)} aria-label="Open judge mode panel">
        Judge mode · {mm}:{ss}
      </button>
    );
  }

  return (
    <aside className="presenter parchment" aria-label="Judge mode presenter panel">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--tan)]">Judge mode</p>
        <div className="flex gap-1">
          <button type="button" className="presenter-btn" onClick={() => setOpen(false)} aria-label="Minimise">
            –
          </button>
          <button
            type="button"
            className="presenter-btn"
            onClick={() => {
              setOn(false);
              writeEnabled(false);
            }}
            aria-label="Close judge mode"
          >
            ×
          </button>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <span className={`font-display text-3xl tabular-nums ${left <= 30 ? "text-[var(--heart)]" : ""}`} aria-live="off">
          {mm}:{ss}
        </span>
        <div className="flex gap-1">
          <button type="button" className="presenter-btn" onClick={() => setRunning((r) => !r)} disabled={left === 0}>
            {running ? "Pause" : left === PITCH_SECONDS ? "Start" : "Resume"}
          </button>
          <button
            type="button"
            className="presenter-btn"
            onClick={() => {
              setRunning(false);
              setLeft(PITCH_SECONDS);
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="mt-2 flex gap-1" role="tablist" aria-label="Demo moments">
        {MOMENTS.map((m, i) => (
          <button
            key={m.title}
            type="button"
            role="tab"
            aria-selected={moment === i}
            onClick={() => setMoment(i)}
            className={`presenter-step ${moment === i ? "is-active" : ""}`}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <p className="mt-2 font-display text-lg leading-tight">{MOMENTS[moment].title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{MOMENTS[moment].say}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {moment === 1 && (
          <>
            <button type="button" className="presenter-btn" disabled={busy !== null} onClick={() => freshDoor("guest", "cs-trace-loop-1", "refusal")}>
              {busy === "refusal" ? "Opening…" : "Fresh guest → Mad Hatter"}
            </button>
            <button type="button" className="presenter-btn" disabled={!onProblem} onClick={() => prefillChat("Just give me the answer, please.")} title={onProblem ? "" : "Open a problem first"}>
              Type “just give me the answer”
            </button>
          </>
        )}
        {moment === 2 && (
          <button type="button" className="presenter-btn" onClick={() => navigate("/journal")}>
            Show the dream journal
          </button>
        )}
        {moment === 3 && (
          <button type="button" className="presenter-btn" disabled={busy !== null} onClick={() => freshDoor("copycat", "alg-linear-1", "catch")}>
            {busy === "catch" ? "Opening…" : "Fresh copycat → White Rabbit"}
          </button>
        )}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">Shift+J hides this panel. Answers are never shown here; they stay on the server.</p>
    </aside>
  );
}
