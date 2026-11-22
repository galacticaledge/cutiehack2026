import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { Landing } from "@/pages/Landing";
import { FallingCards } from "@/components/wonder";
import { DreamClouds, WonderSides } from "@/components/scenery";
import { useLookingGlass } from "@/lib/theme";
import { Flashbang, HeartsBurst, WakeUp } from "@/components/celebrations";
import { DealtCards } from "@/components/skeletons";
import { PresenterPanel } from "@/components/presenter";

const loadLearn = () => import("@/pages/Learn").then((m) => ({ default: m.Learn }));
const loadWorkspace = () => import("@/pages/Workspace").then((m) => ({ default: m.Workspace }));
const loadJournal = () => import("@/pages/Journal").then((m) => ({ default: m.Journal }));
const loadMap = () => import("@/pages/WonderMap").then((m) => ({ default: m.WonderMap }));
const loadTarts = () => import("@/pages/Tarts").then((m) => ({ default: m.Tarts }));
const Learn = lazy(loadLearn);
const Workspace = lazy(loadWorkspace);
const Journal = lazy(loadJournal);
const WonderMap = lazy(loadMap);
const Tarts = lazy(loadTarts);

function usePrefetchPages() {
  useEffect(() => {
    const warm = () => {
      void loadLearn();
      void loadWorkspace();
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(warm);
    else setTimeout(warm, 1500);
  }, []);
}

function PageLoading() {
  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-4 py-24 sm:grid-cols-2 lg:grid-cols-3">
      <DealtCards count={3} className="h-64" label="Opening the next page" />
    </div>
  );
}

export default function App() {
  const { on: dark } = useLookingGlass();
  usePrefetchPages();
  return (
    <BrowserRouter>
      <DreamClouds />
      <WonderSides />
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/learn/:sessionId" element={<Workspace />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/map" element={<WonderMap />} />
          <Route path="/tarts" element={<Tarts />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toaster position="top-right" theme={dark ? "dark" : "light"} richColors closeButton mobileOffset={{ top: 124 }} />
      <FallingCards />
      <HeartsBurst />
      <WakeUp />
      <Flashbang />
      <PresenterPanel />
    </BrowserRouter>
  );
}
