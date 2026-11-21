import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { Landing } from "@/pages/Landing";
import { Learn } from "@/pages/Learn";
import { KnowledgeMap } from "@/pages/KnowledgeMap";
import { Workspace } from "@/pages/Workspace";
import { FallingCards } from "@/components/wonder";
import { DreamClouds, useLookingGlass, WonderSides } from "@/components/scenery";
import { HeartsBurst } from "@/components/extras";
import { Journal } from "@/pages/Journal";

export default function App() {
  const { on: dark } = useLookingGlass();
  return (
    <BrowserRouter>
      <DreamClouds />
      <WonderSides />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/learn" element={<Learn />} />
        <Route path="/learn/:sessionId" element={<Workspace />} />
        <Route path="/map" element={<KnowledgeMap />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-right" theme={dark ? "dark" : "light"} richColors closeButton mobileOffset={{ top: 124 }} />
      <FallingCards />
      <HeartsBurst />
    </BrowserRouter>
  );
}
