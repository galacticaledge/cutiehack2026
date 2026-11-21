import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export function Landing() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 px-4 py-16">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">Socra</h1>
        <p className="text-lg text-muted-foreground">
          An AI tutor that never gives you the answer. It guides you to it, and pays you in crypto for actually learning.
        </p>
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <Input
          autoFocus
          placeholder="Pick a username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="h-10"
          aria-label="Username"
        />
        <Button type="submit" size="lg" className="h-10 px-4" disabled={loading || !username.trim()}>
          {loading ? "Starting…" : "Start learning"}
        </Button>
      </form>
      {error && <p className="-mt-6 text-sm text-destructive">{error}</p>}

      <ol className="grid gap-3 text-sm sm:grid-cols-3">
        <li className="rounded-lg border p-3">
          <span className="font-semibold">1. Work it out.</span> Chat with a Socratic tutor that asks, never tells.
        </li>
        <li className="rounded-lg border p-3">
          <span className="font-semibold">2. Explain why.</span> Show you understand, not just the final number.
        </li>
        <li className="rounded-lg border p-3">
          <span className="font-semibold">3. Get paid.</span> LEARN tokens land in your Solana devnet wallet.
        </li>
      </ol>
      <p className="text-xs text-muted-foreground">
        Built on UC Irvine research showing slow, Socratic AI tutoring improves learning. Testnet tokens only.
      </p>
    </main>
  );
}
