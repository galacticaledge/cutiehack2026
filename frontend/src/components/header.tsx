import { BookHeart, DoorOpen, LogOut, Map as MapIcon, UserRound, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tart } from "@/components/wonder";
import { SocraMark } from "@/components/logo";
import { LookingGlassToggle } from "@/components/scenery";
import { SoundToggle } from "@/components/sound";
import { api, getFeatures, isGuestName, mapAvailable, type Me } from "@/lib/api";

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `header-tab relative flex items-center gap-1 rounded-full px-2 py-1 transition ${
    isActive ? "is-active bg-white/15 font-semibold text-white" : "text-[#d6ecf7] hover:bg-white/10 hover:text-white"
  }`;

export function Header() {
  const [me, setMe] = useState<Me | null>(null);
  const [hasMap, setHasMap] = useState(false);
  const [solana, setSolana] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api<Me>("/api/me").then(setMe).catch(() => {});
  }, []);

  useEffect(() => {
    void mapAvailable().then(setHasMap);
    void getFeatures().then((f) => setSolana(Boolean(f?.solana)));
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
      <div className="mx-auto flex h-14 max-w-[90rem] items-center justify-between gap-3 px-4">
        <Link to="/learn" className="flex items-center gap-2">
          <SocraMark className="size-9 text-[#d6ecf7]" />
          <span className="font-display text-2xl leading-none">Socra</span>
        </Link>
        {me && (
          <div className="flex items-center gap-1.5 text-sm sm:gap-2">
            <NavLink to="/learn" className={tabClass} title="The Hall of Doors">
              <DoorOpen className="size-4" />
              <span className="hidden lg:inline">Doors</span>
            </NavLink>
            {hasMap && (
              <NavLink to="/map" className={tabClass} title="The Map of Wonderland">
                <MapIcon className="size-4" />
                <span className="hidden lg:inline">Map</span>
              </NavLink>
            )}
            <NavLink to="/journal" className={tabClass} title="Your dream journal">
              <BookHeart className="size-4" />
              <span className="hidden md:inline">Dream journal</span>
            </NavLink>
            <SoundToggle className="text-[#d6ecf7] hover:text-white" />
            <LookingGlassToggle className="text-[#d6ecf7] hover:text-white" />
            <NavLink
              to="/tarts"
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-full bg-[#faf8f1] px-3 py-1 font-semibold text-[var(--night)] ring-[var(--gold-soft)] transition hover:ring-2 ${isActive ? "ring-2 ring-offset-2 ring-offset-[var(--night)]" : ""}`
              }
              title={`The Tart Treasury · earned today: ${me.earnedToday} / ${me.dailyCap}`}
            >
              <Tart />
              {me.balance.toLocaleString()} <span className="hidden sm:inline">TARTS</span>
            </NavLink>
            <Link
              to="/journal"
              className="hidden items-center gap-1 rounded-full px-2 py-1 text-[#d6ecf7] hover:bg-white/10 hover:text-white sm:flex"
              title={isGuestName(me.username) ? `${me.username} (guest)` : `${me.username}: your dream journal`}
            >
              <UserRound className="size-4" />
              <span className="max-w-[9rem] truncate">{me.username}</span>
            </Link>
            {solana && !isGuestName(me.username) && (
              <a
                href={me.walletUrl}
                target="_blank"
                rel="noreferrer"
                className="flex size-8 items-center justify-center rounded-full text-[#d6ecf7] hover:bg-white/10 hover:text-white"
                aria-label="Your Solana wallet on the explorer (opens in a new tab)"
                title={`Your Solana devnet wallet: ${me.walletPubkey}`}
              >
                <Wallet className="size-4" />
              </a>
            )}
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
