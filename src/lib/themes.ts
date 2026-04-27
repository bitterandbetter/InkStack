import { invoke } from '@tauri-apps/api/core';

export type BuiltInThemeId = 'light' | 'dark' | 'focus' | 'code-docs';

export interface ThemeOption {
  id: string;
  name: string;
  kind: 'built-in' | 'imported';
}

export interface ThemeState {
  activeThemeId: string;
  importedThemes: ThemeOption[];
  importedThemeCss: string;
}

interface TauriCssThemeSummary {
  id: string;
  name: string;
}

interface TauriCssThemeDocument {
  id: string;
  name: string;
  css: string;
}

const THEME_STORAGE_KEY = 'inkstack.theme.v1';
const IMPORTED_THEME_STYLE_ID = 'inkstack-imported-theme';

export const BUILT_IN_THEMES: ThemeOption[] = [
  { id: 'light', name: 'InkStack Light', kind: 'built-in' },
  { id: 'dark', name: 'InkStack Dark', kind: 'built-in' },
  { id: 'focus', name: 'Focus Writing', kind: 'built-in' },
  { id: 'code-docs', name: 'Code Docs', kind: 'built-in' }
];

export const DEFAULT_THEME_STATE: ThemeState = {
  activeThemeId: 'light',
  importedThemes: [],
  importedThemeCss: ''
};

export const BUILT_IN_THEME_CSS: Record<BuiltInThemeId, string> = {
  light: `:root {
  --color-bg-base: #FFFFFF;
  --color-bg-panel: #F6F6F6;
  --color-bg-hover: #F0F0F0;
  --color-bg-active: #EAEAEA;
  --color-border-subtle: #E5E5E5;
  --color-text-primary: #1F1F1F;
  --color-text-secondary: #6B6B6B;
  --color-text-tertiary: #8E8E93;
  --color-accent: #007AFF;
  --color-ai-user: #2563EB;
  --color-ai-bot: #F2F2F7;
  --color-code-bg: #f6f8fa;
  --color-code-header-bg: #eef2f6;
  --color-code-text: #24292f;
  --color-code-muted: #57606a;
  --color-inline-code-bg: #f0f3f6;
  --color-inline-code-text: #0f4c81;
}
`,
  dark: `.dark {
  --color-bg-base: #1c1c1e;
  --color-bg-panel: #2c2c2e;
  --color-bg-hover: #3a3a3c;
  --color-bg-active: #48484a;
  --color-border-subtle: #38383a;
  --color-text-primary: #ffffff;
  --color-text-secondary: #ebebf599;
  --color-text-tertiary: #ebebf54d;
  --color-accent: #0a84ff;
  --color-ai-user: #0a84ff;
  --color-ai-bot: #3a3a3c;
  --color-code-bg: #1f232a;
  --color-code-header-bg: #282d35;
  --color-code-text: #e6edf3;
  --color-code-muted: #9aa4b2;
  --color-inline-code-bg: #2f3540;
  --color-inline-code-text: #9fd1ff;
}
`,
  focus: `html[data-inkstack-theme="focus"] {
  --color-bg-base: #fbfaf6;
  --color-bg-panel: #f0eee7;
  --color-bg-hover: #e7e2d7;
  --color-bg-active: #ddd5c7;
  --color-border-subtle: #d8d0c2;
  --color-text-primary: #28231d;
  --color-text-secondary: #6f6658;
  --color-text-tertiary: #9a8f80;
  --color-accent: #2f7d63;
  --color-ai-user: #2f7d63;
  --color-ai-bot: #eee8dc;
  --color-code-bg: #f3efe5;
  --color-code-header-bg: #e7e0d2;
  --color-code-text: #2f2a22;
  --color-code-muted: #766b5d;
  --color-inline-code-bg: #ece4d6;
  --color-inline-code-text: #1f6b52;
}
`,
  'code-docs': `html[data-inkstack-theme="code-docs"] {
  --color-bg-base: #111318;
  --color-bg-panel: #171b22;
  --color-bg-hover: #202632;
  --color-bg-active: #283140;
  --color-border-subtle: #2f3948;
  --color-text-primary: #f2f5f8;
  --color-text-secondary: #b9c2cf;
  --color-text-tertiary: #768394;
  --color-accent: #48b0f7;
  --color-ai-user: #2563eb;
  --color-ai-bot: #202632;
  --color-code-bg: #0f141b;
  --color-code-header-bg: #1b2430;
  --color-code-text: #eef4fb;
  --color-code-muted: #8fa1b7;
  --color-inline-code-bg: #202b3a;
  --color-inline-code-text: #7dccff;
}
`
};

export function loadThemeState(): ThemeState {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (!saved) return DEFAULT_THEME_STATE;

    return normalizeThemeState(JSON.parse(saved));
  } catch {
    return DEFAULT_THEME_STATE;
  }
}

export function saveThemeState(state: ThemeState) {
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(normalizeThemeState(state)));
}

export function applyThemeState(state: ThemeState) {
  const normalized = normalizeThemeState(state);
  const themeId = normalized.activeThemeId || 'light';
  const isDark = themeId === 'dark' || themeId === 'code-docs';

  document.documentElement.dataset.inkstackTheme = themeId;
  document.documentElement.classList.toggle('dark', isDark);
  setImportedThemeCss(isImportedTheme(themeId, normalized.importedThemes) ? normalized.importedThemeCss : '');
}

export async function loadImportedThemes(): Promise<ThemeOption[]> {
  const themes = await invoke<TauriCssThemeSummary[]>('list_imported_css_themes');
  return themes.map((theme) => ({
    id: `imported:${theme.id}`,
    name: theme.name,
    kind: 'imported' as const
  }));
}

export async function importCssTheme(): Promise<{ state: Pick<ThemeState, 'activeThemeId' | 'importedThemeCss'>; option: ThemeOption } | null> {
  const document = await invoke<TauriCssThemeDocument | null>('import_css_theme');
  if (!document) return null;

  const option = {
    id: `imported:${document.id}`,
    name: document.name,
    kind: 'imported' as const
  };

  return {
    option,
    state: {
      activeThemeId: option.id,
      importedThemeCss: document.css
    }
  };
}

export async function readImportedThemeCss(themeId: string): Promise<string> {
  const id = themeId.replace(/^imported:/, '');
  const document = await invoke<TauriCssThemeDocument>('read_imported_css_theme', { id });
  return document.css;
}

export async function deleteImportedTheme(themeId: string): Promise<void> {
  const id = themeId.replace(/^imported:/, '');
  await invoke('delete_imported_css_theme', { id });
}

export async function exportThemeCss(theme: ThemeOption, css: string): Promise<string | null> {
  return invoke<string | null>('export_css_theme', {
    request: {
      suggestedName: `${theme.id.replace(/^imported:/, '')}.css`,
      css
    }
  });
}

export function allThemeOptions(importedThemes: ThemeOption[]) {
  return [...BUILT_IN_THEMES, ...importedThemes];
}

export function isImportedTheme(themeId: string, importedThemes: ThemeOption[]) {
  return themeId.startsWith('imported:') && importedThemes.some((theme) => theme.id === themeId);
}

function setImportedThemeCss(css: string) {
  let style = document.getElementById(IMPORTED_THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!css.trim()) {
    style?.remove();
    return;
  }

  if (!style) {
    style = document.createElement('style');
    style.id = IMPORTED_THEME_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;
}

function normalizeThemeState(value: Partial<ThemeState>): ThemeState {
  return {
    activeThemeId: typeof value.activeThemeId === 'string' && value.activeThemeId.trim()
      ? value.activeThemeId
      : DEFAULT_THEME_STATE.activeThemeId,
    importedThemes: Array.isArray(value.importedThemes)
      ? value.importedThemes.filter((theme): theme is ThemeOption => (
        typeof theme?.id === 'string'
        && typeof theme?.name === 'string'
        && theme.kind === 'imported'
      ))
      : [],
    importedThemeCss: typeof value.importedThemeCss === 'string' ? value.importedThemeCss : ''
  };
}
