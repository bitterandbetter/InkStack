/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Header } from "./components/Header";
import { DocumentTabs } from "./components/DocumentTabs";
import { Sidebar } from "./components/Sidebar";
import { EditorPane } from "./components/EditorPane";
import { PreviewPane } from "./components/PreviewPane";
import { StatusBar } from "./components/StatusBar";
import { UnsavedChangesDialog } from "./components/UnsavedChangesDialog";
import { SaveConflictDialog } from "./components/SaveConflictDialog";
import { AiContextDialog } from "./components/AiContextDialog";
import { useDesktopEvents } from "./hooks/useDesktopEvents";
import { lazy, Suspense } from "react";
import { useStore } from "./store";

const AIPanel = lazy(() => import("./components/AIPanel").then((module) => ({ default: module.AIPanel })));
const CommandPalette = lazy(() => import("./components/CommandPalette").then((module) => ({ default: module.CommandPalette })));

export default function App() {
  useDesktopEvents();

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-bg-base text-text-primary font-sans">
      <Header />
      <DocumentTabs />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex overflow-hidden">
          <EditorPane />
          <PreviewPane />
        </div>
        <LazyAIPanelMount />
      </div>
      <StatusBar />
      <LazyCommandPaletteMount />
      <UnsavedChangesDialog />
      <SaveConflictDialog />
      <AiContextDialog />
    </div>
  );
}

function LazyAIPanelMount() {
  const aiPanelOpen = useStore((state) => state.aiPanelOpen);
  if (!aiPanelOpen) return null;
  return (
    <Suspense fallback={null}>
      <AIPanel />
    </Suspense>
  );
}

function LazyCommandPaletteMount() {
  const commandPaletteOpen = useStore((state) => state.commandPaletteOpen);
  if (!commandPaletteOpen) return null;
  return (
    <Suspense fallback={null}>
      <CommandPalette />
    </Suspense>
  );
}
