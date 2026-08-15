import {
  createUntitledMarkdownFile,
  openTextPath,
  openWorkspacePath,
  requestAppQuit,
  revealActiveFile,
  saveActiveFile,
  saveActiveFileAs
} from './desktopActions';
import { emitEditorCommand, type AiPanelTab } from './appEvents';
import { openDirectory, openMarkdownFileDialog } from './fs';
import { useStore } from '../store';
import { loadShortcuts, getShortcutForCommand } from './shortcuts';
import { getErrorMessage } from './utils';
import { notifyError } from './notifications';

export type AppCommandId =
  | 'new-file'
  | 'open-file'
  | 'open-workspace'
  | 'save'
  | 'save-as'
  | 'quit-app'
  | 'reveal-file'
  | 'toggle-sidebar'
  | 'toggle-ai'
  | 'open-command-palette'
  | 'toggle-command-palette'
  | 'find'
  | 'history-back'
  | 'history-forward'
  | 'view-split'
  | 'view-edit'
  | 'view-wysiwyg'
  | 'view-read'
  | 'view-code'
  | 'theme-toggle'
  | 'ai-chat'
  | 'ai-outline'
  | 'ai-code'
  | 'ai-settings';

export const APP_COMMAND_SHORTCUTS: Partial<Record<AppCommandId, string>> = {
  'open-file': 'Cmd/Ctrl+O',
  'open-workspace': 'Cmd/Ctrl+Shift+O',
  'new-file': 'Cmd/Ctrl+N',
  save: 'Cmd/Ctrl+S',
  'save-as': 'Cmd/Ctrl+Shift+S',
  'quit-app': 'Cmd/Ctrl+Q',
  'toggle-sidebar': 'Cmd/Ctrl+\\',
  'toggle-ai': 'Cmd/Ctrl+Shift+A',
  'open-command-palette': 'Cmd/Ctrl+K',
  'toggle-command-palette': 'Cmd/Ctrl+K',
  find: 'Cmd/Ctrl+F',
  'view-edit': 'Cmd/Ctrl+1',
  'view-split': 'Cmd/Ctrl+2',
  'view-read': 'Cmd/Ctrl+3',
  'view-code': 'Cmd/Ctrl+4',
  'view-wysiwyg': 'Cmd/Ctrl+5'
};

export function getAppCommandShortcuts(): Partial<Record<AppCommandId, string>> {
  const shortcuts = loadShortcuts();
  const result: Partial<Record<AppCommandId, string>> = {};
  for (const shortcut of shortcuts) {
    result[shortcut.id] = shortcut.currentKeys[0];
  }
  return result;
}

const APP_COMMAND_IDS = new Set<AppCommandId>([
  'new-file',
  'open-file',
  'open-workspace',
  'save',
  'save-as',
  'quit-app',
  'reveal-file',
  'toggle-sidebar',
  'toggle-ai',
  'open-command-palette',
  'toggle-command-palette',
  'find',
  'history-back',
  'history-forward',
  'view-split',
  'view-edit',
  'view-wysiwyg',
  'view-read',
  'view-code',
  'theme-toggle',
  'ai-chat',
  'ai-outline',
  'ai-code',
  'ai-settings'
]);

export function isAppCommandId(command: string): command is AppCommandId {
  return APP_COMMAND_IDS.has(command as AppCommandId);
}

export async function runAppCommand(command: AppCommandId): Promise<boolean | void> {
  try {
    return await executeAppCommand(command);
  } catch (error) {
    console.error(`App command failed: ${command}`, error);
    const locale = useStore.getState().locale;
    notifyError(locale === 'zh'
      ? `操作失败：${getErrorMessage(error)}`
      : `Action failed: ${getErrorMessage(error)}`);
    return false;
  }
}

async function executeAppCommand(command: AppCommandId): Promise<boolean | void> {
  switch (command) {
    case 'new-file':
      return createUntitledMarkdownFile();
    case 'open-file': {
      const path = await openMarkdownFileDialog();
      if (!path) return false;
      return openTextPath(path);
    }
    case 'open-workspace': {
      const path = await openDirectory();
      if (!path) return false;
      return openWorkspacePath(path);
    }
    case 'save':
      return saveActiveFile();
    case 'save-as':
      return saveActiveFileAs();
    case 'quit-app':
      return requestAppQuit();
    case 'reveal-file':
      return revealActiveFile();
    case 'toggle-sidebar':
      useStore.getState().toggleSidebar();
      return true;
    case 'toggle-ai':
      useStore.getState().toggleAiPanel();
      return true;
    case 'open-command-palette':
      useStore.getState().openCommandPalette();
      return true;
    case 'toggle-command-palette':
      useStore.getState().toggleCommandPalette();
      return true;
    case 'find':
      emitEditorCommand({ type: 'find' });
      return true;
    case 'history-back':
      if (useStore.getState().canGoBack) useStore.getState().goBack();
      return true;
    case 'history-forward':
      if (useStore.getState().canGoForward) useStore.getState().goForward();
      return true;
    case 'view-split':
      useStore.getState().setViewMode('split');
      return true;
    case 'view-edit':
      useStore.getState().setViewMode('edit');
      return true;
    case 'view-wysiwyg': {
      const state = useStore.getState();
      if (!state.wysiwygEnabled) {
        notifyError(state.locale === 'zh' ? '所见即所得模式已在编辑设置中关闭。' : 'WYSIWYG mode is disabled in Editor Settings.');
        return false;
      }
      if (!state.activeFile) {
        notifyError(state.locale === 'zh' ? '请先打开一个 Markdown 文档。' : 'Open a Markdown document first.');
        return false;
      }
      if (!state.activeFile.isMarkdown) {
        notifyError(state.locale === 'zh' ? '所见即所得模式仅支持 Markdown 文档。' : 'WYSIWYG mode is available for Markdown documents only.');
        return false;
      }
      if (state.activeFile.readOnly) {
        notifyError(state.locale === 'zh' ? '当前文档为只读，无法进入所见即所得编辑。' : 'This document is read-only and cannot be edited in WYSIWYG mode.');
        return false;
      }
      state.setViewMode('wysiwyg');
      return true;
    }
    case 'view-read':
      useStore.getState().setViewMode('read');
      return true;
    case 'view-code':
      useStore.getState().setViewMode('code');
      return true;
    case 'theme-toggle':
      useStore.getState().toggleThemeMode();
      return true;
    case 'ai-chat':
      openAiTab('ai');
      return true;
    case 'ai-outline':
      openAiTab('outline');
      return true;
    case 'ai-code':
      openAiTab('code');
      return true;
    case 'ai-settings':
      openAiTab('settings');
      return true;
  }
}

function openAiTab(tab: AiPanelTab) {
  useStore.getState().openAiPanelTab(tab);
}
