import { BookHeart, LogOut, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheshireGrin, Tart } from "@/components/wonder";
import { LookingGlassToggle } from "@/components/scenery";
import { api, type Me } from "@/lib/api";

export function Header() {
  const [me, setMe] = useState<Me | null>(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api<Me>("/api/me").then(setMe).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("socra:balance", load);
    return () => window.removeEventListener("socra:balance", load);
  }, [load]);

  async function logout() {
    await api("/api/auth/logout", {}).catch(() => {});
    navigate("/");
  }

  return (
    <header className="sticky top-0 z-40 bg-[var(--night)]/95 text-[#faf8f1] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link to="/learn" className="flex items-center gap-2">
          <CheshireGrin className="grin-mirror size-8" />
          <span className="font-display text-2xl leading-none">Curiouser</span>
        </Link>
        {me && (
          <div className="flex items-center gap-1.5 text-sm sm:gap-2">
            <Link to="/journal" className="flex items-center gap-1 rounded-full px-2 py-1 text-[#d6ecf7] hover:bg-white/10 hover:text-white" title="Your dream journal">
              <BookHeart className="size-4" />
              <span className="hidden md:inline">Dream journal</span>
            </Link>
            <LookingGlassToggle className="text-[#d6ecf7] hover:text-white" />
            <span
              className="flex items-center gap-1.5 rounded-full bg-[#faf8f1] px-3 py-1 font-semibold text-[var(--night)]"
              title={`Tarts earned today: ${me.earnedToday} / ${me.dailyCap}`}
            >
              <Tart />
              {me.balance.toLocaleString()} <span className="hidden sm:inline">TARTS</span>
            </span>
            <a
              href={me.walletUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1 text-[#d6ecf7] hover:text-white sm:flex"
              title={`Your Solana devnet wallet: ${me.walletPubkey}`}
            >
              <Wallet className="size-4" />
              {me.username}
            </a>
            <Button variant="ghost" size="icon-sm" onClick={logout} aria-label="Wake up (log out)" title="Wake up (log out)" className="text-[#d6ecf7] hover:bg-white/10 hover:text-white">
              <LogOut />
            </Button>
          </div>
        )}
      </div>
      <div className="checker" />
    </header>
  );
}
