/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { EditorPane } from "./components/EditorPane";
import { PreviewPane } from "./components/PreviewPane";
import { AIPanel } from "./components/AIPanel";
import { StatusBar } from "./components/StatusBar";
import { CommandPalette } from "./components/CommandPalette";
import { UnsavedChangesDialog } from "./components/UnsavedChangesDialog";
import { SaveConflictDialog } from "./components/SaveConflictDialog";
import { AiContextDialog } from "./components/AiContextDialog";
import { useDesktopEvents } from "./hooks/useDesktopEvents";

export default function App() {
  useDesktopEvents();

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-bg-base text-text-primary font-sans">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex overflow-hidden">
          <EditorPane />
          <PreviewPane />
        </div>
        <AIPanel />
      </div>
      <StatusBar />
      <CommandPalette />
      <UnsavedChangesDialog />
      <SaveConflictDialog />
      <AiContextDialog />
    </div>
  );
}
