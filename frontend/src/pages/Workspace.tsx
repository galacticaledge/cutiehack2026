import { BoxSelect, Check, ExternalLink, FlaskConical, KeyRound, MessageCircle, ScrollText, Send, Sparkles, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Header } from "@/components/header";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { celebrate, CheshireAppearing, CheshireGrin, flavorFor, type CatMood } from "@/components/wonder";
import { FallingIntro, hasToured, heartsBurst, isTypingTarget, RabbitTour, ShareDreamButton, ShortcutsDialog, type TourStep } from "@/components/extras";
import { play } from "@/lib/sfx";
import { AnswerDoor, type DoorState } from "@/components/doors";
import { DrinkMeBottles } from "@/components/potions";
import { AnswerPreview, MathKeys } from "@/components/mathpad";
import { TypedMarkdown } from "@/components/typed";
import { LostInWonderland, WorkspaceSkeleton } from "@/components/skeletons";
import { PocketWatch, ShrinkingTart } from "@/components/scenery";
import { DreamMap } from "@/components/guides";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError, postEvent, refreshBalance, type ChatMessage, type Features, type RewardView, type SessionView } from "@/lib/api";

const HINT_COST = ["−25%", "−33%", "−40%"];

const TOUR: TourStep[] = [
  { target: "problem", title: "Your dream", body: "This is your problem. The numbers are yours alone, so nobody can hand you the answer." },
  { target: "chat", title: "The Cheshire Cat", body: "Talk it through here. The Cat answers with questions and never gives the answer away. Chatting is always free." },
  { target: "hint", title: "Drink Me bottles", body: "Stuck? Each bottle is a hint, but it shrinks your tart." },
  { target: "answer", title: "Try the door", body: "When you're sure, enter your final answer. Wrong turns shrink the tart a little." },
  { target: "map", title: "Your dream map", body: "Follow each step the math engine confirms. Solve it, testify at the trial, and wake up with tarts." },
];

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

const ASKS_FOR_ANSWER = /\b(answer|tell me|give me|just say|solution|solve it for me|what is it)\b/i;

function showRewardToast(r: RewardView) {
  if (r.status === "paid" && r.amount > 0) {
    celebrate();
    play("chime");
    toast.success(`+${r.amount} TARTS · You woke up!`, {
      description: r.breakdown,
      duration: 15000,
      action: r.explorerUrl ? { label: "View on Solana Explorer ↗", onClick: () => window.open(r.explorerUrl!, "_blank", "noopener") } : undefined,
    });
  } else if (r.status === "paid") {
    toast(`No tarts this time`, { description: r.breakdown });
  } else if (r.status === "failed") {
    toast.error("The tarts got lost on the way", { description: "Your reward is saved. Press “Retry payout”." });
  } else if (r.status === "forfeited") {
    toast.error("Off with their tarts!", { description: "This solve was suspicious and the testimony didn't show understanding." });
  } else if (r.status === "practice") {
    const capped = r.breakdown.includes("daily cap");
    toast(capped ? "The Queen's treasury is closed for today" : "Unbirthday practice: no tarts", { description: r.breakdown });
  }
}

async function playTts(body: Record<string, unknown>) {
  const res = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    toast.error("Read-aloud is unavailable right now.");
    return;
  }
  const url = URL.createObjectURL(await res.blob());
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  await audio.play();
}

export function Workspace() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const [s, setS] = useState<SessionView | null>(null);
  const [loadError, setLoadError] = useState<"missing" | "failed" | null>(null);
  const [features, setFeatures] = useState<Features | null>(null);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [hinting, setHinting] = useState(false);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [explainText, setExplainText] = useState("");
  const [explaining, setExplaining] = useState(false);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [links, setLinks] = useState<{ title: string; url: string; domain: string }[]>([]);
  const chatEnd = useRef<HTMLDivElement>(null);
  const chatInput = useRef<HTMLTextAreaElement>(null);
  const answerInput = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const [intro, setIntro] = useState(() => Boolean((location.state as { fresh?: boolean } | null)?.fresh));
  const [tourOpen, setTourOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [reaction, setReaction] = useState<CatMood | null>(null);
  // Phones show one panel at a time: the problem or the chat.
  const [mobileTab, setMobileTab] = useState<"problem" | "chat">("problem");
  const [unread, setUnread] = useState(false);
  const tabRef = useRef(mobileTab);
  tabRef.current = mobileTab;
  const showTab = useCallback((t: "problem" | "chat") => {
    setMobileTab(t);
    if (t === "chat") setUnread(false);
  }, []);
  const tutorCount = useRef<number | null>(null);
  // Messages already on screen don't animate; a new one keeps its fade-in class for its
  // first 700ms, so an unrelated re-render can't cut the animation short.
  const firstSeen = useRef<Map<string, number>>(new Map());
  const seenSession = useRef("");
  const [doorState, setDoorState] = useState<DoorState>("idle");
  const doorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (doorTimer.current) clearTimeout(doorTimer.current);
  }, []);
  const endIntro = useCallback(() => setIntro(false), []);
  // Keep the newest words in view while the Cat is "typing".
  const followChat = useCallback(() => chatEnd.current?.scrollIntoView({ block: "end" }), []);

  // Judge mode can put a line in the chat box for the presenter (it isn't sent automatically).
  useEffect(() => {
    const onPrefill = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (typeof text !== "string") return;
      setMsg(text);
      showTab("chat");
      setTimeout(() => chatInput.current?.focus(), 0);
    };
    window.addEventListener("socra:prefill-chat", onPrefill);
    return () => window.removeEventListener("socra:prefill-chat", onPrefill);
  }, [showTab]);

  // The chat box grows with the message (up to ~6 lines, then scrolls) and shrinks back after sending.
  const CHAT_MAX_PX = 160;
  const fitChat = useCallback(() => {
    const el = chatInput.current;
    if (!el) return;
    el.style.height = "auto";
    const h = Math.min(el.scrollHeight + 2, CHAT_MAX_PX);
    el.style.height = `${h}px`;
    el.style.overflowY = el.scrollHeight + 2 > CHAT_MAX_PX ? "auto" : "hidden";
  }, []);
  useLayoutEffect(fitChat, [msg, mobileTab, fitChat]);
  useEffect(() => {
    window.addEventListener("resize", fitChat);
    return () => window.removeEventListener("resize", fitChat);
  }, [fitChat]);

  // Play the falling intro once per fresh door, then clear the flag so a reload doesn't replay it.
  useEffect(() => {
    if ((location.state as { fresh?: boolean } | null)?.fresh) {
      setIntro(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    try {
      const v = await api<SessionView>(`/api/sessions/${sessionId}`);
      setS(v);
      setLoadError(null);
      return v;
    } catch (e) {
      // First load failing: show a clear message instead of placeholders forever.
      setLoadError((prev) => prev ?? ((e as ApiError).status === 404 ? "missing" : "failed"));
      toast.error((e as Error).message);
      return null;
    }
  }, [sessionId]);

  useEffect(() => {
    setS(null);
    setLoadError(null);
    setLinks([]);
    setReaction(null);
    void load();
    api<Features>("/api/features").then(setFeatures).catch(() => {});
  }, [load]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [s?.messages.length, mobileTab]);

  // A new Cat reply while the phone is showing the problem lights up the Chat tab.
  const tutorMsgs = s?.messages.filter((m) => m.role === "tutor").length ?? null;
  useEffect(() => {
    if (tutorMsgs === null) return;
    const phone = window.matchMedia?.("(max-width: 1023px)").matches ?? false;
    if (phone && tutorCount.current !== null && tutorMsgs > tutorCount.current && tabRef.current === "problem") setUnread(true);
    tutorCount.current = tutorMsgs;
  }, [tutorMsgs]);
  useEffect(() => {
    tutorCount.current = null;
    setDoorState("idle");
    setMobileTab("problem");
    setUnread(false);
  }, [sessionId]);

  // Anti-cheat telemetry (bank problems only, while active).
  const tracking = (s?.source === "bank" || s?.source === "quest") && s.status === "active";
  useEffect(() => {
    if (!tracking) return;
    const onVis = () => postEvent(sessionId, document.visibilityState === "hidden" ? "hidden" : "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [tracking, sessionId]);

  // First visit: the White Rabbit's tour (after the falling intro, once the page has loaded).
  const loaded = s !== null;
  useEffect(() => {
    if (!loaded || intro || hasToured()) return;
    const t = setTimeout(() => setTourOpen(true), 400);
    return () => clearTimeout(t);
  }, [loaded, intro]);

  // Keyboard shortcuts (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || tourOpen) return;
      if (isTypingTarget(e.target)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "/" || k === "c") {
        e.preventDefault();
        showTab("chat");
        setTimeout(() => chatInput.current?.focus(), 0);
      } else if (k === "a") {
        e.preventDefault();
        showTab("problem");
        setTimeout(() => answerInput.current?.focus(), 0);
      } else if (k === "h") {
        document.querySelector<HTMLButtonElement>('[data-tour="hint"]')?.click();
      } else if (k === "t") {
        setTourOpen(true);
      } else if (e.key === "?") {
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tourOpen, showTab]);

  // Go deeper links after a solve.
  useEffect(() => {
    if (!features?.learnMore || !s || s.source !== "bank" || s.status === "active") return;
    api<{ links: typeof links }>(`/api/sessions/${sessionId}/resources`)
      .then((r) => setLinks(r.links))
      .catch(() => setLinks([]));
  }, [features?.learnMore, s?.status, s?.source, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) {
    return (
      <>
        <Header />
        {loadError ? (
          <LostInWonderland
            title={loadError === "missing" ? "This dream has vanished" : "The rabbit hole is blocked"}
            body={loadError === "missing" ? "We couldn't find this problem. It may belong to someone else, or the link is wrong." : "We couldn't reach the server. Check your connection and try again."}
            action={
              <>
                {loadError === "failed" && <Button onClick={() => { setLoadError(null); void load(); }}>Try again</Button>}
                <Button variant="outline" onClick={() => navigate("/learn")}>Back to the Hall of Doors</Button>
              </>
            }
          />
        ) : (
          <WorkspaceSkeleton />
        )}
      </>
    );
  }

  if (seenSession.current !== s.id) {
    seenSession.current = s.id;
    firstSeen.current = new Map(s.messages.map((m) => [m.id, 0]));
  }
  const now = Date.now();
  const isFresh = (id: string) => {
    if (!firstSeen.current.has(id)) firstSeen.current.set(id, now);
    return now - (firstSeen.current.get(id) ?? 0) < 700;
  };
  const isBank = s.source === "bank";
  // Quest: a fresh, verified problem generated for a knowledge-map topic (earns like a bank problem, no hints).
  const isQuest = s.source === "quest";
  const earns = isBank || isQuest;
  const sandboxChecked = isQuest && s.checkedBy === "sandbox";
  const flavor = flavorFor(s.templateId);
  // The Cheshire Cat appears a little more with every step the math engine confirms.
  const correctSteps = new Set(s.messages.flatMap((m) => m.verdicts.filter((v) => v.status === "correct").map((v) => v.label)));
  const totalSteps = (s.checkpointCount ?? 0) + 1; // + the final answer
  const shownSteps = s.status === "active" ? Math.min(correctSteps.size, s.checkpointCount ?? 0) : totalSteps;
  const catOpacity = isBank && totalSteps > 1 ? 0.3 + 0.7 * (shownSteps / totalSteps) : 1;
  const maxReward = 100 * s.difficulty;
  // The Cat's expression reacts to the last thing that happened.
  const lastUser = [...s.messages].reverse().find((m) => m.role === "user");
  const derivedMood: CatMood =
    s.status !== "active"
      ? "delighted"
      : lastUser?.verdicts.some((v) => v.status === "incorrect")
        ? "puzzled"
        : lastUser?.verdicts.some((v) => v.status === "correct")
          ? "delighted"
          : lastUser && ASKS_FOR_ANSWER.test(lastUser.content)
            ? "secretive"
            : "neutral";
  const mood: CatMood = reaction ?? derivedMood;
  const lastTutorId = [...s.messages].reverse().find((m) => m.role === "tutor")?.id;

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const text = msg.trim();
    if (!text || sending || !s) return;
    setSending(true);
    setReaction(null);
    setMsg("");
    const tempId = `pending-${Date.now()}`;
    setS({ ...s, messages: [...s.messages, { id: tempId, role: "user", content: text, verdicts: [], pending: true }] });
    try {
      const r = await api<{ reply: string; messageId: string; userMessageId: string; verdicts: ChatMessage["verdicts"] }>(`/api/sessions/${sessionId}/chat`, { message: text });
      firstSeen.current.set(r.userMessageId, 0); // the student's bubble is already showing; only the reply should fade in
      if (r.verdicts.some((v) => v.status === "incorrect")) play("boing");
      else if (r.verdicts.some((v) => v.status === "correct")) play("clink");
      setS((prev) =>
        prev && {
          ...prev,
          messages: [
            ...prev.messages.map((m) => (m.id === tempId ? { ...m, id: r.userMessageId, verdicts: r.verdicts, pending: false } : m)),
            { id: r.messageId, role: "tutor", content: r.reply, verdicts: [] },
          ],
        },
      );
    } catch (err) {
      toast.error((err as Error).message);
      setMsg(text); // nothing was saved, so give the student their words back
      await load();
    } finally {
      setSending(false);
    }
  }

  async function takeHint() {
    setHinting(true);
    try {
      await api(`/api/sessions/${sessionId}/hint`, {});
      play("pop");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setHinting(false);
    }
  }

  /** Math keys insert at the cursor (keeping the 40-character limit) and put the cursor where it's useful. */
  function insertIntoAnswer(text: string, caret = text.length) {
    const el = answerInput.current;
    const start = el?.selectionStart ?? answer.length;
    const end = el?.selectionEnd ?? answer.length;
    const next = answer.slice(0, start) + text + answer.slice(end);
    if (next.length > 40) return;
    // Commit the new value and place the cursor in the same tick, so a key typed
    // right after tapping a math key lands at the cursor, not at the end.
    flushSync(() => setAnswer(next));
    el?.focus();
    el?.setSelectionRange(start + caret, start + caret);
  }

  async function submitAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    setSubmitting(true);
    try {
      const r = await api<{ correct: boolean; flagged?: boolean; practice?: boolean }>(`/api/sessions/${sessionId}/answer`, { answer });
      if (r.correct) {
        play("clink");
        setReaction("delighted");
        setDoorState("open");
        if (earns) {
          setFlagged(Boolean(r.flagged));
          // Let the little door swing open before the trial begins.
          await new Promise((res) => setTimeout(res, reducedMotion() ? 0 : 850));
          setExplainOpen(true);
        } else {
          toast.success("That matches the AI reference solution.", { description: "It could be wrong. Check your reasoning with the tutor." });
          if (doorTimer.current) clearTimeout(doorTimer.current);
          doorTimer.current = setTimeout(() => setDoorState("idle"), 1600);
        }
      } else {
        play("boing");
        setReaction("puzzled");
        setDoorState("rattle");
        if (doorTimer.current) clearTimeout(doorTimer.current);
        doorTimer.current = setTimeout(() => setDoorState("idle"), 600);
        toast("Curiouser and curiouser… not quite. The Cat has a question for you.");
      }
      setAnswer("");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
      if ((err as ApiError).status === 423) await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function submitExplain(retry = false) {
    setExplaining(true);
    if (!retry) play("gavel");
    try {
      const r = await api<{ pass: boolean; feedback: string; reward: RewardView }>(`/api/sessions/${sessionId}/explain`, { text: retry ? "" : explainText });
      setExplainOpen(false);
      if (!retry) {
        if (r.pass) {
          heartsBurst();
          toast.success("The court is convinced", { description: r.feedback });
        }
        else toast("The jury is unconvinced", { description: r.feedback });
      }
      showRewardToast(r.reward);
      refreshBalance();
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExplaining(false);
    }
  }

  async function goSimilar() {
    setSimilarLoading(true);
    try {
      const r = await api<{ sessionId: string }>(`/api/sessions/${sessionId}/similar`, {});
      navigate(`/learn/${r.sessionId}`, { state: { fresh: true } });
    } catch (e) {
      toast.error((e as Error).message);
      setSimilarLoading(false);
    }
  }

  return (
    <>
      <Header />
      <div className="sticky top-[66px] z-30 grid grid-cols-2 gap-1 border-b border-[var(--border)] bg-[var(--card)]/95 p-1.5 backdrop-blur lg:hidden" role="tablist" aria-label="Workspace">
        {(
          [
            ["problem", "Problem", ScrollText],
            ["chat", "Chat", MessageCircle],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mobileTab === key}
            onClick={() => showTab(key)}
            className={`relative flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition ${
              mobileTab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            <Icon className="size-4" />
            {label}
            {key === "chat" && unread && <span className="absolute right-[30%] top-1.5 size-2 rounded-full bg-[var(--heart)]" aria-label="new message" />}
          </button>
        ))}
      </div>
      <main className="mx-auto grid max-w-[90rem] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] xl:grid-cols-[15rem_minmax(0,5fr)_minmax(0,6fr)]">
        <aside className="hidden xl:block">
          <div className="sticky top-24" data-tour="map">
            <DreamMap s={s} correctLabels={[...correctSteps]} />
          </div>
        </aside>
        {/* Left: problem */}
        <div className={`space-y-4 lg:block ${mobileTab === "problem" ? "" : "hidden"}`} role="tabpanel">
          <Card className="parchment" data-tour="problem">
            <CardHeader>
              {flavor && <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tan)]">{flavor.character} · {flavor.concept}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="font-display text-2xl font-normal">{s.title}</CardTitle>
                {earns && s.startedAt && <span className="ml-auto"><PocketWatch startedAt={s.startedAt} stoppedAt={s.solvedAt} /></span>}
                {!earns && <Badge variant="secondary">Practice dream</Badge>}
                {isQuest && <Badge variant="outline" className="border-[var(--tan)]/50 text-[var(--tan)]"><Sparkles /> New topic</Badge>}
                {earns && s.practice && <Badge variant="secondary">{isQuest ? "Practice dream" : "Unbirthday: already earned"}</Badge>}
                {s.status !== "active" && earns && <Badge className="bg-[var(--gold)] text-white">Solved</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {sandboxChecked && (
                <p className="solari-badge" title="The answer was found by running this exact program in an isolated, network-less Solari sandbox, not by AI.">
                  <BoxSelect className="size-4" /> Verified by running the code in a Solari sandbox
                </p>
              )}
              {isQuest && s.practiceReason && <p className="text-sm text-muted-foreground">{s.practiceReason}</p>}
              {earns ? <Markdown>{s.prompt}</Markdown> : <pre className="whitespace-pre-wrap rounded-lg bg-muted p-3 font-mono text-sm">{s.prompt}</pre>}

              {isBank && (
                <div className="space-y-2">
                  {s.revealedHints.map((h, i) => (
                    <div key={i} className="drink-me flip-in flex items-start gap-2 rounded-lg p-2.5 text-sm">
                      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--potion)]">
                        <FlaskConical className="size-4" /> #{i + 1}
                      </span>
                      <Markdown className="flex-1">{h}</Markdown>
                      {features?.tts && (
                        <Button variant="ghost" size="icon-xs" aria-label="Read hint aloud" onClick={() => playTts({ sessionId, hintIndex: i })}>
                          <Volume2 />
                        </Button>
                      )}
                    </div>
                  ))}
                  <div className="flex flex-wrap items-end gap-3">
                    <DrinkMeBottles drunk={s.hintsUsed} />
                    {s.status === "active" && s.hintsUsed < 3 && (
                      <Button variant="outline" size="sm" onClick={takeHint} disabled={hinting} data-tour="hint">
                        <FlaskConical className="text-[var(--potion)]" />
                        {hinting ? "Uncorking…" : `Drink Me: hint (${HINT_COST[s.hintsUsed]} tarts)`}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {s.hasAnswerCheck && s.status === "active" && (
            <Card className="parchment" data-tour="answer">
              <CardContent className="space-y-3 pt-0">
                {!earns && <p className="text-xs text-muted-foreground">Check against an AI reference solution (may be wrong)</p>}
                <form onSubmit={submitAnswer} className="flex items-center gap-2.5">
                  <AnswerDoor state={doorState} locked={s.locked} />
                  <Input
                    ref={answerInput}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onPaste={(e) => earns && postEvent(sessionId, "paste", { length: e.clipboardData.getData("text").length, target: "answer" })}
                    placeholder="Your final answer, e.g. 7, -3/4, sqrt(2)"
                    maxLength={40}
                    disabled={s.locked || submitting}
                    aria-label="Final answer"
                  />
                  <Button type="submit" disabled={s.locked || submitting || !answer.trim()}>
                    {submitting ? "Checking…" : "Try the door"}
                  </Button>
                </form>
                {s.status === "active" && !s.locked && (
                  <div className="space-y-1.5 pl-[46px]">
                    <MathKeys onInsert={insertIntoAnswer} disabled={submitting} />
                    <AnswerPreview value={answer} />
                  </div>
                )}
                {earns && (
                  <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {s.locked && <KeyRound className="size-4 text-[var(--gold)]" />}
                      {s.locked
                        ? isBank && s.hintsUsed < 3
                          ? "The little door is locked. Drink the next bottle to find the key."
                          : "Out of attempts. Keep talking it through with the Cat."
                        : `Attempts left: ${s.attemptsLeft}`}
                    </span>
                    <span className="flex items-center gap-1 font-semibold text-foreground">
                      {s.practice ? (isQuest ? "Practice dream: no tarts" : "Unbirthday practice: no tarts") : <ShrinkingTart value={s.potentialReward} max={maxReward} />}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {earns && s.status === "solved" && (
            <Card className="parchment">
              <CardContent className="flex items-center justify-between gap-3 pt-0">
                <span className="text-sm">You found the way out! Testify at the trial to {s.practice ? "finish" : "wake up with your tarts"}.</span>
                <Button onClick={() => setExplainOpen(true)}>Testify</Button>
              </CardContent>
            </Card>
          )}

          {earns && s.status === "done" && (
            <Card className="parchment flip-in">
              <CardHeader>
                <CardTitle className="font-display text-2xl font-normal">You woke up!</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {s.explainFeedback && (
                  <p>
                    {s.explainPassed ? "✓ " : "✗ "}
                    {s.explainFeedback}
                  </p>
                )}
                {s.reward ? (
                  <>
                    <p className="font-medium">
                      {s.reward.status === "paid" && `${s.reward.amount} tarts delivered to your wallet`}
                      {s.reward.status === "forfeited" && "Off with their tarts! (suspicious solve, testimony didn't pass)"}
                      {s.reward.status === "failed" && "The tarts got lost on the way (payout failed)"}
                      {s.reward.status === "minting" && "Minting…"}
                    </p>
                    {s.reward.breakdown && <p className="text-muted-foreground">{s.reward.breakdown}</p>}
                    {s.reward.explorerUrl && (
                      <a href={s.reward.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                        View on Solana Explorer <ExternalLink className="size-3.5" />
                      </a>
                    )}
                    {s.reward.status === "failed" &&
                      (features && !features.solana ? (
                        <p className="text-xs text-muted-foreground">
                          Tart delivery (Solana) isn't set up on this server yet. Your reward is saved and can be delivered once it is.
                        </p>
                      ) : (
                        <Button size="sm" onClick={() => submitExplain(true)} disabled={explaining}>
                          {explaining ? "Retrying…" : "Retry payout"}
                        </Button>
                      ))}
                  </>
                ) : (
                  <p className="text-muted-foreground">No tarts for this one (unbirthday practice or the daily cap).</p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {s.reward?.status === "paid" && (
                    <ShareDreamButton
                      info={{ title: s.title, templateId: s.templateId, testimony: s.explanation, amount: s.reward.amount, explorerUrl: s.reward.explorerUrl ?? null, date: s.solvedAt }}
                    />
                  )}
                  <Button variant="outline" size="sm" onClick={() => navigate("/learn")}>
                    Back to the Hall of Doors
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {links.length > 0 && (
            <Card className="parchment">
              <CardHeader>
                <CardTitle className="font-display text-xl font-normal">Deeper down the rabbit hole</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {links.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:underline">
                    <ExternalLink className="size-3.5 shrink-0" />
                    <span className="truncate">{l.title}</span>
                    <span className="shrink-0 text-muted-foreground">· {l.domain}</span>
                  </a>
                ))}
              </CardContent>
            </Card>
          )}

          {!earns &&
            (s.matchedTemplate ? (
              <Card className="parchment">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-0">
                  <span className="text-sm">
                    Earn tarts: a verified door on this same idea is waiting (<em>{s.matchedTemplate.title}</em>).
                  </span>
                  <Button onClick={goSimilar} disabled={similarLoading}>
                    {similarLoading ? "Opening…" : "Earn tarts"}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground">{s.practiceReason ?? "Practice dream: no tarts for this one."}</p>
            ))}

          {earns && s.status === "active" && (
            <p className="text-xs text-muted-foreground">♥ The Queen's guards note tab switches and pastes to keep rewards fair. We never see other tabs or sites.</p>
          )}
        </div>

        {/* Right: chat */}
        <Card
          className={`parchment h-[calc(100dvh-10.5rem)] min-h-[380px] flex-col gap-0 py-0 lg:flex lg:h-[calc(100vh-8rem)] lg:min-h-[420px] ${mobileTab === "chat" ? "flex" : "hidden"}`}
          data-tour="chat"
          role="tabpanel"
        >
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <span key={shownSteps} className={shownSteps > 0 ? "grin-appear" : undefined}>
              <CheshireGrin className="grin-mirror grin-progress size-10" mood={mood} fading={sending} style={sending ? undefined : { opacity: catOpacity }} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg leading-tight">The Cheshire Cat</p>
              <p className="text-xs text-muted-foreground">
                {isBank && totalSteps > 1
                  ? shownSteps >= totalSteps
                    ? "fully here: you found your way"
                    : `${shownSteps} of ${totalSteps} steps confirmed · the Cat appears as you get them right`
                  : "asks, never tells"}
              </p>
            </div>
            {isBank && totalSteps > 1 && (
              <div className="flex gap-1" aria-label={`${shownSteps} of ${totalSteps} steps confirmed`}>
                {Array.from({ length: totalSteps }, (_, i) => (
                  <span key={i} className={`text-sm transition-colors ${i < shownSteps ? "text-[var(--cheshire)]" : "text-[var(--border)]"}`}>
                    ●
                  </span>
                ))}
              </div>
            )}
          </div>
          <CardContent className="flex-1 space-y-3 overflow-y-auto py-4">
            {s.messages.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"} ${!isFresh(m.id) ? "" : m.role === "tutor" ? "msg-in-cat" : "msg-in"}`}>
                <div className={`flex max-w-[88%] items-end gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                  {m.role === "tutor" && <CheshireGrin className="size-6 shrink-0" mood={m.id === lastTutorId ? mood : "neutral"} />}
                  <div
                    className={`rounded-2xl px-3.5 py-2 text-sm ${m.role === "user" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm border border-[var(--border)] bg-secondary"} ${m.pending ? "opacity-70" : ""}`}
                  >
                    {/* Student line breaks are kept (Markdown would otherwise join them into one line). */}
                    {m.role === "user" ? (
                      <Markdown>{m.content.replace(/\n/g, "  \n")}</Markdown>
                    ) : (
                      <TypedMarkdown text={m.content} animate={isFresh(m.id)} onProgress={followChat} />
                    )}
                  </div>
                </div>
                {m.role === "user" && m.verdicts.length > 0 && (
                  <div className="mt-1 flex flex-wrap justify-end gap-1">
                    {m.verdicts.map((v, i) => (
                      <span
                        key={i}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${v.status === "correct" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}
                      >
                        {v.status === "correct" ? <Check className="size-3" /> : <X className="size-3" />}
                        {v.label}
                      </span>
                    ))}
                  </div>
                )}
                {m.role === "tutor" && features?.tts && !m.id.startsWith("pending") && (
                  <Button variant="ghost" size="icon-xs" className="mt-0.5" aria-label="Read aloud" onClick={() => playTts({ sessionId, messageId: m.id })}>
                    <Volume2 />
                  </Button>
                )}
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-sm italic text-muted-foreground">
                <CheshireAppearing className="size-7" /> The Cat is fading in and out of view…
              </div>
            )}
            <div ref={chatEnd} />
          </CardContent>
          <div className="border-t p-3">
            <form onSubmit={sendChat} className="flex items-end gap-2">
              <textarea
                ref={chatInput}
                rows={1}
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends; Shift+Enter makes a new line (and never while an IME is composing).
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Tell the Cat what you're thinking…"
                maxLength={2000}
                disabled={sending}
                aria-label="Message"
                aria-describedby="chat-hint"
                className="block min-h-9 w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-[7px] text-base leading-5 outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
              />
              <Button type="submit" size="icon" className="size-9 shrink-0" disabled={sending || !msg.trim()} aria-label="Send">
                <Send />
              </Button>
            </form>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <p id="chat-hint" className="sr-only">Enter to send, Shift+Enter for a new line.</p>
              <p>
                {isBank
                  ? "Every step is checked by a math engine, not by AI, so the Cat can't pretend you're right."
                  : isQuest
                    ? sandboxChecked
                      ? "The answer comes from running this exact program in an isolated Solari sandbox, not from AI."
                      : "Your final answer is checked by a math engine. Steps in chat aren't."
                    : "Practice dream: steps aren't machine-checked here."}
              </p>
              <div className="flex shrink-0 gap-3">
                <button type="button" className="hover:underline" onClick={() => setTourOpen(true)}>
                  Tour
                </button>
                <button type="button" className="hidden hover:underline sm:inline" onClick={() => setShortcutsOpen(true)}>
                  Shortcuts <kbd className="rounded border border-[var(--border)] px-1 font-mono">?</kbd>
                </button>
              </div>
            </div>
          </div>
        </Card>
      </main>

      {intro && <FallingIntro onDone={endIntro} />}
      {tourOpen && <RabbitTour steps={TOUR} onClose={() => setTourOpen(false)} />}
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      <Dialog open={explainOpen} onOpenChange={setExplainOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-normal">{flagged ? "Who stole the tarts? ♥" : "The trial: why does it work?"}</DialogTitle>
            <DialogDescription>
              {flagged
                ? "This solve looked suspicious (very fast, pasted, or after wandering off). Convincing testimony keeps your tarts; weak testimony and it's off with their heads (this reward is forfeited)."
                : s.practice
                  ? isQuest
                    ? "Practice dream: no tarts on this one, but explaining still counts toward mastering the topic."
                    : "Unbirthday practice: you've already earned on this one."
                  : isQuest
                    ? "You found the answer. Now, in 1–2 sentences, testify why your method works. New topics pay only when the court is convinced."
                    : "You found the answer. Now, in 1–2 sentences, testify why your method works. Real understanding doubles your tarts."}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={explainText} onChange={(e) => setExplainText(e.target.value)} rows={4} maxLength={1500} placeholder="Your Majesty, my method works because…" />
          <DialogFooter>
            <Button onClick={() => submitExplain(false)} disabled={explaining || explainText.trim().length < 10}>
              {explaining ? "The jury is deliberating…" : "Present testimony"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
