import { create } from 'zustand';
import { AiConfig, loadAiConfig, saveAiConfig } from './lib/ai';
import {
  EditorAiPrompts,
  loadEditorAiPrompts,
  saveEditorAiPrompts
} from './lib/aiPrompts';
import { FileMetadata, FileNode } from './lib/fs';

type ViewMode = 'split' | 'edit' | 'read';
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
export type UnsavedChangeChoice = 'save' | 'discard' | 'cancel';
export type AiContextChoice = 'confirm' | 'cancel';

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
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

export const useStore = create<AppState>((set) => ({
  locale: 'zh',
  setLocale: (l) => set({ locale: l }),
  
  rootPath: null,
  fileTree: [],
  activeFile: null,
  activeFileContent: '',
  activeFileMetadata: null,
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
  setActiveFile: (f, c, metadata = null) =>
    set({
      activeFile: f,
      activeFileContent: c,
      activeFileMetadata: metadata,
      currentEditorLine: 1,
      editorSelection: null,
      isDirty: false,
      saveState: 'saved',
      saveMessage: ''
    }),
  clearActiveFile: () => set({
    activeFile: null,
    activeFileContent: '',
    activeFileMetadata: null,
    currentEditorLine: null,
    editorSelection: null,
    isDirty: false,
    saveState: 'idle',
    saveMessage: ''
  }),
  setPendingEditorLine: (line) => set({ pendingEditorLine: line }),
  setCurrentEditorLine: (line) => set({ currentEditorLine: line }),
  setEditorSelection: (selection) => set({ editorSelection: selection }),
  createUntitledFile: () =>
    set({
      activeFile: {
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
      },
      activeFileContent: '',
      activeFileMetadata: null,
      currentEditorLine: 1,
      editorSelection: null,
      isDirty: true,
      saveState: 'dirty',
      saveMessage: ''
    }),
  setActiveFileContent: (c) => set({ activeFileContent: c, isDirty: true, saveState: 'dirty', saveMessage: '' }),
  replaceActiveFileRange: (from, to, replacement) => set((state) => ({
    activeFileContent: `${state.activeFileContent.slice(0, from)}${replacement}${state.activeFileContent.slice(to)}`,
    editorSelection: null,
    isDirty: true,
    saveState: 'dirty',
    saveMessage: ''
  })),
  markSaving: () => set({ saveState: 'saving', saveMessage: '' }),
  markSaved: (metadata = null) => set((state) => ({
    activeFileMetadata: metadata ?? state.activeFileMetadata,
    isDirty: false,
    saveState: 'saved',
    saveMessage: ''
  })),
  markSaveError: (message) => set({ saveState: 'error', saveMessage: message }),
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

  isDarkMode: false,
  toggleDarkMode: () => set((s) => {
    const isDark = !s.isDarkMode;
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    return { isDarkMode: isDark };
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
