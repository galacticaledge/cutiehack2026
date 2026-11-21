import { Check, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Header } from "@/components/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type ConceptMap, type ConceptNode, type Features } from "@/lib/api";

export function KnowledgeMap() {
  const [map, setMap] = useState<ConceptMap | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [features, setFeatures] = useState<Features | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api<ConceptMap>("/api/concepts").then(setMap).catch((e) => toast.error(e.message));
    api<Features>("/api/features").then(setFeatures).catch(() => {});
  }, []);

  const title = (id: string) => map?.concepts.find((c) => c.id === id)?.title ?? id;
  const capReached = map ? map.topicRewardsToday >= map.dailyTopicCap : false;

  async function start(c: ConceptNode) {
    setStarting(c.id);
    try {
      const body = c.bankTemplateId ? { templateId: c.bankTemplateId } : { custom: { kind: "topic", text: c.title } };
      const { sessionId } = await api<{ sessionId: string }>("/api/sessions", body);
      navigate(`/learn/${sessionId}`);
    } catch (e) {
      toast.error((e as Error).message);
      setStarting(null);
    }
  }

  function earnLabel(c: ConceptNode) {
    if (c.rewarded) return "Earned";
    if (c.status === "locked") return "Locked";
    if (c.bankTemplateId) return "Verified problem";
    return capReached ? "Daily limit reached" : `Up to ${map?.questBase ?? 50} tarts`;
  }

  const subjects = map ? [...new Set(map.concepts.map((c) => c.subject))] : [];

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge map</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Each topic pays tarts once, after you solve a fresh problem on it and explain why your method works. A topic unlocks for rewards when you've mastered what it builds on.
            Asking for the same topic in different words lands on the same spot on the map.
          </p>
          {map && (
            <p className="text-sm">
              New-topic rewards today: <span className="font-medium">{map.topicRewardsToday} / {map.dailyTopicCap}</span>
            </p>
          )}
        </div>

        {!map && <p className="text-sm text-muted-foreground">Loading…</p>}

        {subjects.map((subject) => (
          <section key={subject} className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 className="text-lg font-semibold">{subject}</h2>
              {subject === "Computer science" && features?.codeRunner && (
                <span className="text-sm text-muted-foreground">New problems here are checked by running the code in a Solari sandbox.</span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {map!.concepts
                .filter((c) => c.subject === subject)
                .map((c) => (
                  <Card key={c.id} className={c.status === "locked" ? "opacity-75" : undefined}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{c.title}</CardTitle>
                        {c.status === "mastered" && (
                          <Badge>
                            <Check /> Mastered
                          </Badge>
                        )}
                        {c.status === "locked" && (
                          <Badge variant="secondary">
                            <Lock /> Locked
                          </Badge>
                        )}
                      </div>
                      {c.prereqs.length > 0 && <CardDescription>Builds on {c.prereqs.map(title).join(", ")}</CardDescription>}
                    </CardHeader>
                    <CardContent className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">{earnLabel(c)}</span>
                      <Button variant="outline" size="sm" disabled={starting !== null} onClick={() => start(c)}>
                        {starting === c.id ? "Building a problem…" : c.status === "locked" || c.rewarded ? "Practice" : "Start"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </section>
        ))}
      </main>
    </>
  );
}
