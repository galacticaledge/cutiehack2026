import { Clock, Coffee, Eye, EyeOff, FlaskConical, KeyRound, Rabbit } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheshireGrin, Tart } from "@/components/wonder";
import { SocraLogo } from "@/components/logo";
import { CheshireTree, MushroomDream } from "@/components/dreamart";
import { DreamFooter, LookingGlassToggle } from "@/components/scenery";
import { CastPanel, WhyPanel } from "@/components/guides";
import { LiveStats, WhySocra } from "@/components/whysocra";
import { SparkleTrail } from "@/components/celebrations";
import { api, ApiError, PASSWORD_MAX, PASSWORD_MIN, signUpThrowaway, USERNAME_RE } from "@/lib/api";

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
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [suggestOther, setSuggestOther] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vanishes, setVanishes] = useState(0);
  const [hidden, setHidden] = useState(false);

  async function guestPass() {
    setLoading(true);
    setError(null);
    try {
      await signUpThrowaway("guest");
      const { sessionId } = await api<{ sessionId: string }>("/api/sessions", { templateId: "cs-trace-loop-1" });
      navigate(`/learn/${sessionId}`, { state: { fresh: true } });
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  function poke() {
    if (hidden) return;
    setHidden(true);
    setVanishes((n) => n + 1);
    setTimeout(() => setHidden(false), 1100);
  }
  const navigate = useNavigate();

  const name = username.trim().toLowerCase();
  const nameProblem = name && !USERNAME_RE.test(name) ? "2–24 characters: letters, numbers, - and _." : null;
  const passwordProblem =
    password && (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) ? `${PASSWORD_MIN}–${PASSWORD_MAX} characters.` : null;
  const canSubmit = !loading && USERNAME_RE.test(name) && password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX;

  function switchMode(m: "signup" | "login") {
    setMode(m);
    setError(null);
    setSuggestOther(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setSuggestOther(false);
    try {
      await api(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", { username: name, password });
      navigate("/learn");
    } catch (err) {
      const status = (err as ApiError).status;
      setError((err as Error).message);
      setSuggestOther((mode === "signup" && status === 409) || (mode === "login" && status === 401));
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

      <SparkleTrail />
      <div className="pointer-events-none absolute top-24 right-[calc(50%+22.5rem)] hidden w-[16rem] min-[1180px]:block 2xl:w-[18rem]">
        <MushroomDream />
      </div>
      <div className="pointer-events-none absolute top-20 left-[calc(50%+22.5rem)] hidden w-[16rem] min-[1180px]:block 2xl:w-[18rem]">
        <CheshireTree />
      </div>
      <nav aria-label="Display" className="absolute right-4 top-4 z-10">
        <LookingGlassToggle className=" border border-[var(--border)] bg-card/70 text-foreground backdrop-blur hover:bg-secondary" labelClassName="" />
      </nav>
      <main className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-2xl flex-col justify-center gap-9 px-4 py-16">
        <div className="space-y-4 text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-[var(--tan)]/40 bg-[#faf8f1]/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--tan)] dark:bg-white/5">
            ✦ Dream to Wonderland · Cutie Hack 2026 ✦
          </p>
          <div className="relative mx-auto w-[min(100%,23rem)]">
            <h1>
              <SocraLogo className="h-auto w-full" />
            </h1>
            <button
              type="button"
              onClick={poke}
              className="absolute rounded-full focus-visible:outline-2"
              style={{ left: "77%", top: "-5%" }}
              aria-label="Poke the Cheshire Cat"
              title="Go on, poke the Cat"
            >
              <CheshireGrin className={`grin-mirror float size-14 drop-shadow-md transition-opacity duration-500 ${hidden ? "opacity-0" : "opacity-100"}`} />
            </button>
          </div>
          <p className="font-display text-2xl italic text-[var(--tan)] sm:text-3xl">a Socratic dream in Wonderland</p>
          <p className="h-4 text-xs text-muted-foreground" aria-live="polite">
            {vanishes > 0 && `The Cat has vanished ${vanishes} ${vanishes === 1 ? "time" : "times"}${vanishes >= 6 ? ". Six impossible things before breakfast!" : ""}`}
          </p>
          <p className="mx-auto max-w-lg text-lg text-muted-foreground">
            A tutor that, like the Cheshire Cat, answers your questions with questions. Find your own way out of the dream and wake up with{" "}
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--heart)]">
              TARTS <Tart />
            </span>
            .
          </p>
        </div>

        <form onSubmit={submit} className="parchment mx-auto w-full max-w-md space-y-3 rounded-2xl p-4" aria-label={mode === "signup" ? "Create an account" : "Log in"}>
          <div className="grid grid-cols-2 gap-1 rounded-full border border-[var(--border)] bg-background/60 p-0.5" role="tablist" aria-label="Account">
            {(
              [
                ["signup", "New here?"],
                ["login", "Welcome back"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={`rounded-full py-1.5 text-sm font-semibold transition ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <Input
              autoFocus
              placeholder={mode === "signup" ? "Who are YOU? (pick a username)" : "Your username"}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className="h-11 bg-background/60 text-base"
              aria-label="Username"
              aria-invalid={Boolean(nameProblem)}
            />
            {nameProblem && <p className="px-1 text-xs text-destructive">{nameProblem}</p>}
          </div>
          <div className="space-y-1">
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder={mode === "signup" ? `Choose a password (${PASSWORD_MIN}+ characters)` : "Your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                maxLength={PASSWORD_MAX}
                className="h-11 bg-background/60 pr-11 text-base"
                aria-label="Password"
                aria-invalid={Boolean(passwordProblem)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {passwordProblem && <p className="px-1 text-xs text-destructive">{passwordProblem}</p>}
          </div>
          <Button type="submit" size="lg" className="h-11 w-full" disabled={!canSubmit}>
            {loading ? "Falling…" : mode === "signup" ? "Follow the rabbit" : "Back down the rabbit hole"}
          </Button>
          {error && (
            <p className="text-center text-sm text-destructive" role="alert">
              {error}{" "}
              {suggestOther && (
                <button type="button" className="font-semibold underline" onClick={() => switchMode(mode === "signup" ? "login" : "signup")}>
                  {mode === "signup" ? "Log in instead?" : "Create an account instead?"}
                </button>
              )}
            </p>
          )}
        </form>
        <p className="-mt-5 text-center text-sm text-muted-foreground">
          Just looking?{" "}
          <button type="button" onClick={guestPass} disabled={loading} className="font-semibold text-[var(--tan)] underline-offset-2 hover:underline disabled:opacity-50">
            Use a guest pass to the Mad Hatter's tea party →
          </button>
        </p>

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

        <WhySocra />
        <LiveStats />

        <p className="text-center text-xs text-muted-foreground">
          Inspired by UC Irvine research (SIGCSE 2026) on slow, Socratic-paced AI tutoring.
          <br />
          Built with OpenAI · Solari · ElevenLabs · Keenable · Solana devnet
        </p>
      </main>
      <aside aria-label="Meet the cast" className="absolute left-[max(1rem,calc(50%-40rem))] top-1/2 z-[1] hidden w-[17rem] -translate-y-1/2 min-[1340px]:block">
        <CastPanel />
      </aside>
      <aside aria-label="Why it works" className="absolute right-[max(1rem,calc(50%-40rem))] top-1/2 z-[1] hidden w-[17rem] -translate-y-1/2 min-[1340px]:block">
        <WhyPanel />
      </aside>
      <DreamFooter />
    </div>
  );
}
