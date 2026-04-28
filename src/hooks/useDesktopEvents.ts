import { useEffect, useRef } from 'react';
import { getCurrentWindow, isTauriRuntime, listen } from '../lib/tauriRuntime';
import { getSettings, takeStartupMarkdownPaths } from '../lib/fs';
import {
  checkActiveFileExternalModification,
  openTextPath,
  openWorkspacePath,
  requestAppQuit,
  refreshWorkspaceTree,
  saveActiveFile
} from '../lib/desktopActions';
import { useStore } from '../store';
import { isAppCommandId, runAppCommand } from '../lib/appCommands';

type DragDropPayload = {
  paths?: string[];
  position?: { x: number; y: number };
};

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

export function useDesktopEvents() {
  const {
    toggleCommandPalette,
    autoSaveEnabled,
    isDirty,
    activeFile,
    activeFileContent
  } = useStore();
  const autoSaveRetryRef = useRef<number | null>(null);

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
    if (autoSaveRetryRef.current) {
      window.clearTimeout(autoSaveRetryRef.current);
      autoSaveRetryRef.current = null;
    }
    if (!autoSaveEnabled || !isDirty || !activeFile?.path || activeFile.readOnly || !activeFile.isMarkdown) return;

    const timeoutId = window.setTimeout(() => {
      const state = useStore.getState();
      if (!state.autoSaveEnabled || !state.isDirty || !state.activeFile?.path || state.activeFile.readOnly || !state.activeFile.isMarkdown) return;
      const snapshotPath = state.activeFile.path;
      const snapshotContent = state.activeFileContent;
      void saveActiveFile('auto').then((saved) => {
        if (saved) return;
        autoSaveRetryRef.current = window.setTimeout(() => {
          const latest = useStore.getState();
          if (
            !latest.autoSaveEnabled ||
            !latest.isDirty ||
            !latest.activeFile?.path ||
            latest.activeFile.path !== snapshotPath ||
            latest.activeFileContent !== snapshotContent ||
            latest.activeFile.readOnly ||
            !latest.activeFile.isMarkdown
          ) {
            return;
          }
          void saveActiveFile('auto');
        }, 5000);
      });
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [activeFile?.isMarkdown, activeFile?.path, activeFile?.readOnly, activeFileContent, autoSaveEnabled, isDirty]);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    const disposers: Array<() => void> = [];
    let openedFromLaunchEvent = false;
    let workspaceRefreshTimer: number | null = null;

    void listen<string>('inkstack://menu', (event) => {
      if (!isAppCommandId(event.payload)) return;
      void runAppCommand(event.payload);
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
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    let unlisten: (() => void) | null = null;

    void getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      await requestAppQuit();
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
