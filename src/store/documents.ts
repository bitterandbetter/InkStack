import type { FileMetadata, FileNode } from '../lib/fs';

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

export type ViewMode = 'split' | 'edit' | 'read' | 'code';
export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
export type SaveHistorySource = 'manual' | 'auto' | 'save-as';
export type SaveFailureType = 'none' | 'conflict' | 'permission' | 'missing' | 'readonly' | 'cancelled' | 'unsupported' | 'unknown';
export type UnsavedChangeChoice = 'save' | 'discard' | 'cancel';
export type AiContextChoice = 'confirm' | 'cancel';

export interface AiContextItem {
  label: string;
  detail: string;
  content: string;
  editable?: boolean;
  removable?: boolean;
}

export interface AiContextResult {
  choice: AiContextChoice;
  items: AiContextItem[];
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

export interface SaveHistoryEntry {
  id: string;
  filePath: string;
  fileName: string;
  timestamp: number;
  source: SaveHistorySource;
  success: boolean;
  failureType: SaveFailureType;
  message: string;
}

export interface DocumentState {
  locale: 'zh' | 'en';
  setLocale: (l: 'zh' | 'en') => void;
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
  isDirty: boolean;
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
    resolve: (result: AiContextResult) => void;
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
  requestAiContextChoice: (title: string, message: string, items: AiContextItem[]) => Promise<AiContextResult>;
  resolveAiContextChoice: (choice: AiContextChoice, items?: AiContextItem[]) => void;
}

function tabIdForFile(file: FileNode) {
  return file.path;
}

function snapshotActiveTab(state: DocumentState): DocumentTab[] {
  return Array.isArray(state.documentTabs) ? state.documentTabs : [];
}

function activateTab(tab: DocumentTab) {
  return {
    activeFile: tab.file,
    activeFileContent: tab.content,
    activeFileMetadata: tab.metadata,
    activeTabId: tab.id,
    currentEditorLine: tab.currentEditorLine ?? 1,
    editorSelection: null,
    isDirty: tab.isDirty,
    saveState: tab.saveState,
    saveMessage: tab.saveMessage
  };
}

function pushNavigation(state: DocumentState, tabId: string) {
  const back = [...state.navigationBack, state.activeTabId].filter((id): id is string => Boolean(id)).slice(-80);
  return {
    navigationBack: back,
    navigationForward: [] as string[],
    canGoBack: back.length > 0,
    canGoForward: false
  };
}

function normalizeNavigation(
  back: string[],
  forward: string[],
  tabs: DocumentTab[],
  activeTabId: string | null
) {
  const validTabIds = new Set(tabs.map((tab) => tab.id));
  const filteredBack = back.filter((id) => validTabIds.has(id));
  const filteredForward = forward.filter((id) => validTabIds.has(id));
  return {
    navigationBack: filteredBack,
    navigationForward: filteredForward,
    canGoBack: filteredBack.length > 0,
    canGoForward: filteredForward.length > 0
  };
}

function updateActiveTab(state: DocumentState, patch: Partial<DocumentTab>) {
  const tabs = snapshotActiveTab(state);
  if (!state.activeTabId) return tabs;
  return tabs.map((tab) =>
    tab.id === state.activeTabId ? { ...tab, ...patch } : tab
  );
}

function updateDirectoryChildren(nodes: FileNode[], path: string, children: FileNode[]): FileNode[] {
  return nodes.map((node) => {
    if (node.path === path && node.kind === 'directory') {
      return {
        ...node,
        isLoaded: true,
        isTruncated: children.length >= 500,
        children
      };
    }
    if (node.children) {
      return {
        ...node,
        children: updateDirectoryChildren(node.children, path, children)
      };
    }
    return node;
  });
}

export function createDocumentSlice(set: any, get: any): DocumentState {
  return {
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
    setDirectoryChildren: (path, children) => set((state: DocumentState) => ({
      fileTree: updateDirectoryChildren(state.fileTree, path, children)
    })),
    setActiveFile: (f, c, metadata = null) => set((state: DocumentState) => {
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
        documentTabs,
        activeTabId: tabId,
        currentEditorLine: 1,
        editorSelection: null,
        isDirty: false,
        saveState: 'saved',
        saveMessage: '',
        ...navigation
      };
    }),
    switchDocumentTab: (id) => set((state: DocumentState) => {
      const tabs = snapshotActiveTab(state);
      const tab = tabs.find((item) => item.id === id);
      if (!tab || state.activeTabId === id) return { documentTabs: tabs };
      return {
        ...activateTab(tab),
        documentTabs: tabs,
        ...pushNavigation(state, id)
      };
    }),
    closeDocumentTab: (id) => set((state: DocumentState) => {
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
    updateDocumentTabPath: (oldPath, newPath, name) => set((state: DocumentState) => {
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
    closeDocumentTabsByPath: (path) => set((state: DocumentState) => {
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
    goBack: () => set((state: DocumentState) => {
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
    goForward: () => set((state: DocumentState) => {
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
    clearActiveFile: () => set((state: DocumentState) => {
      const nextTabs = state.activeTabId
        ? snapshotActiveTab(state).filter((tab) => tab.id !== state.activeTabId)
        : snapshotActiveTab(state);
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
    setCurrentEditorLine: (line) => set((state: DocumentState) => ({
      currentEditorLine: line,
      documentTabs: updateActiveTab(state, { currentEditorLine: line })
    })),
    setEditorSelection: (selection) => set({ editorSelection: selection }),
    createUntitledFile: () => set((state: DocumentState) => {
      const tabs = snapshotActiveTab(state);
      const untitledCount = tabs.filter((tab) => tab.file.name.startsWith('untitled')).length;
      const name = `untitled${untitledCount > 0 ? untitledCount + 1 : ''}.md`;
      const path = `${state.rootPath || ''}/${name}`;
      const file: FileNode = {
        name,
        kind: 'file',
        path,
        isMarkdown: true,
        isText: true,
        fileKind: 'markdown',
        language: 'markdown',
        isLoaded: true,
        isTruncated: false
      };
      return {
        activeFile: file,
        activeFileContent: '',
        activeFileMetadata: null,
        documentTabs: [{
          id: path,
          file,
          content: '',
          metadata: null,
          isDirty: true,
          saveState: 'dirty',
          saveMessage: '',
          currentEditorLine: 1
        }, ...tabs].slice(0, 24),
        activeTabId: path,
        currentEditorLine: 1,
        editorSelection: null,
        isDirty: true,
        saveState: 'dirty',
        saveMessage: ''
      };
    }),
    setActiveFileContent: (content) => set((state: DocumentState) => ({
      activeFileContent: content,
      isDirty: state.activeFile?.readOnly ? state.isDirty : true,
      saveState: state.activeFile?.readOnly ? state.saveState : 'dirty',
      documentTabs: updateActiveTab(state, {
        content,
        isDirty: state.activeFile?.readOnly ? state.isDirty : true,
        saveState: state.activeFile?.readOnly ? state.saveState : 'dirty'
      })
    })),
    replaceActiveFileRange: (from, to, replacement) => set((state: DocumentState) => {
      const content = state.activeFileContent;
      const newContent = content.slice(0, from) + replacement + content.slice(to);
      return {
        activeFileContent: newContent,
        isDirty: state.activeFile?.readOnly ? state.isDirty : true,
        saveState: state.activeFile?.readOnly ? state.saveState : 'dirty',
        documentTabs: updateActiveTab(state, {
          content: newContent,
          isDirty: state.activeFile?.readOnly ? state.isDirty : true,
          saveState: state.activeFile?.readOnly ? state.saveState : 'dirty'
        })
      };
    }),
    markSaving: () => set((state: DocumentState) => ({
      saveState: 'saving',
      saveMessage: '',
      documentTabs: updateActiveTab(state, { saveState: 'saving', saveMessage: '' })
    })),
    markSaved: (metadata) => set((state: DocumentState) => ({
      isDirty: false,
      saveState: 'saved',
      saveMessage: '',
      activeFileMetadata: metadata ?? state.activeFileMetadata,
      documentTabs: updateActiveTab(state, {
        isDirty: false,
        saveState: 'saved',
        saveMessage: '',
        metadata: metadata ?? state.activeFileMetadata
      })
    })),
    markSaveError: (message) => set((state: DocumentState) => ({
      saveState: 'error',
      saveMessage: message,
      documentTabs: updateActiveTab(state, { saveState: 'error', saveMessage: message })
    })),
    openSaveConflict: (conflict) => set({ saveConflict: conflict }),
    closeSaveConflict: () => set({ saveConflict: null }),
    requestUnsavedChangeChoice: (title, message) => {
      return new Promise<UnsavedChangeChoice>((resolve) => {
        set({ unsavedChangePrompt: { title, message, resolve } });
      });
    },
    resolveUnsavedChangeChoice: (choice) => {
      const prompt = get().unsavedChangePrompt;
      if (prompt) {
        prompt.resolve(choice);
        set({ unsavedChangePrompt: null });
      }
    },
    requestAiContextChoice: (title, message, items) => {
      return new Promise<AiContextResult>((resolve) => {
        set({ aiContextPrompt: { title, message, items, resolve } });
      });
    },
    resolveAiContextChoice: (choice, items) => {
      const prompt = get().aiContextPrompt;
      if (prompt) {
        prompt.resolve({ choice, items: items ?? prompt.items });
        set({ aiContextPrompt: null });
      }
    }
  };
}
