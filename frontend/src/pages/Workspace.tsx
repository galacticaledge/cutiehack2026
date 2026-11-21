import { Check, ExternalLink, Lightbulb, Send, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Header } from "@/components/header";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError, postEvent, refreshBalance, type ChatMessage, type Features, type RewardView, type SessionView } from "@/lib/api";

const HINT_COST = ["−25%", "−33%", "−40%"];

function showRewardToast(r: RewardView) {
  if (r.status === "paid" && r.amount > 0) {
    toast.success(`+${r.amount} LEARN`, {
      description: r.breakdown,
      duration: 15000,
      action: r.explorerUrl ? { label: "View on Solana Explorer ↗", onClick: () => window.open(r.explorerUrl!, "_blank", "noopener") } : undefined,
    });
  } else if (r.status === "paid") {
    toast(`No LEARN this time`, { description: r.breakdown });
  } else if (r.status === "failed") {
    toast.error("Payout failed, try again", { description: "Your reward is saved. Press “Retry payout”." });
  } else if (r.status === "forfeited") {
    toast.error("Reward forfeited", { description: "This solve was flagged and the explanation didn't show understanding." });
  } else if (r.status === "practice") {
    toast("Practice mode: no reward", { description: r.breakdown });
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
  const tracking = (s?.source === "bank" || s?.source === "quest") && s.status === "active";
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
        <p className="p-8 text-sm text-muted-foreground">Loading…</p>
      </>
    );
  }

  const isBank = s.source === "bank";
  const isQuest = s.source === "quest";
  // Verified answer + explain-back + possible payout (bank problems and generated topic problems).
  const earns = isBank || isQuest;

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
        if (earns) {
          setFlagged(Boolean(r.flagged));
          setExplainOpen(true);
        } else {
          toast.success("That matches the AI reference solution.", { description: "It could be wrong. Check your reasoning with the tutor." });
        }
      } else {
        toast("Not quite. The tutor has a question for you.");
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
        if (r.pass) toast.success("Explanation accepted", { description: r.feedback });
        else toast("Explanation needs work", { description: r.feedback });
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
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* Left: problem */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{s.title}</CardTitle>
                {!earns && <Badge variant="secondary">Practice mode</Badge>}
                {isQuest && <Badge variant="outline">New topic</Badge>}
                {earns && s.practice && <Badge variant="secondary">{isQuest ? "Practice mode" : "Practice mode: already earned"}</Badge>}
                {s.status !== "active" && earns && <Badge>Solved</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {earns ? <Markdown>{s.prompt}</Markdown> : <pre className="whitespace-pre-wrap rounded-lg bg-muted p-3 font-mono text-sm">{s.prompt}</pre>}
              {isQuest && s.practiceReason && <p className="text-sm text-muted-foreground">{s.practiceReason}</p>}

              {isBank && (
                <div className="space-y-2">
                  {s.revealedHints.map((h, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg border bg-amber-50 p-2.5 text-sm">
                      <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-600" />
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
                      <Lightbulb />
                      {hinting ? "Revealing…" : `Hint (${HINT_COST[s.hintsUsed]})`}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {s.hasAnswerCheck && s.status === "active" && (
            <Card>
              <CardContent className="space-y-3 pt-0">
                {!earns && <p className="text-xs text-muted-foreground">Check against an AI reference solution (may be wrong)</p>}
                <form onSubmit={submitAnswer} className="flex gap-2">
                  <Input
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onPaste={(e) => earns && postEvent(sessionId, "paste", { length: e.clipboardData.getData("text").length, target: "answer" })}
                    placeholder="Your final answer, e.g. 7, -3/4, sqrt(2)"
                    maxLength={40}
                    disabled={s.locked || submitting}
                    aria-label="Final answer"
                  />
                  <Button type="submit" disabled={s.locked || submitting || !answer.trim()}>
                    {submitting ? "Checking…" : "Submit"}
                  </Button>
                </form>
                {earns && (
                  <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
                    <span>
                      {s.locked
                        ? isBank && s.hintsUsed < 3
                          ? "Locked: reveal the next hint for 2 more attempts."
                          : "Out of attempts. Keep talking it through with the tutor."
                        : `Attempts left: ${s.attemptsLeft}`}
                    </span>
                    <span className="font-medium text-foreground">{s.practice ? "Practice mode: no reward" : `Potential reward: ${s.potentialReward} LEARN`}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {earns && s.status === "solved" && (
            <Card>
              <CardContent className="flex items-center justify-between gap-3 pt-0">
                <span className="text-sm">Correct! Explain your reasoning to {s.practice ? "finish" : "claim your reward"}.</span>
                <Button onClick={() => setExplainOpen(true)}>Explain</Button>
              </CardContent>
            </Card>
          )}

          {earns && s.status === "done" && (
            <Card>
              <CardHeader>
                <CardTitle>Result</CardTitle>
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
                      {s.reward.status === "paid" && `${s.reward.amount} LEARN paid`}
                      {s.reward.status === "forfeited" && "Reward forfeited (flagged solve, explanation didn't pass)"}
                      {s.reward.status === "failed" && "Payout failed"}
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
                  <p className="text-muted-foreground">Practice mode: no reward.</p>
                )}
                <Button variant="outline" size="sm" onClick={() => navigate("/learn")}>
                  Back to problems
                </Button>
              </CardContent>
            </Card>
          )}

          {links.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Go deeper</CardTitle>
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
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-0">
                  <span className="text-sm">
                    Earn LEARN: try a verified problem on this concept (<em>{s.matchedTemplate.title}</em>).
                  </span>
                  <Button onClick={goSimilar} disabled={similarLoading}>
                    {similarLoading ? "Opening…" : "Earn LEARN"}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground">{s.practiceReason ?? "Practice mode: no LEARN for this one."}</p>
            ))}

          {earns && s.status === "active" && (
            <p className="text-xs text-muted-foreground">We note tab switches and pastes to keep rewards fair. We never see other tabs or sites.</p>
          )}
        </div>

        {/* Right: chat */}
        <Card className="flex h-[calc(100vh-7.5rem)] min-h-[420px] flex-col">
          <CardContent className="flex-1 space-y-3 overflow-y-auto pt-0">
            {s.messages.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"} ${m.pending ? "opacity-70" : ""}`}>
                  <Markdown>{m.content}</Markdown>
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
            {sending && <div className="text-sm text-muted-foreground">Socra is thinking…</div>}
            <div ref={chatEnd} />
          </CardContent>
          <div className="border-t p-3">
            <form onSubmit={sendChat} className="flex gap-2">
              <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Tell the tutor what you're thinking…" maxLength={2000} disabled={sending} aria-label="Message" />
              <Button type="submit" size="icon" disabled={sending || !msg.trim()} aria-label="Send">
                <Send />
              </Button>
            </form>
            <p className="mt-2 text-xs text-muted-foreground">
              {isBank
                ? "Steps are checked by a math engine, not by AI."
                : isQuest
                  ? s.checkedBy === "sandbox"
                    ? "The answer comes from running this exact program in an isolated Solari sandbox, not from AI."
                    : "Your final answer is checked by a math engine. Steps in chat aren't."
                  : "Practice mode: steps aren't machine-checked here."}
            </p>
          </div>
        </Card>
      </main>

      <Dialog open={explainOpen} onOpenChange={setExplainOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{flagged ? "Nice! Explain your reasoning to claim this reward." : "Correct! Now explain why it works."}</DialogTitle>
            <DialogDescription>
              {flagged
                ? "This solve was flagged (very fast, pasted, or after leaving the tab). A solid explanation pays out normally; a weak one forfeits this reward."
                : s.practice
                  ? "Practice mode: no reward on this one, but explaining still counts toward mastering the topic."
                  : isQuest
                    ? "In 1–2 sentences, explain why your method works. New topics pay only when the explanation passes."
                    : "In 1–2 sentences, explain why your method works. Showing understanding doubles your reward."}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={explainText} onChange={(e) => setExplainText(e.target.value)} rows={4} maxLength={1500} placeholder="My method works because…" />
          <DialogFooter>
            <Button onClick={() => submitExplain(false)} disabled={explaining || explainText.trim().length < 10}>
              {explaining ? "Grading and minting…" : "Submit explanation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
