import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Header } from "@/components/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api, type Problem } from "@/lib/api";

function Dots({ n }: { n: number }) {
  return (
    <span className="flex gap-1" aria-label={`Difficulty ${n} of 3`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`size-2 rounded-full ${i <= n ? "bg-foreground" : "bg-muted"}`} />
      ))}
    </span>
  );
}

export function Learn() {
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [kind, setKind] = useState<"problem" | "topic">("problem");
  const [text, setText] = useState("");
  const [starting, setStarting] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api<Problem[]>("/api/problems").then(setProblems).catch((e) => toast.error(e.message));
  }, []);

  async function start(body: unknown, key: string) {
    setStarting(key);
    try {
      const { sessionId } = await api<{ sessionId: string }>("/api/sessions", body);
      navigate(`/learn/${sessionId}`);
    } catch (e) {
      toast.error((e as Error).message);
      setStarting(null);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Stuck on something?</CardTitle>
            <CardDescription>Paste a problem or name a topic you're learning. Socra will guide you, not do it for you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="inline-flex rounded-lg border p-0.5" role="tablist">
              {(["problem", "topic"] as const).map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={kind === k}
                  onClick={() => setKind(k)}
                  className={`rounded-md px-3 py-1 text-sm capitalize ${kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  {k}
                </button>
              ))}
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={2000}
              rows={kind === "problem" ? 5 : 2}
              placeholder={kind === "problem" ? "Paste your homework problem here…" : "e.g. recursion, the chain rule, free fall"}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">Practice mode: custom problems don't pay LEARN, but we'll point you to a verified one that does.</span>
              <Button disabled={!text.trim() || starting !== null} onClick={() => start({ custom: { kind, text } }, "custom")}>
                {starting === "custom" ? "Reading it…" : "Start"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Verified problems: earn LEARN</h2>
          {!problems && <p className="text-sm text-muted-foreground">Loading…</p>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {problems?.map((p) => (
              <Card key={p.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle>{p.title}</CardTitle>
                    {p.rewardStatus === "paid" && <Badge>Earned</Badge>}
                    {p.rewardStatus === "forfeited" && <Badge variant="destructive">Forfeited</Badge>}
                  </div>
                  <CardDescription className="flex items-center gap-3">
                    <span>{p.concept}</span>
                    <Dots n={p.difficulty} />
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{p.rewardStatus ? "Practice mode" : `Up to ${p.maxReward} LEARN`}</span>
                  <Button variant="outline" disabled={starting !== null} onClick={() => start({ templateId: p.id }, p.id)}>
                    {starting === p.id ? "Starting…" : "Start"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Everyone gets different numbers, so shared answers don't help.</p>
        </section>
      </main>
    </>
  );
}
