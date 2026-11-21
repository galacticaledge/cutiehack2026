import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { Landing } from "@/pages/Landing";
import { Learn } from "@/pages/Learn";
import { Workspace } from "@/pages/Workspace";
import { FallingCards } from "@/components/wonder";
import { DreamClouds, WonderSides } from "@/components/scenery";
import { Journal } from "@/pages/Journal";

export default function App() {
  return (
    <BrowserRouter>
      <DreamClouds />
      <WonderSides />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/learn" element={<Learn />} />
        <Route path="/learn/:sessionId" element={<Workspace />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-right" theme="light" richColors closeButton />
      <FallingCards />
    </BrowserRouter>
  );
}
