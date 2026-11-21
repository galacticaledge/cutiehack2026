import { Clock, Coffee, FlaskConical, KeyRound, Rabbit } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheshireGrin, Tart } from "@/components/wonder";
import { DreamFooter, LookingGlassToggle } from "@/components/scenery";
import { api } from "@/lib/api";

const FLOATERS = [
  { Icon: Clock, cls: "left-[6%] top-[14%] size-10", r: "-12deg", delay: "0s" },
  { Icon: Coffee, cls: "right-[8%] top-[20%] size-9", r: "10deg", delay: "1.2s" },
  { Icon: KeyRound, cls: "left-[10%] bottom-[18%] size-8", r: "24deg", delay: "2.1s" },
  { Icon: FlaskConical, cls: "right-[12%] bottom-[22%] size-9", r: "-8deg", delay: "0.6s" },
  { Icon: Rabbit, cls: "left-[46%] top-[6%] size-8", r: "6deg", delay: "1.7s" },
];

const STEPS = [
  { suit: "♠", title: "Fall down the rabbit hole", body: "Pick a dream. The Cheshire Cat asks questions and never hands you the answer." },
  { suit: "♥", title: "Testify at the trial", body: "Solved it? Explain why it works. Real understanding, not just a number." },
  { suit: "♦", title: "Wake up with tarts", body: "TARTS land in your Solana devnet wallet, with a receipt on the explorer." },
];

export function Landing() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vanishes, setVanishes] = useState(0);
  const [hidden, setHidden] = useState(false);

  function poke() {
    if (hidden) return;
    setHidden(true);
    setVanishes((n) => n + 1);
    setTimeout(() => setHidden(false), 1100);
  }
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/login", { username });
      navigate("/learn");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {FLOATERS.map(({ Icon, cls, r, delay }, i) => (
        <Icon
          key={i}
          aria-hidden="true"
          className={`float pointer-events-none absolute hidden text-[var(--tan)]/30 md:block landing-floater ${cls}`}
          style={{ "--r": r, animationDelay: delay } as React.CSSProperties}
          strokeWidth={1.4}
        />
      ))}

      <LookingGlassToggle className="absolute right-4 top-4 z-10 text-[var(--primary)] hover:bg-secondary" />
      <main className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-2xl flex-col justify-center gap-9 px-4 py-16">
        <div className="space-y-4 text-center">
          <button
            type="button"
            onClick={poke}
            className="mx-auto block rounded-full focus-visible:outline-2"
            aria-label="Poke the Cheshire Cat"
            title="Go on, poke the Cat"
          >
            <CheshireGrin className={`grin-mirror float size-24 drop-shadow-lg transition-opacity duration-500 ${hidden ? "opacity-0" : "opacity-100"}`} />
          </button>
          <p className="h-4 text-xs text-muted-foreground" aria-live="polite">
            {vanishes > 0 && `The Cat has vanished ${vanishes} ${vanishes === 1 ? "time" : "times"}${vanishes >= 6 ? ". Six impossible things before breakfast!" : ""}`}
          </p>
          <p className="inline-flex items-center gap-2 rounded-full border border-[var(--tan)]/40 bg-[#faf8f1]/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--tan)] dark:bg-white/5">
            ✦ Dream to Wonderland · Cutie Hack 2026 ✦
          </p>
          <h1 className="font-display text-6xl leading-none text-[var(--night)] dark:text-foreground sm:text-7xl">
            Socra
            <span className="block text-3xl italic text-[var(--tan)] sm:text-4xl">curiouser &amp; curiouser</span>
          </h1>
          <p className="mx-auto max-w-lg text-lg text-muted-foreground">
            A tutor that, like the Cheshire Cat, only answers with questions. Find your own way out of the dream and wake up with{" "}
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--heart)]">
              TARTS <Tart />
            </span>
            .
          </p>
        </div>

        <form onSubmit={submit} className="parchment mx-auto flex w-full max-w-md gap-2 rounded-2xl p-2">
          <Input
            autoFocus
            placeholder="Who are YOU? (pick a username)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="h-11 border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
            aria-label="Username"
          />
          <Button type="submit" size="lg" className="h-11 px-5" disabled={loading || !username.trim()}>
            {loading ? "Falling…" : "Follow the rabbit"}
          </Button>
        </form>
        {error && <p className="-mt-6 text-center text-sm text-destructive">{error}</p>}

        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="parchment playing-card rounded-xl p-4 pt-8 text-sm">
              <span className={`pip pip-tl ${s.suit === "♠" ? "" : "text-[var(--heart)]"}`}>{s.suit}</span>
              <p className="font-display text-lg leading-tight">
                {i + 1}. {s.title}
              </p>
              <p className="mt-1 text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>

        <p className="text-center text-xs text-muted-foreground">
          Built on UC Irvine research showing slow, Socratic AI tutoring improves learning.
          <br />
          Built with AIsa · ElevenLabs · Keenable · Solana devnet
        </p>
      </main>
      <DreamFooter />
    </div>
  );
}
