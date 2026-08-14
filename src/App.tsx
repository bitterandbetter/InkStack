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
import { CloseConfirmDialog } from "./components/CloseConfirmDialog";
import { ToastProvider, useToast } from "./components/Toast";
import { setToastRef } from "./lib/notifications";
import { useDesktopEvents } from "./hooks/useDesktopEvents";
import { useShortcuts } from "./lib/hooks/useShortcuts";
import { lazy, Suspense, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useStore } from "./store";
import { getCurrentWindow, isTauriRuntime } from "./lib/tauriRuntime";

const AIPanel = lazy(() => import("./components/AIPanel").then((module) => ({ default: module.AIPanel })));
const CommandPalette = lazy(() => import("./components/CommandPalette").then((module) => ({ default: module.CommandPalette })));
const KnowledgeGraphView = lazy(() => import("./components/KnowledgeGraphView").then((module) => ({ default: module.KnowledgeGraphView })));

export default function App() {
  useDesktopEvents();
  useShortcuts();
  const appShellRef = useRef<HTMLDivElement>(null);
  const aiPanelOpen = useStore((state) => state.aiPanelOpen);
  const knowledgeGraphOpen = useStore((state) => state.knowledgeGraphOpen);
  const viewMode = useStore((state) => state.viewMode);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [splitRatio, setSplitRatio] = useState(() => {
    const saved = localStorage.getItem('inkstack.split.ratio.v1');
    const value = Number(saved);
    return Number.isFinite(value) ? Math.max(0.25, Math.min(0.75, value)) : 0.5;
  });
  useNativeWindowViewport();
  useLayoutDiagnostics(appShellRef, aiPanelOpen);

  useEffect(() => {
    localStorage.setItem('inkstack.split.ratio.v1', String(splitRatio));
  }, [splitRatio]);

  const handleSplitDragStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (viewMode !== 'split') return;
    event.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const min = 0.2;
    const max = 0.8;

    const move = (moveEvent: MouseEvent) => {
      const next = (moveEvent.clientX - rect.left) / rect.width;
      setSplitRatio(Math.min(max, Math.max(min, next)));
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.classList.remove('inkstack-split-resizing');
    };

    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.body.classList.add('inkstack-split-resizing');
  };

  if (!isTauriRuntime()) {
    return <DesktopRuntimeRequired />;
  }

  return (
    <ToastProvider>
      <ToastRefSetup />
      <div ref={appShellRef} className="inkstack-app-shell flex h-[100dvh] w-screen flex-col overflow-hidden bg-bg-base text-text-primary font-sans">
        <Header />
        <DocumentTabs />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Sidebar />
          {viewMode === 'split' ? (
            <div ref={splitContainerRef} className="flex min-h-0 flex-1 overflow-hidden">
              <div className="min-h-0 min-w-0 shrink-0 overflow-hidden" style={{ width: `${splitRatio * 100}%` }}>
                <EditorPane />
              </div>
              <div
                role="separator"
                aria-orientation="vertical"
                onMouseDown={handleSplitDragStart}
                className="inkstack-split-divider group flex w-2 shrink-0 cursor-col-resize items-center justify-center transition-colors hover:bg-accent/10"
              >
                <span className="h-8 w-[3px] rounded-full bg-border-subtle transition-all group-hover:bg-accent/50 group-active:bg-accent group-active:h-12" />
              </div>
              <div className="min-h-0 min-w-0 shrink-0 overflow-hidden" style={{ width: `${(1 - splitRatio) * 100}%` }}>
                <PreviewPane />
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <EditorPane />
              <PreviewPane />
            </div>
          )}
          <LazyAIPanelMount />
          {knowledgeGraphOpen && <LazyKnowledgeGraphMount />}
        </div>
        <StatusBar />
        <LazyCommandPaletteMount />
        <CloseConfirmDialog />
        <UnsavedChangesDialog />
        <SaveConflictDialog />
        <AiContextDialog />
      </div>
    </ToastProvider>
  );
}

function useNativeWindowViewport() {
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    let unlistenResize: (() => void) | null = null;
    const appWindow = getCurrentWindow();

    const syncNativeSize = async () => {
      try {
        const [size, scaleFactor] = await Promise.all([
          appWindow.innerSize(),
          appWindow.scaleFactor()
        ]);
        if (disposed) return;
        const logicalHeight = Math.max(1, Math.round(size.height / scaleFactor));
        const logicalWidth = Math.max(1, Math.round(size.width / scaleFactor));
        document.documentElement.style.setProperty('--inkstack-native-window-height', `${logicalHeight}px`);
        document.documentElement.style.setProperty('--inkstack-native-window-width', `${logicalWidth}px`);
      } catch (error) {
        console.warn('Failed to sync native window size', error);
      }
    };

    void syncNativeSize();
    void appWindow.onResized(() => {
      void syncNativeSize();
    }).then((unlisten) => {
      if (disposed) unlisten();
      else unlistenResize = unlisten;
    });

    return () => {
      disposed = true;
      unlistenResize?.();
    };
  }, []);
}

function useLayoutDiagnostics(appShellRef: React.RefObject<HTMLDivElement | null>, aiPanelOpen: boolean) {
  useEffect(() => {
    if (!import.meta.env.DEV || !aiPanelOpen) return;
    const readRect = (selector: string) => {
      const element = document.querySelector(selector);
      const rect = element?.getBoundingClientRect();
      if (!rect) return null;
      return {
        top: Math.round(rect.top),
        height: Math.round(rect.height),
        bottom: Math.round(rect.bottom)
      };
    };
    const timer = window.setTimeout(() => {
      const appRect = appShellRef.current?.getBoundingClientRect();
      console.info('[InkStack layout]', {
        innerHeight: window.innerHeight,
        outerHeight: window.outerHeight,
        visualViewportHeight: window.visualViewport?.height,
        documentHeight: document.documentElement.clientHeight,
        bodyHeight: document.body.clientHeight,
        root: readRect('#root'),
        app: appRect ? {
          top: Math.round(appRect.top),
          height: Math.round(appRect.height),
          bottom: Math.round(appRect.bottom)
        } : null,
        status: readRect('footer'),
        aiPanel: readRect('aside'),
        scrollY: window.scrollY,
        documentScrollTop: document.documentElement.scrollTop,
        bodyScrollTop: document.body.scrollTop
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [aiPanelOpen, appShellRef]);
}

function DesktopRuntimeRequired() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-bg-base px-6 text-text-primary">
      <div className="w-full max-w-xl rounded-lg border border-border-subtle bg-bg-panel p-5 shadow-sm">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-text-tertiary">InkStack Desktop</div>
        <h1 className="mt-2 text-[18px] font-semibold">需要在 Tauri 桌面窗口中运行</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
          当前页面没有检测到 Tauri 桌面 API 注入。请从项目根目录运行桌面开发命令，而不是直接用浏览器打开 Vite 地址。
        </p>
        <pre className="mt-4 rounded border border-border-subtle bg-bg-base p-3 font-mono text-[12px] text-text-secondary">
          npm run tauri:dev
        </pre>
      </div>
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

function LazyKnowledgeGraphMount() {
  const locale = useStore((state) => state.locale);
  const closeKnowledgeGraph = useStore((state) => state.toggleKnowledgeGraph);
  return (
    <Suspense fallback={null}>
      <KnowledgeGraphView locale={locale} onClose={closeKnowledgeGraph} />
    </Suspense>
  );
}

function ToastRefSetup() {
  const toast = useToast();
  useEffect(() => {
    setToastRef(toast);
    return () => setToastRef(null);
  }, [toast]);
  return null;
}

