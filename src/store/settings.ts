import {
  applyThemeState,
  isDarkBuiltInThemeId,
  loadThemeState,
  pairedThemeIdForMode,
  saveThemeState,
  type ThemeOption,
  type ThemeState
} from '../lib/themes';
import type { SaveHistoryEntry, SaveHistorySource, SaveFailureType } from './documents';

export type ReadingFont = 'theme' | 'sans' | 'serif' | 'mono' | `custom:${string}`;
export type ImageInsertMode = 'assets' | 'embed';
export type MarkdownToolbarRow = 'common' | 'more';

export interface MarkdownToolbarItemPrefs {
  visible: boolean;
  row: MarkdownToolbarRow;
}

export interface MarkdownToolbarPrefs {
  order: string[];
  items: Record<string, MarkdownToolbarItemPrefs>;
}

export interface ReadingSettings {
  width: number;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  font: ReadingFont;
}

export interface EditorSettings {
  width: number;
  fontSize: number;
  lineHeight: number;
}

interface AutoSavePreferences {
  defaultEnabled: boolean;
  workspaceOverrides: Record<string, boolean>;
}

export interface SettingsState {
  themeState: ThemeState;
  setThemeState: (state: ThemeState) => void;
  setActiveThemeId: (themeId: string, importedThemeCss?: string) => void;
  setThemeMode: (mode: 'light' | 'dark') => void;
  setImportedThemes: (themes: ThemeOption[]) => void;
  isDarkMode: boolean;
  toggleThemeMode: () => void;
  readingSettings: ReadingSettings;
  editorSettings: EditorSettings;
  imageInsertMode: ImageInsertMode;
  setImageInsertMode: (mode: ImageInsertMode) => void;
  setReadingSettings: (settings: Partial<ReadingSettings>) => void;
  setEditorSettings: (settings: Partial<EditorSettings>) => void;
  resetReadingSettings: () => void;
  resetEditorSettings: () => void;
  autoSaveEnabled: boolean;
  setAutoSaveEnabled: (enabled: boolean) => void;
  resetWorkspaceAutoSavePreference: () => void;
  saveHistory: SaveHistoryEntry[];
  recordSaveHistory: (entry: Omit<SaveHistoryEntry, 'id' | 'timestamp' | 'failureType'> & { timestamp?: number; failureType?: SaveFailureType }) => void;
  clearSaveHistory: () => void;
  splitScrollSync: boolean;
  setSplitScrollSync: (enabled: boolean) => void;
  markdownToolbarPrefs: MarkdownToolbarPrefs;
  setMarkdownToolbarPrefs: (prefs: MarkdownToolbarPrefs) => void;
}

const READING_SETTINGS_STORAGE_KEY = 'inkstack.reading.settings.v1';
const EDITOR_SETTINGS_STORAGE_KEY = 'inkstack.editor.settings.v1';
const AUTO_SAVE_STORAGE_KEY = 'inkstack.autosave.enabled.v1';
const AUTO_SAVE_PREFS_STORAGE_KEY = 'inkstack.autosave.preferences.v1';
const SAVE_HISTORY_STORAGE_KEY = 'inkstack.save.history.v1';
const IMAGE_INSERT_MODE_STORAGE_KEY = 'inkstack.image.insert.mode.v1';
const SPLIT_SCROLL_SYNC_STORAGE_KEY = 'inkstack.split.scroll.sync.v1';
const MARKDOWN_TOOLBAR_PREFS_STORAGE_KEY = 'inkstack.markdown.toolbar.prefs.v1';
const MAX_SAVE_HISTORY = 40;

function loadReadingSettings(): ReadingSettings {
  try {
    const saved = localStorage.getItem(READING_SETTINGS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_READING_SETTINGS;
  } catch {
    return DEFAULT_READING_SETTINGS;
  }
}

function loadEditorSettings(): EditorSettings {
  try {
    const saved = localStorage.getItem(EDITOR_SETTINGS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_EDITOR_SETTINGS;
  } catch {
    return DEFAULT_EDITOR_SETTINGS;
  }
}

function loadAutoSavePreferences(): AutoSavePreferences {
  try {
    const saved = localStorage.getItem(AUTO_SAVE_PREFS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : { defaultEnabled: true, workspaceOverrides: {} };
  } catch {
    return { defaultEnabled: true, workspaceOverrides: {} };
  }
}

function loadImageInsertMode(): ImageInsertMode {
  try {
    const saved = localStorage.getItem(IMAGE_INSERT_MODE_STORAGE_KEY);
    return (saved as ImageInsertMode) || 'assets';
  } catch {
    return 'assets';
  }
}

function loadSplitScrollSync(): boolean {
  try {
    const saved = localStorage.getItem(SPLIT_SCROLL_SYNC_STORAGE_KEY);
    return saved ? JSON.parse(saved) : true;
  } catch {
    return true;
  }
}

function loadMarkdownToolbarPrefs(): MarkdownToolbarPrefs {
  try {
    const saved = localStorage.getItem(MARKDOWN_TOOLBAR_PREFS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_MARKDOWN_TOOLBAR_PREFS;
  } catch {
    return DEFAULT_MARKDOWN_TOOLBAR_PREFS;
  }
}

function resolveAutoSaveEnabled(path: string | null, prefs: AutoSavePreferences): boolean {
  if (!path) return prefs.defaultEnabled;
  return prefs.workspaceOverrides[path] ?? prefs.defaultEnabled;
}

const DEFAULT_READING_SETTINGS: ReadingSettings = {
  width: 896,
  fontSize: 15,
  lineHeight: 1.75,
  paragraphSpacing: 1,
  font: 'theme'
};

const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  width: 980,
  fontSize: 14,
  lineHeight: 1.7
};

const DEFAULT_MARKDOWN_TOOLBAR_PREFS: MarkdownToolbarPrefs = {
  order: [
    'heading1', 'heading2', 'bold', 'italic', 'bulletList', 'orderedList',
    'taskList', 'quote', 'link', 'image', 'imageMode', 'codeBlock',
    'inlineCode', 'attachment', 'table', 'formatTable', 'insertTableRow',
    'insertTableColumn', 'divider', 'heading3'
  ],
  items: {
    heading1: { visible: true, row: 'common' },
    heading2: { visible: true, row: 'common' },
    bold: { visible: true, row: 'common' },
    italic: { visible: true, row: 'common' },
    bulletList: { visible: true, row: 'common' },
    orderedList: { visible: true, row: 'common' },
    taskList: { visible: true, row: 'common' },
    quote: { visible: true, row: 'common' },
    link: { visible: true, row: 'common' },
    image: { visible: true, row: 'common' },
    imageMode: { visible: true, row: 'common' },
    codeBlock: { visible: true, row: 'more' },
    inlineCode: { visible: true, row: 'more' },
    attachment: { visible: true, row: 'more' },
    table: { visible: true, row: 'more' },
    formatTable: { visible: true, row: 'more' },
    insertTableRow: { visible: true, row: 'more' },
    insertTableColumn: { visible: true, row: 'more' },
    divider: { visible: true, row: 'more' },
    heading3: { visible: true, row: 'more' }
  }
};

function normalizeReadingSettings(value: Partial<ReadingSettings>): ReadingSettings {
  const font = typeof value.font === 'string' ? value.font.trim() : 'theme';
  const normalizedFont: ReadingFont = font.startsWith('custom:') && font.slice(7).trim()
    ? `custom:${font.slice(7).trim()}`
    : (font === 'sans' || font === 'serif' || font === 'mono' || font === 'theme' ? font : 'theme');
  return {
    width: clampNumber(value.width, 680, 1280, DEFAULT_READING_SETTINGS.width),
    fontSize: clampNumber(value.fontSize, 13, 20, DEFAULT_READING_SETTINGS.fontSize),
    lineHeight: clampNumber(value.lineHeight, 1.35, 2.2, DEFAULT_READING_SETTINGS.lineHeight),
    paragraphSpacing: clampNumber(value.paragraphSpacing, 0.6, 1.8, DEFAULT_READING_SETTINGS.paragraphSpacing),
    font: normalizedFont
  };
}

function normalizeEditorSettings(value: Partial<EditorSettings>): EditorSettings {
  return {
    width: clampNumber(value.width, 720, 1560, DEFAULT_EDITOR_SETTINGS.width),
    fontSize: clampNumber(value.fontSize, 12, 22, DEFAULT_EDITOR_SETTINGS.fontSize),
    lineHeight: clampNumber(value.lineHeight, 1.25, 2.1, DEFAULT_EDITOR_SETTINGS.lineHeight)
  };
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function createSettingsSlice(set: any, get: any): SettingsState {
  const initialThemeState = loadThemeState();
  applyThemeState(initialThemeState);

  return {
    themeState: initialThemeState,
    setThemeState: (state) => {
      applyThemeState(state);
      saveThemeState(state);
      set({ themeState: state, isDarkMode: state.colorMode === 'dark' });
    },
    setActiveThemeId: (themeId, importedThemeCss) => set((state: SettingsState) => {
      const colorMode = themeId.startsWith('imported:')
        ? state.themeState.colorMode
        : (isDarkBuiltInThemeId(themeId) ? 'dark' : 'light');
      const next: ThemeState = { ...state.themeState, activeThemeId: themeId, colorMode };
      if (importedThemeCss !== undefined) {
        next.importedThemeCss = importedThemeCss;
      }
      applyThemeState(next);
      saveThemeState(next);
      return { themeState: next, isDarkMode: colorMode === 'dark' };
    }),
    setThemeMode: (mode) => set((state: SettingsState) => {
      const next: ThemeState = {
        ...state.themeState,
        activeThemeId: pairedThemeIdForMode(state.themeState.activeThemeId, mode),
        colorMode: mode
      };
      applyThemeState(next);
      saveThemeState(next);
      return { themeState: next, isDarkMode: mode === 'dark' };
    }),
    setImportedThemes: (themes) => set((state: SettingsState) => {
      const next = { ...state.themeState, importedThemes: themes };
      saveThemeState(next);
      return { themeState: next };
    }),
    isDarkMode: initialThemeState.colorMode === 'dark',
    toggleThemeMode: () => set((state: SettingsState) => {
      const nextMode: 'light' | 'dark' = state.themeState.colorMode === 'dark' ? 'light' : 'dark';
      const next: ThemeState = {
        ...state.themeState,
        activeThemeId: pairedThemeIdForMode(state.themeState.activeThemeId, nextMode),
        colorMode: nextMode
      };
      applyThemeState(next);
      saveThemeState(next);
      return { themeState: next, isDarkMode: nextMode === 'dark' };
    }),
    readingSettings: loadReadingSettings(),
    editorSettings: loadEditorSettings(),
    imageInsertMode: loadImageInsertMode(),
    setImageInsertMode: (mode) => {
      localStorage.setItem(IMAGE_INSERT_MODE_STORAGE_KEY, mode);
      set({ imageInsertMode: mode });
    },
    setReadingSettings: (settings) => set((state: SettingsState) => {
      const next = normalizeReadingSettings({ ...state.readingSettings, ...settings });
      localStorage.setItem(READING_SETTINGS_STORAGE_KEY, JSON.stringify(next));
      return { readingSettings: next };
    }),
    setEditorSettings: (settings) => set((state: SettingsState) => {
      const next = normalizeEditorSettings({ ...state.editorSettings, ...settings });
      localStorage.setItem(EDITOR_SETTINGS_STORAGE_KEY, JSON.stringify(next));
      return { editorSettings: next };
    }),
    resetReadingSettings: () => {
      localStorage.setItem(READING_SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_READING_SETTINGS));
      set({ readingSettings: DEFAULT_READING_SETTINGS });
    },
    resetEditorSettings: () => {
      localStorage.setItem(EDITOR_SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_EDITOR_SETTINGS));
      set({ editorSettings: DEFAULT_EDITOR_SETTINGS });
    },
    autoSaveEnabled: true,
    setAutoSaveEnabled: (enabled) => set({ autoSaveEnabled: enabled }),
    resetWorkspaceAutoSavePreference: () => set({ autoSaveEnabled: true }),
    saveHistory: [],
    recordSaveHistory: (entry) => set((state: SettingsState) => {
      const newEntry: SaveHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        failureType: 'none',
        ...entry
      };
      const history = [newEntry, ...state.saveHistory].slice(0, MAX_SAVE_HISTORY);
      localStorage.setItem(SAVE_HISTORY_STORAGE_KEY, JSON.stringify(history));
      return { saveHistory: history };
    }),
    clearSaveHistory: () => {
      localStorage.removeItem(SAVE_HISTORY_STORAGE_KEY);
      set({ saveHistory: [] });
    },
    splitScrollSync: loadSplitScrollSync(),
    setSplitScrollSync: (enabled) => {
      localStorage.setItem(SPLIT_SCROLL_SYNC_STORAGE_KEY, JSON.stringify(enabled));
      set({ splitScrollSync: enabled });
    },
    markdownToolbarPrefs: loadMarkdownToolbarPrefs(),
    setMarkdownToolbarPrefs: (prefs) => {
      localStorage.setItem(MARKDOWN_TOOLBAR_PREFS_STORAGE_KEY, JSON.stringify(prefs));
      set({ markdownToolbarPrefs: prefs });
    }
  };
}
