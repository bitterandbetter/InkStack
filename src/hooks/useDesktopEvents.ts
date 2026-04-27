import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect } from 'react';
import { getSettings, openDirectory, openMarkdownFileDialog, takeStartupMarkdownPaths } from '../lib/fs';
import {
  checkActiveFileExternalModification,
  createUntitledMarkdownFile,
  ensureCanReplaceWorkspaceDocuments,
  openTextPath,
  openWorkspacePath,
  refreshWorkspaceTree,
  revealActiveFile,
  saveActiveFile,
  saveActiveFileAs
} from '../lib/desktopActions';
import { useStore } from '../store';

type DragDropPayload = {
  paths?: string[];
  position?: { x: number; y: number };
};

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

export function useDesktopEvents() {
  const {
    toggleSidebar,
    toggleAiPanel,
    toggleCommandPalette,
    autoSaveEnabled,
    isDirty,
    activeFile,
    activeFileContent
  } = useStore();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        toggleCommandPalette();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCommandPalette]);

  useEffect(() => {
    if (!autoSaveEnabled || !isDirty || !activeFile?.path || activeFile.readOnly || !activeFile.isMarkdown) return;

    const timeoutId = window.setTimeout(() => {
      const state = useStore.getState();
      if (!state.autoSaveEnabled || !state.isDirty || !state.activeFile?.path || state.activeFile.readOnly || !state.activeFile.isMarkdown) return;
      void saveActiveFile();
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [activeFile?.isMarkdown, activeFile?.path, activeFile?.readOnly, activeFileContent, autoSaveEnabled, isDirty]);

  useEffect(() => {
    const disposers: Array<() => void> = [];
    let openedFromLaunchEvent = false;
    let workspaceRefreshTimer: number | null = null;

    void listen<string>('inkstack://menu', (event) => {
      if (event.payload === 'new-file') void createUntitledMarkdownFile();
      if (event.payload === 'open-workspace') {
        void openDirectory().then((path) => {
          if (path) void openWorkspacePath(path);
        });
      }
      if (event.payload === 'open-file') {
        void openMarkdownFileDialog().then((path) => {
          if (path) void openTextPath(path);
        });
      }
      if (event.payload === 'save') void saveActiveFile();
      if (event.payload === 'save-as') void saveActiveFileAs();
      if (event.payload === 'reveal-file') void revealActiveFile();
      if (event.payload === 'toggle-sidebar') toggleSidebar();
      if (event.payload === 'toggle-ai') toggleAiPanel();
    }).then((dispose) => disposers.push(dispose));

    void listen<string[]>('inkstack://open-paths', (event) => {
      openedFromLaunchEvent = event.payload.length > 0;
      for (const [index, path] of event.payload.entries()) {
        void openTextPath(path, null, { skipUnsavedCheck: index > 0 });
      }
    }).then((dispose) => disposers.push(dispose));

    void listen<DragDropPayload>('tauri://drag-drop', (event) => {
      const paths = event.payload.paths ?? [];
      const firstPath = paths[0];
      if (!firstPath) return;
      if (paths.some((path) => IMAGE_EXTENSION_PATTERN.test(path))) return;

      void openTextPath(firstPath).catch(() => {
        void openWorkspacePath(firstPath);
      });
    }).then((dispose) => disposers.push(dispose));

    void listen<string>('inkstack://workspace-changed', (event) => {
      if (workspaceRefreshTimer) window.clearTimeout(workspaceRefreshTimer);
      workspaceRefreshTimer = window.setTimeout(() => {
        workspaceRefreshTimer = null;
        void refreshWorkspaceTree(event.payload).catch((err) => {
          console.error('Failed to refresh workspace tree', err);
        });
        void checkActiveFileExternalModification();
      }, 350);
    }).then((dispose) => disposers.push(dispose));

    // File association launch args may arrive before listeners are attached.
    // Drain them once before falling back to the last saved workspace/session.
    void Promise.all([takeStartupMarkdownPaths(), getSettings()])
      .then(([startupPaths, settings]) => {
        if (startupPaths.length > 0) {
          openedFromLaunchEvent = true;
          for (const [index, path] of startupPaths.entries()) {
            void openTextPath(path, null, { skipUnsavedCheck: index > 0 });
          }
          return;
        }

        if (openedFromLaunchEvent) return;
        if (settings.lastWorkspace) void openWorkspacePath(settings.lastWorkspace, { skipUnsavedCheck: true });
        if (settings.lastFile) {
          void openTextPath(settings.lastFile, null, { skipUnsavedCheck: true });
        }
      })
      .catch((err) => console.error('Failed to restore previous session', err));

    return () => {
      if (workspaceRefreshTimer) window.clearTimeout(workspaceRefreshTimer);
      for (const dispose of disposers) dispose();
    };
  }, [toggleAiPanel, toggleSidebar]);

  useEffect(() => {
    let allowClose = false;
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void getCurrentWindow().onCloseRequested(async (event) => {
      if (allowClose) return;
      const dirtyTabs = useStore.getState().documentTabs.some((tab) => tab.isDirty) || useStore.getState().isDirty;
      if (!dirtyTabs) return;

      event.preventDefault();
      const canClose = await ensureCanReplaceWorkspaceDocuments();
      if (!canClose) return;

      allowClose = true;
      await getCurrentWindow().close();
    }).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
