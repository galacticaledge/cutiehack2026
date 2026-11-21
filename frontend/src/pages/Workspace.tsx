import { Check, ExternalLink, FlaskConical, KeyRound, Send, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Header } from "@/components/header";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { celebrate, CheshireGrin, flavorFor } from "@/components/wonder";
import { PocketWatch, ShrinkingTart } from "@/components/scenery";
import { DreamMap } from "@/components/guides";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError, postEvent, refreshBalance, type ChatMessage, type Features, type RewardView, type SessionView } from "@/lib/api";

const HINT_COST = ["−25%", "−33%", "−40%"];

function showRewardToast(r: RewardView) {
  if (r.status === "paid" && r.amount > 0) {
    celebrate();
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

  const load = useCallback(async () => {
    try {
      const v = await api<SessionView>(`/api/sessions/${sessionId}`);
      setS(v);
      return v;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    }
  }, [sessionId]);

  useEffect(() => {
    setS(null);
    setLinks([]);
    void load();
    api<Features>("/api/features").then(setFeatures).catch(() => {});
  }, [load]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [s?.messages.length]);

  // Anti-cheat telemetry (bank problems only, while active).
  const tracking = s?.source === "bank" && s.status === "active";
  useEffect(() => {
    if (!tracking) return;
    const onVis = () => postEvent(sessionId, document.visibilityState === "hidden" ? "hidden" : "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [tracking, sessionId]);

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
        <p className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><CheshireGrin className="size-6" fading /> Falling down the rabbit hole…</p>
      </>
    );
  }

  const isBank = s.source === "bank";
  const flavor = flavorFor(s.templateId);
  // The Cheshire Cat appears a little more with every step the math engine confirms.
  const correctSteps = new Set(s.messages.flatMap((m) => m.verdicts.filter((v) => v.status === "correct").map((v) => v.label)));
  const totalSteps = s.checkpointCount + 1; // + the final answer
  const shownSteps = s.status === "active" ? Math.min(correctSteps.size, s.checkpointCount) : totalSteps;
  const catOpacity = isBank && totalSteps > 1 ? 0.3 + 0.7 * (shownSteps / totalSteps) : 1;
  const maxReward = 100 * s.difficulty;

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const text = msg.trim();
    if (!text || sending || !s) return;
    setSending(true);
    setMsg("");
    const tempId = `pending-${Date.now()}`;
    setS({ ...s, messages: [...s.messages, { id: tempId, role: "user", content: text, verdicts: [], pending: true }] });
    try {
      const r = await api<{ reply: string; messageId: string; userMessageId: string; verdicts: ChatMessage["verdicts"] }>(`/api/sessions/${sessionId}/chat`, { message: text });
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
      if ((err as ApiError).status === 429) setMsg(text);
      await load();
    } finally {
      setSending(false);
    }
  }

  async function takeHint() {
    setHinting(true);
    try {
      await api(`/api/sessions/${sessionId}/hint`, {});
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setHinting(false);
    }
  }

  async function submitAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    setSubmitting(true);
    try {
      const r = await api<{ correct: boolean; flagged?: boolean; practice?: boolean }>(`/api/sessions/${sessionId}/answer`, { answer });
      if (r.correct) {
        if (isBank) {
          setFlagged(Boolean(r.flagged));
          setExplainOpen(true);
        } else {
          toast.success("That matches the AI reference solution.", { description: "It could be wrong. Check your reasoning with the tutor." });
        }
      } else {
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
    try {
      const r = await api<{ pass: boolean; feedback: string; reward: RewardView }>(`/api/sessions/${sessionId}/explain`, { text: retry ? "" : explainText });
      setExplainOpen(false);
      if (!retry) {
        if (r.pass) toast.success("The court is convinced", { description: r.feedback });
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
      navigate(`/learn/${r.sessionId}`);
    } catch (e) {
      toast.error((e as Error).message);
      setSimilarLoading(false);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto grid max-w-[90rem] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] xl:grid-cols-[15rem_minmax(0,5fr)_minmax(0,6fr)]">
        <aside className="hidden xl:block">
          <div className="sticky top-24">
            <DreamMap s={s} correctLabels={[...correctSteps]} />
          </div>
        </aside>
        {/* Left: problem */}
        <div className="space-y-4">
          <Card className="parchment">
            <CardHeader>
              {flavor && <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tan)]">{flavor.character} · {flavor.concept}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="font-display text-2xl font-normal">{s.title}</CardTitle>
                {isBank && <span className="ml-auto"><PocketWatch startedAt={s.startedAt} stoppedAt={s.solvedAt} /></span>}
                {!isBank && <Badge variant="secondary">Practice dream</Badge>}
                {isBank && s.practice && <Badge variant="secondary">Unbirthday: already earned</Badge>}
                {s.status !== "active" && isBank && <Badge className="bg-[var(--gold)] text-white">Solved</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isBank ? <Markdown>{s.prompt}</Markdown> : <pre className="whitespace-pre-wrap rounded-lg bg-muted p-3 font-mono text-sm">{s.prompt}</pre>}

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
                  {s.status === "active" && s.hintsUsed < 3 && (
                    <Button variant="outline" size="sm" onClick={takeHint} disabled={hinting}>
                      <FlaskConical className="text-[var(--potion)]" />
                      {hinting ? "Uncorking…" : `Drink Me: hint (${HINT_COST[s.hintsUsed]} tarts)`}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {s.hasAnswerCheck && s.status === "active" && (
            <Card className="parchment">
              <CardContent className="space-y-3 pt-0">
                {!isBank && <p className="text-xs text-muted-foreground">Check against an AI reference solution (may be wrong)</p>}
                <form onSubmit={submitAnswer} className="flex gap-2">
                  <Input
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onPaste={(e) => isBank && postEvent(sessionId, "paste", { length: e.clipboardData.getData("text").length, target: "answer" })}
                    placeholder="Your final answer, e.g. 7, -3/4, sqrt(2)"
                    maxLength={40}
                    disabled={s.locked || submitting}
                    aria-label="Final answer"
                  />
                  <Button type="submit" disabled={s.locked || submitting || !answer.trim()}>
                    {submitting ? "Checking…" : "Try the door"}
                  </Button>
                </form>
                {isBank && (
                  <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {s.locked && <KeyRound className="size-4 text-[var(--gold)]" />}
                      {s.locked
                        ? s.hintsUsed < 3
                          ? "The little door is locked. Drink the next bottle to find the key."
                          : "Out of attempts. Keep talking it through with the Cat."
                        : `Attempts left: ${s.attemptsLeft}`}
                    </span>
                    <span className="flex items-center gap-1 font-semibold text-foreground">
                      {s.practice ? "Unbirthday practice: no tarts" : <ShrinkingTart value={s.potentialReward} max={maxReward} />}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {isBank && s.status === "solved" && (
            <Card className="parchment">
              <CardContent className="flex items-center justify-between gap-3 pt-0">
                <span className="text-sm">You found the way out! Testify at the trial to {s.practice ? "finish" : "wake up with your tarts"}.</span>
                <Button onClick={() => setExplainOpen(true)}>Testify</Button>
              </CardContent>
            </Card>
          )}

          {isBank && s.status === "done" && (
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
                    {s.reward.status === "failed" && (
                      <Button size="sm" onClick={() => submitExplain(true)} disabled={explaining}>
                        {explaining ? "Retrying…" : "Retry payout"}
                      </Button>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">No tarts for this one (unbirthday practice or the daily cap).</p>
                )}
                <Button variant="outline" size="sm" onClick={() => navigate("/learn")}>
                  Back to the Hall of Doors
                </Button>
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

          {!isBank &&
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
              <p className="text-sm text-muted-foreground">Practice dream: no tarts for this one.</p>
            ))}

          {isBank && s.status === "active" && (
            <p className="text-xs text-muted-foreground">♥ The Queen's guards note tab switches and pastes to keep rewards fair. We never see other tabs or sites.</p>
          )}
        </div>

        {/* Right: chat */}
        <Card className="parchment flex h-[calc(100vh-8rem)] min-h-[420px] flex-col gap-0 py-0">
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <span key={shownSteps} className={shownSteps > 0 ? "grin-appear" : undefined}>
              <CheshireGrin className="grin-mirror grin-progress size-10" fading={sending} style={sending ? undefined : { opacity: catOpacity }} />
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
              <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`flex max-w-[88%] items-end gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                  {m.role === "tutor" && <CheshireGrin className="size-6 shrink-0" />}
                  <div
                    className={`rounded-2xl px-3.5 py-2 text-sm ${m.role === "user" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm border border-[var(--border)] bg-secondary"} ${m.pending ? "opacity-70" : ""}`}
                  >
                    <Markdown>{m.content}</Markdown>
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
                <CheshireGrin className="size-6" fading /> The Cat is fading in and out of view…
              </div>
            )}
            <div ref={chatEnd} />
          </CardContent>
          <div className="border-t p-3">
            <form onSubmit={sendChat} className="flex gap-2">
              <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Tell the Cat what you're thinking…" maxLength={2000} disabled={sending} aria-label="Message" />
              <Button type="submit" size="icon" disabled={sending || !msg.trim()} aria-label="Send">
                <Send />
              </Button>
            </form>
            <p className="mt-2 text-xs text-muted-foreground">
              {isBank ? "Every step is checked by a math engine, not by AI, so the Cat can't pretend you're right." : "Practice dream: steps aren't machine-checked here."}
            </p>
          </div>
        </Card>
      </main>

      <Dialog open={explainOpen} onOpenChange={setExplainOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-normal">{flagged ? "Who stole the tarts? ♥" : "The trial: why does it work?"}</DialogTitle>
            <DialogDescription>
              {flagged
                ? "This solve looked suspicious (very fast, pasted, or after wandering off). Convincing testimony keeps your tarts; weak testimony and it's off with their heads (this reward is forfeited)."
                : s.practice
                  ? "Unbirthday practice: you've already earned on this one."
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
