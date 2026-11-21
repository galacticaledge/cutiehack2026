import { Coins, LogOut, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
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
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link to="/learn" className="text-lg font-semibold tracking-tight">
          Socra
        </Link>
        {me && (
          <div className="flex items-center gap-2 text-sm">
            <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 font-medium" title={`Earned today: ${me.earnedToday} / ${me.dailyCap}`}>
              <Coins className="size-4" />
              {me.balance.toLocaleString()} LEARN
            </span>
            <a
              href={me.walletUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1 text-muted-foreground hover:text-foreground sm:flex"
              title={me.walletPubkey}
            >
              <Wallet className="size-4" />
              {me.username}
            </a>
            <Button variant="ghost" size="icon-sm" onClick={logout} aria-label="Log out">
              <LogOut />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
