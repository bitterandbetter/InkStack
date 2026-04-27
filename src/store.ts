import { create } from 'zustand';
import { AiConfig, loadAiConfig, saveAiConfig } from './lib/ai';
import {
  EditorAiPrompts,
  loadEditorAiPrompts,
  saveEditorAiPrompts
} from './lib/aiPrompts';
import { FileMetadata, FileNode } from './lib/fs';
import {
  applyThemeState,
  loadThemeState,
  saveThemeState,
  ThemeOption,
  ThemeState
} from './lib/themes';

type ViewMode = 'split' | 'edit' | 'read';
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
export type UnsavedChangeChoice = 'save' | 'discard' | 'cancel';
export type AiContextChoice = 'confirm' | 'cancel';
export type ReadingFont = 'sans' | 'serif';

export interface ReadingSettings {
  width: number;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  font: ReadingFont;
}

export interface AiContextItem {
  label: string;
  detail: string;
  content: string;
}

interface EditorSelection {
  from: number;
  to: number;
  text: string;
}

export interface DocumentTab {
  id: string;
  file: FileNode;
  content: string;
  metadata: FileMetadata | null;
  isDirty: boolean;
  saveState: SaveState;
  saveMessage: string;
  currentEditorLine: number | null;
}

interface AppState {
  // Locale
  locale: 'zh' | 'en';
  setLocale: (l: 'zh' | 'en') => void;
  
  // File System
  rootPath: string | null;
  fileTree: FileNode[];
  activeFile: FileNode | null;
  activeFileContent: string;
  activeFileMetadata: FileMetadata | null;
  documentTabs: DocumentTab[];
  activeTabId: string | null;
  navigationBack: string[];
  navigationForward: string[];
  canGoBack: boolean;
  canGoForward: boolean;
  pendingEditorLine: number | null;
  currentEditorLine: number | null;
  editorSelection: EditorSelection | null;
  isDirty: boolean; // if the file has unsaved changes
  saveState: SaveState;
  saveMessage: string;
  unsavedChangePrompt: {
    title: string;
    message: string;
    resolve: (choice: UnsavedChangeChoice) => void;
  } | null;
  saveConflict: {
    path: string;
    fileName: string;
    message: string;
  } | null;
  aiContextPrompt: {
    title: string;
    message: string;
    items: AiContextItem[];
    resolve: (choice: AiContextChoice) => void;
  } | null;
  
  setRootPath: (path: string | null) => void;
  setFileTree: (tree: FileNode[]) => void;
  setDirectoryChildren: (path: string, children: FileNode[]) => void;
  setActiveFile: (file: FileNode, content: string, metadata?: FileMetadata | null) => void;
  switchDocumentTab: (id: string) => void;
  closeDocumentTab: (id: string) => void;
  updateDocumentTabPath: (oldPath: string, newPath: string, name: string) => void;
  closeDocumentTabsByPath: (path: string) => void;
  goBack: () => void;
  goForward: () => void;
  clearActiveFile: () => void;
  setPendingEditorLine: (line: number | null) => void;
  setCurrentEditorLine: (line: number | null) => void;
  setEditorSelection: (selection: EditorSelection | null) => void;
  createUntitledFile: () => void;
  setActiveFileContent: (content: string) => void;
  replaceActiveFileRange: (from: number, to: number, replacement: string) => void;
  markSaving: () => void;
  markSaved: (metadata?: FileMetadata | null) => void;
  markSaveError: (message: string) => void;
  openSaveConflict: (conflict: { path: string; fileName: string; message: string }) => void;
  closeSaveConflict: () => void;
  requestUnsavedChangeChoice: (title: string, message: string) => Promise<UnsavedChangeChoice>;
  resolveUnsavedChangeChoice: (choice: UnsavedChangeChoice) => void;
  requestAiContextChoice: (title: string, message: string, items: AiContextItem[]) => Promise<AiContextChoice>;
  resolveAiContextChoice: (choice: AiContextChoice) => void;
  
  // UI State
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  aiPanelOpen: boolean;
  toggleAiPanel: () => void;
  commandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  aiConfig: AiConfig;
  setAiConfig: (config: AiConfig) => void;
  editorAiPrompts: EditorAiPrompts;
  setEditorAiPrompts: (prompts: EditorAiPrompts) => void;
  autoSaveEnabled: boolean;
  setAutoSaveEnabled: (enabled: boolean) => void;
  themeState: ThemeState;
  setThemeState: (state: ThemeState) => void;
  setActiveThemeId: (themeId: string, importedThemeCss?: string) => void;
  setImportedThemes: (themes: ThemeOption[]) => void;
  readingSettings: ReadingSettings;
  setReadingSettings: (settings: Partial<ReadingSettings>) => void;
  resetReadingSettings: () => void;
  isDarkMode: boolean;
  toggleThemeMode: () => void;
}

const initialThemeState = loadThemeState();
applyThemeState(initialThemeState);
const READING_SETTINGS_STORAGE_KEY = 'inkstack.reading.settings.v1';
const DEFAULT_READING_SETTINGS: ReadingSettings = {
  width: 896,
  fontSize: 15,
  lineHeight: 1.75,
  paragraphSpacing: 1,
  font: 'sans'
};
const initialReadingSettings = loadReadingSettings();
const AUTO_SAVE_STORAGE_KEY = 'inkstack.autosave.enabled.v1';

export const useStore = create<AppState>((set) => ({
  locale: 'zh',
  setLocale: (l) => set({ locale: l }),
  
  rootPath: null,
  fileTree: [],
  activeFile: null,
  activeFileContent: '',
  activeFileMetadata: null,
  documentTabs: [],
  activeTabId: null,
  navigationBack: [],
  navigationForward: [],
  canGoBack: false,
  canGoForward: false,
  pendingEditorLine: null,
  currentEditorLine: null,
  editorSelection: null,
  isDirty: false,
  saveState: 'idle',
  saveMessage: '',
  unsavedChangePrompt: null,
  saveConflict: null,
  aiContextPrompt: null,
  
  setRootPath: (path) => set({ rootPath: path }),
  setFileTree: (t) => set({ fileTree: t }),
  setDirectoryChildren: (path, children) => set((state) => ({
    fileTree: updateDirectoryChildren(state.fileTree, path, children)
  })),
  setActiveFile: (f, c, metadata = null) => set((state) => {
    const tabId = tabIdForFile(f);
    const current = snapshotActiveTab(state);
    const withoutTarget = current.filter((tab) => tab.id !== tabId);
    const existing = current.find((tab) => tab.id === tabId);
    const nextTab: DocumentTab = {
      id: tabId,
      file: f,
      content: c,
      metadata,
      isDirty: false,
      saveState: 'saved',
      saveMessage: '',
      currentEditorLine: 1
    };
    const documentTabs = [nextTab, ...withoutTarget].slice(0, 24);
    const navigation = pushNavigation(state, tabId);

    return {
      activeFile: f,
      activeFileContent: c,
      activeFileMetadata: metadata,
      documentTabs: existing ? documentTabs : documentTabs,
      activeTabId: tabId,
      currentEditorLine: 1,
      editorSelection: null,
      isDirty: false,
      saveState: 'saved',
      saveMessage: '',
      ...navigation
    };
  }),
  switchDocumentTab: (id) => set((state) => {
    const tabs = snapshotActiveTab(state);
    const tab = tabs.find((item) => item.id === id);
    if (!tab || state.activeTabId === id) return { documentTabs: tabs };
    return {
      ...activateTab(tab),
      documentTabs: tabs,
      ...pushNavigation(state, id)
    };
  }),
  closeDocumentTab: (id) => set((state) => {
    const tabs = snapshotActiveTab(state);
    const nextTabs = tabs.filter((tab) => tab.id !== id);
    if (state.activeTabId !== id) {
      return {
        documentTabs: nextTabs,
        ...normalizeNavigation(state.navigationBack, state.navigationForward, nextTabs, state.activeTabId)
      };
    }

    const fallback = nextTabs[0] ?? null;
    const navigation = normalizeNavigation(state.navigationBack, state.navigationForward, nextTabs, fallback?.id ?? null);
    if (!fallback) {
      return {
        activeFile: null,
        activeFileContent: '',
        activeFileMetadata: null,
        activeTabId: null,
        documentTabs: [],
        currentEditorLine: null,
        editorSelection: null,
        isDirty: false,
        saveState: 'idle',
        saveMessage: '',
        ...navigation
      };
    }

    return {
      ...activateTab(fallback),
      documentTabs: nextTabs,
      ...navigation
    };
  }),
  updateDocumentTabPath: (oldPath, newPath, name) => set((state) => {
    const tabs = snapshotActiveTab(state).map((tab) => {
      if (!isSameOrChildPath(tab.file.path, oldPath)) return tab;
      const nextPath = replacePathPrefix(tab.file.path, oldPath, newPath);
      return {
        ...tab,
        id: tab.file.path === oldPath ? newPath : nextPath,
        file: {
          ...tab.file,
          path: nextPath,
          name: tab.file.path === oldPath ? name : tab.file.name
        }
      };
    });
    const activeWasUpdated = Boolean(state.activeFile?.path && isSameOrChildPath(state.activeFile.path, oldPath));
    const activePath = activeWasUpdated && state.activeFile
      ? replacePathPrefix(state.activeFile.path, oldPath, newPath)
      : null;
    const activeTabId = state.activeTabId && isSameOrChildPath(state.activeTabId, oldPath)
      ? replacePathPrefix(state.activeTabId, oldPath, newPath)
      : state.activeTabId;
    const navigation = normalizeNavigation(
      state.navigationBack.map((id) => (isSameOrChildPath(id, oldPath) ? replacePathPrefix(id, oldPath, newPath) : id)),
      state.navigationForward.map((id) => (isSameOrChildPath(id, oldPath) ? replacePathPrefix(id, oldPath, newPath) : id)),
      tabs,
      activeTabId
    );

    return {
      documentTabs: tabs,
      activeTabId,
      activeFile: activeWasUpdated && state.activeFile
        ? { ...state.activeFile, path: activePath ?? newPath, name: state.activeFile.path === oldPath ? name : state.activeFile.name }
        : state.activeFile,
      ...navigation
    };
  }),
  closeDocumentTabsByPath: (path) => set((state) => {
    const tabs = snapshotActiveTab(state);
    const target = tabs.find((tab) => isSameOrChildPath(tab.file.path, path));
    if (!target) return { documentTabs: tabs };
    const nextTabs = tabs.filter((tab) => !isSameOrChildPath(tab.file.path, path));
    const activeWasClosed = Boolean(state.activeFile?.path && isSameOrChildPath(state.activeFile.path, path));
    if (!activeWasClosed) {
      return {
        documentTabs: nextTabs,
        ...normalizeNavigation(state.navigationBack, state.navigationForward, nextTabs, state.activeTabId)
      };
    }

    const fallback = nextTabs[0] ?? null;
    const navigation = normalizeNavigation(state.navigationBack, state.navigationForward, nextTabs, fallback?.id ?? null);
    if (!fallback) {
      return {
        activeFile: null,
        activeFileContent: '',
        activeFileMetadata: null,
        activeTabId: null,
        documentTabs: [],
        currentEditorLine: null,
        editorSelection: null,
        isDirty: false,
        saveState: 'idle',
        saveMessage: '',
        ...navigation
      };
    }

    return {
      ...activateTab(fallback),
      documentTabs: nextTabs,
      ...navigation
    };
  }),
  goBack: () => set((state) => {
    const tabs = snapshotActiveTab(state);
    const previousId = state.navigationBack.at(-1);
    const currentId = state.activeTabId;
    if (!previousId || !currentId) return { documentTabs: tabs };
    const previous = tabs.find((tab) => tab.id === previousId);
    if (!previous) {
      const navigation = normalizeNavigation(state.navigationBack.slice(0, -1), state.navigationForward, tabs, currentId);
      return { documentTabs: tabs, ...navigation };
    }
    const back = state.navigationBack.slice(0, -1);
    const forward = [currentId, ...state.navigationForward].slice(0, 80);
    return {
      ...activateTab(previous),
      documentTabs: tabs,
      navigationBack: back,
      navigationForward: forward,
      canGoBack: back.length > 0,
      canGoForward: forward.length > 0
    };
  }),
  goForward: () => set((state) => {
    const tabs = snapshotActiveTab(state);
    const nextId = state.navigationForward[0];
    const currentId = state.activeTabId;
    if (!nextId || !currentId) return { documentTabs: tabs };
    const next = tabs.find((tab) => tab.id === nextId);
    if (!next) {
      const navigation = normalizeNavigation(state.navigationBack, state.navigationForward.slice(1), tabs, currentId);
      return { documentTabs: tabs, ...navigation };
    }
    const back = [...state.navigationBack, currentId].slice(-80);
    const forward = state.navigationForward.slice(1);
    return {
      ...activateTab(next),
      documentTabs: tabs,
      navigationBack: back,
      navigationForward: forward,
      canGoBack: back.length > 0,
      canGoForward: forward.length > 0
    };
  }),
  clearActiveFile: () => set((state) => {
    const nextTabs = state.activeTabId
      ? snapshotActiveTab(state).filter((tab) => tab.id !== state.activeTabId)
      : state.documentTabs;
    const fallback = nextTabs[0] ?? null;
    const navigation = normalizeNavigation(state.navigationBack, state.navigationForward, nextTabs, fallback?.id ?? null);
    if (!fallback) {
      return {
        activeFile: null,
        activeFileContent: '',
        activeFileMetadata: null,
        activeTabId: null,
        documentTabs: [],
        currentEditorLine: null,
        editorSelection: null,
        isDirty: false,
        saveState: 'idle',
        saveMessage: '',
        ...navigation
      };
    }

    return {
      ...activateTab(fallback),
      documentTabs: nextTabs,
      ...navigation
    };
  }),
  setPendingEditorLine: (line) => set({ pendingEditorLine: line }),
  setCurrentEditorLine: (line) => set((state) => ({
    currentEditorLine: line,
    documentTabs: updateActiveTab(state, { currentEditorLine: line })
  })),
  setEditorSelection: (selection) => set({ editorSelection: selection }),
  createUntitledFile: () =>
    set((state) => {
      const file = {
        name: 'Untitled.md',
        kind: 'file',
        path: '',
        isMarkdown: true,
        isText: true,
        fileKind: 'markdown',
        language: 'markdown',
        readOnly: false,
        isLoaded: true,
        isTruncated: false
      } satisfies FileNode;
      const tabId = `untitled:${Date.now()}`;
      const tab: DocumentTab = {
        id: tabId,
        file,
        content: '',
        metadata: null,
        isDirty: true,
        saveState: 'dirty',
        saveMessage: '',
        currentEditorLine: 1
      };
      return {
        activeFile: file,
        activeFileContent: '',
        activeFileMetadata: null,
        activeTabId: tabId,
        documentTabs: [tab, ...snapshotActiveTab(state)].slice(0, 24),
        currentEditorLine: 1,
        editorSelection: null,
        isDirty: true,
        saveState: 'dirty',
        saveMessage: '',
        ...pushNavigation(state, tabId)
      };
    }),
  setActiveFileContent: (c) => set((state) => ({
    activeFileContent: c,
    isDirty: true,
    saveState: 'dirty',
    saveMessage: '',
    documentTabs: updateActiveTab(state, {
      content: c,
      isDirty: true,
      saveState: 'dirty',
      saveMessage: ''
    })
  })),
  replaceActiveFileRange: (from, to, replacement) => set((state) => ({
    activeFileContent: `${state.activeFileContent.slice(0, from)}${replacement}${state.activeFileContent.slice(to)}`,
    editorSelection: null,
    isDirty: true,
    saveState: 'dirty',
    saveMessage: '',
    documentTabs: updateActiveTab(state, {
      content: `${state.activeFileContent.slice(0, from)}${replacement}${state.activeFileContent.slice(to)}`,
      isDirty: true,
      saveState: 'dirty',
      saveMessage: ''
    })
  })),
  markSaving: () => set((state) => ({
    saveState: 'saving',
    saveMessage: '',
    documentTabs: updateActiveTab(state, { saveState: 'saving', saveMessage: '' })
  })),
  markSaved: (metadata = null) => set((state) => ({
    activeFileMetadata: metadata ?? state.activeFileMetadata,
    isDirty: false,
    saveState: 'saved',
    saveMessage: '',
    documentTabs: updateActiveTab(state, {
      metadata: metadata ?? state.activeFileMetadata,
      isDirty: false,
      saveState: 'saved',
      saveMessage: ''
    })
  })),
  markSaveError: (message) => set((state) => ({
    saveState: 'error',
    saveMessage: message,
    documentTabs: updateActiveTab(state, { saveState: 'error', saveMessage: message })
  })),
  openSaveConflict: (conflict) => set({ saveConflict: conflict }),
  closeSaveConflict: () => set({ saveConflict: null }),
  requestUnsavedChangeChoice: (title, message) => new Promise((resolve) => {
    set({ unsavedChangePrompt: { title, message, resolve } });
  }),
  resolveUnsavedChangeChoice: (choice) => set((state) => {
    state.unsavedChangePrompt?.resolve(choice);
    return { unsavedChangePrompt: null };
  }),
  requestAiContextChoice: (title, message, items) => new Promise((resolve) => {
    set({ aiContextPrompt: { title, message, items, resolve } });
  }),
  resolveAiContextChoice: (choice) => set((state) => {
    state.aiContextPrompt?.resolve(choice);
    return { aiContextPrompt: null };
  }),
  
  viewMode: 'split',
  setViewMode: (m) => set({ viewMode: m }),
  
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  
  aiPanelOpen: false,
  toggleAiPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
  commandPaletteOpen: false,
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  aiConfig: loadAiConfig(),
  setAiConfig: (config) => {
    saveAiConfig(config);
    set({ aiConfig: config });
  },
  editorAiPrompts: loadEditorAiPrompts(),
  setEditorAiPrompts: (prompts) => {
    saveEditorAiPrompts(prompts);
    set({ editorAiPrompts: prompts });
  },
  autoSaveEnabled: loadAutoSaveEnabled(),
  setAutoSaveEnabled: (enabled) => {
    localStorage.setItem(AUTO_SAVE_STORAGE_KEY, JSON.stringify(enabled));
    set({ autoSaveEnabled: enabled });
  },

  themeState: initialThemeState,
  setThemeState: (themeState) => {
    applyThemeState(themeState);
    saveThemeState(themeState);
    set({ themeState, isDarkMode: isDarkThemeId(themeState.activeThemeId) });
  },
  setActiveThemeId: (themeId, importedThemeCss = '') => set((state) => {
    const next = {
      ...state.themeState,
      activeThemeId: themeId,
      importedThemeCss
    };
    applyThemeState(next);
    saveThemeState(next);
    return { themeState: next, isDarkMode: isDarkThemeId(themeId) };
  }),
  setImportedThemes: (themes) => set((state) => {
    const next = {
      ...state.themeState,
      importedThemes: themes
    };
    applyThemeState(next);
    saveThemeState(next);
    return { themeState: next, isDarkMode: isDarkThemeId(next.activeThemeId) };
  }),
  readingSettings: initialReadingSettings,
  setReadingSettings: (settings) => set((state) => {
    const next = normalizeReadingSettings({ ...state.readingSettings, ...settings });
    saveReadingSettings(next);
    return { readingSettings: next };
  }),
  resetReadingSettings: () => {
    saveReadingSettings(DEFAULT_READING_SETTINGS);
    set({ readingSettings: DEFAULT_READING_SETTINGS });
  },
  isDarkMode: isDarkThemeId(initialThemeState.activeThemeId),
  toggleThemeMode: () => set((state) => {
    const nextId = isDarkThemeId(state.themeState.activeThemeId) ? 'light' : 'dark';
    const next = {
      ...state.themeState,
      activeThemeId: nextId,
      importedThemeCss: ''
    };
    applyThemeState(next);
    saveThemeState(next);
    return { themeState: next, isDarkMode: isDarkThemeId(nextId) };
  }),
}));

function updateDirectoryChildren(nodes: FileNode[], path: string, children: FileNode[]): FileNode[] {
  return nodes.map((node) => {
    if (node.path === path && node.kind === 'directory') {
      return {
        ...node,
        isLoaded: true,
        children
      };
    }

    if (node.kind === 'directory' && node.children?.length) {
      return {
        ...node,
        children: updateDirectoryChildren(node.children, path, children)
      };
    }

    return node;
  });
}

function tabIdForFile(file: FileNode) {
  return file.path || `untitled:${Date.now()}`;
}

function snapshotActiveTab(state: AppState): DocumentTab[] {
  if (!state.activeTabId || !state.activeFile) return state.documentTabs;

  const snapshot: DocumentTab = {
    id: state.activeTabId,
    file: state.activeFile,
    content: state.activeFileContent,
    metadata: state.activeFileMetadata,
    isDirty: state.isDirty,
    saveState: state.saveState,
    saveMessage: state.saveMessage,
    currentEditorLine: state.currentEditorLine
  };

  const existingIndex = state.documentTabs.findIndex((tab) => tab.id === state.activeTabId);
  if (existingIndex === -1) return [snapshot, ...state.documentTabs];

  return state.documentTabs.map((tab) => (tab.id === state.activeTabId ? snapshot : tab));
}

function updateActiveTab(state: AppState, patch: Partial<DocumentTab>): DocumentTab[] {
  if (!state.activeTabId) return state.documentTabs;
  return snapshotActiveTab(state).map((tab) => (
    tab.id === state.activeTabId ? { ...tab, ...patch } : tab
  ));
}

function activateTab(tab: DocumentTab) {
  return {
    activeFile: tab.file,
    activeFileContent: tab.content,
    activeFileMetadata: tab.metadata,
    activeTabId: tab.id,
    currentEditorLine: tab.currentEditorLine,
    pendingEditorLine: null,
    editorSelection: null,
    isDirty: tab.isDirty,
    saveState: tab.saveState,
    saveMessage: tab.saveMessage
  };
}

function pushNavigation(state: AppState, nextId: string) {
  if (!state.activeTabId || state.activeTabId === nextId) {
    return {
      navigationBack: state.navigationBack,
      navigationForward: state.navigationForward,
      canGoBack: state.navigationBack.length > 0,
      canGoForward: state.navigationForward.length > 0
    };
  }

  const back = [...state.navigationBack.filter((id) => id !== nextId), state.activeTabId].slice(-80);
  return {
    navigationBack: back,
    navigationForward: [],
    canGoBack: back.length > 0,
    canGoForward: false
  };
}

function normalizeNavigation(
  back: string[],
  forward: string[],
  tabs: DocumentTab[],
  activeId: string | null
) {
  const tabIds = new Set(tabs.map((tab) => tab.id));
  const cleanBack = back.filter((id) => id !== activeId && tabIds.has(id));
  const cleanForward = forward.filter((id) => id !== activeId && tabIds.has(id));
  return {
    navigationBack: cleanBack,
    navigationForward: cleanForward,
    canGoBack: cleanBack.length > 0,
    canGoForward: cleanForward.length > 0
  };
}

function isSameOrChildPath(candidatePath: string, parentPath: string) {
  if (!candidatePath || !parentPath) return false;
  const normalizedCandidate = candidatePath.replace(/\/+$/, '');
  const normalizedParent = parentPath.replace(/\/+$/, '');
  return normalizedCandidate === normalizedParent
    || normalizedCandidate.startsWith(`${normalizedParent}/`);
}

function replacePathPrefix(path: string, oldPrefix: string, newPrefix: string) {
  if (!isSameOrChildPath(path, oldPrefix)) return path;
  const normalizedOld = oldPrefix.replace(/\/+$/, '');
  const normalizedNew = newPrefix.replace(/\/+$/, '');
  const normalizedPath = path.replace(/\/+$/, '');
  if (normalizedPath === normalizedOld) return normalizedNew;
  return `${normalizedNew}${normalizedPath.slice(normalizedOld.length)}`;
}

function isDarkThemeId(themeId: string) {
  return themeId === 'dark' || themeId === 'code-docs';
}

function loadReadingSettings(): ReadingSettings {
  try {
    const saved = localStorage.getItem(READING_SETTINGS_STORAGE_KEY);
    if (!saved) return DEFAULT_READING_SETTINGS;
    return normalizeReadingSettings(JSON.parse(saved));
  } catch {
    return DEFAULT_READING_SETTINGS;
  }
}

function saveReadingSettings(settings: ReadingSettings) {
  localStorage.setItem(READING_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeReadingSettings(settings)));
}

function normalizeReadingSettings(value: Partial<ReadingSettings>): ReadingSettings {
  return {
    width: clampNumber(value.width, 680, 1280, DEFAULT_READING_SETTINGS.width),
    fontSize: clampNumber(value.fontSize, 13, 20, DEFAULT_READING_SETTINGS.fontSize),
    lineHeight: clampNumber(value.lineHeight, 1.35, 2.2, DEFAULT_READING_SETTINGS.lineHeight),
    paragraphSpacing: clampNumber(value.paragraphSpacing, 0.6, 1.8, DEFAULT_READING_SETTINGS.paragraphSpacing),
    font: value.font === 'serif' ? 'serif' : 'sans'
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function loadAutoSaveEnabled() {
  try {
    return localStorage.getItem(AUTO_SAVE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}
