import { invoke } from './tauriRuntime';

export type BuiltInThemeId =
  | 'light'
  | 'dark'
  | 'focus'
  | 'code-docs'
  | 'github'
  | 'notion'
  | 'newsprint'
  | 'solarized'
  | 'nord'
  | 'dracula'
  | 'everforest'
  | 'flexoki'
  | 'academic';

export interface ThemeOption {
  id: string;
  name: string;
  kind: 'built-in' | 'imported';
  descriptionZh?: string;
  descriptionEn?: string;
  groupZh?: string;
  groupEn?: string;
  swatches?: string[];
}

export interface ThemeState {
  activeThemeId: string;
  colorMode: 'light' | 'dark';
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

interface BuiltInCssThemeWriteRequest {
  id: string;
  css: string;
}

const THEME_STORAGE_KEY = 'inkstack.theme.v1';
const IMPORTED_THEME_STYLE_ID = 'inkstack-imported-theme';
const BUILT_IN_THEME_STYLE_ID = 'inkstack-built-in-theme';
const MODE_OVERRIDE_STYLE_ID = 'inkstack-mode-override-theme';

type ThemeVariables = Record<string, string>;

const THEME_VARIABLES: Record<BuiltInThemeId, ThemeVariables> = {
  light: {
    '--font-reading': 'var(--font-sans)',
    '--font-editor': 'var(--font-mono)',
    '--color-bg-base': '#FFFFFF',
    '--color-bg-panel': '#F6F6F6',
    '--color-bg-hover': '#F0F0F0',
    '--color-bg-active': '#EAEAEA',
    '--color-border-subtle': '#E5E5E5',
    '--color-text-primary': '#1F1F1F',
    '--color-text-secondary': '#6B6B6B',
    '--color-text-tertiary': '#8E8E93',
    '--color-accent': '#007AFF',
    '--color-ai-user': '#2563EB',
    '--color-ai-bot': '#F2F2F7',
    '--color-code-bg': '#f7f8fa',
    '--color-code-header-bg': '#eef1f4',
    '--color-code-text': '#26313d',
    '--color-code-muted': '#697383',
    '--color-code-keyword': '#7b5ea7',
    '--color-code-string': '#4b6f58',
    '--color-code-number': '#4f6f9f',
    '--color-code-title': '#6c5b8f',
    '--color-code-comment': '#7b8491',
    '--color-code-attr': '#8a624a',
    '--color-inline-code-bg': '#f0f3f6',
    '--color-inline-code-text': '#0f4c81'
  },
  dark: {
    '--font-reading': 'var(--font-sans)',
    '--font-editor': 'var(--font-mono)',
    '--color-bg-base': '#1c1c1e',
    '--color-bg-panel': '#2c2c2e',
    '--color-bg-hover': '#3a3a3c',
    '--color-bg-active': '#48484a',
    '--color-border-subtle': '#38383a',
    '--color-text-primary': '#ffffff',
    '--color-text-secondary': '#ebebf599',
    '--color-text-tertiary': '#ebebf54d',
    '--color-accent': '#0a84ff',
    '--color-ai-user': '#0a84ff',
    '--color-ai-bot': '#3a3a3c',
    '--color-code-bg': '#24272d',
    '--color-code-header-bg': '#2b2f36',
    '--color-code-text': '#d9dee7',
    '--color-code-muted': '#9ba3ae',
    '--color-code-keyword': '#c7a7dd',
    '--color-code-string': '#9cc6aa',
    '--color-code-number': '#9db8df',
    '--color-code-title': '#c1b1dc',
    '--color-code-comment': '#858d99',
    '--color-code-attr': '#d0ad8d',
    '--color-inline-code-bg': '#2f3540',
    '--color-inline-code-text': '#9fd1ff'
  },
  focus: {
    '--font-reading': 'var(--font-serif)',
    '--font-editor': 'var(--font-mono)',
    '--color-bg-base': '#fbfaf6',
    '--color-bg-panel': '#f0eee7',
    '--color-bg-hover': '#e7e2d7',
    '--color-bg-active': '#ddd5c7',
    '--color-border-subtle': '#d8d0c2',
    '--color-text-primary': '#28231d',
    '--color-text-secondary': '#6f6658',
    '--color-text-tertiary': '#9a8f80',
    '--color-accent': '#2f7d63',
    '--color-ai-user': '#2f7d63',
    '--color-ai-bot': '#eee8dc',
    '--color-code-bg': '#f3efe6',
    '--color-code-header-bg': '#ebe4d7',
    '--color-code-text': '#342f28',
    '--color-code-muted': '#766c60',
    '--color-code-keyword': '#80629d',
    '--color-code-string': '#49705f',
    '--color-code-number': '#546f91',
    '--color-code-title': '#725f92',
    '--color-code-comment': '#8a8073',
    '--color-code-attr': '#8a6648',
    '--color-inline-code-bg': '#ece4d6',
    '--color-inline-code-text': '#1f6b52'
  },
  'code-docs': {
    '--font-reading': 'var(--font-sans)',
    '--font-editor': 'var(--font-mono)',
    '--color-bg-base': '#111318',
    '--color-bg-panel': '#171b22',
    '--color-bg-hover': '#202632',
    '--color-bg-active': '#283140',
    '--color-border-subtle': '#2f3948',
    '--color-text-primary': '#f2f5f8',
    '--color-text-secondary': '#b9c2cf',
    '--color-text-tertiary': '#768394',
    '--color-accent': '#48b0f7',
    '--color-ai-user': '#2563eb',
    '--color-ai-bot': '#202632',
    '--color-code-bg': '#161c24',
    '--color-code-header-bg': '#202834',
    '--color-code-text': '#e1e8ef',
    '--color-code-muted': '#94a3b4',
    '--color-code-keyword': '#d4b4e8',
    '--color-code-string': '#9ad1c0',
    '--color-code-number': '#9ec5f1',
    '--color-code-title': '#c9bbeb',
    '--color-code-comment': '#8390a0',
    '--color-code-attr': '#d8b88d',
    '--color-inline-code-bg': '#202b3a',
    '--color-inline-code-text': '#7dccff'
  },
  github: {
    '--font-reading': 'var(--font-sans)',
    '--font-editor': 'var(--font-mono)',
    '--color-bg-base': '#ffffff',
    '--color-bg-panel': '#f6f8fa',
    '--color-bg-hover': '#eef2f6',
    '--color-bg-active': '#eaeef2',
    '--color-border-subtle': '#d0d7de',
    '--color-text-primary': '#24292f',
    '--color-text-secondary': '#57606a',
    '--color-text-tertiary': '#8c959f',
    '--color-accent': '#0969da',
    '--color-ai-user': '#0969da',
    '--color-ai-bot': '#f6f8fa',
    '--color-code-bg': '#f6f8fa',
    '--color-code-header-bg': '#eef2f6',
    '--color-code-text': '#24292f',
    '--color-code-muted': '#6e7781',
    '--color-code-keyword': '#cf222e',
    '--color-code-string': '#0a3069',
    '--color-code-number': '#0550ae',
    '--color-code-title': '#8250df',
    '--color-code-comment': '#6e7781',
    '--color-code-attr': '#953800',
    '--color-inline-code-bg': '#eff3f6',
    '--color-inline-code-text': '#0550ae'
  },
  notion: {
    '--font-reading': 'var(--font-sans)',
    '--font-editor': 'var(--font-mono)',
    '--color-bg-base': '#ffffff',
    '--color-bg-panel': '#f7f7f5',
    '--color-bg-hover': '#efefed',
    '--color-bg-active': '#e6e6e3',
    '--color-border-subtle': '#e3e2df',
    '--color-text-primary': '#2f2f2f',
    '--color-text-secondary': '#64645f',
    '--color-text-tertiary': '#9b9a94',
    '--color-accent': '#0f766e',
    '--color-ai-user': '#0f766e',
    '--color-ai-bot': '#f1f1ef',
    '--color-code-bg': '#f4f4f2',
    '--color-code-header-bg': '#ebebe8',
    '--color-code-text': '#343434',
    '--color-code-muted': '#77736d',
    '--color-code-keyword': '#8a5a9e',
    '--color-code-string': '#3f6f5b',
    '--color-code-number': '#426b9f',
    '--color-code-title': '#7a5a8d',
    '--color-code-comment': '#85827b',
    '--color-code-attr': '#8a6549',
    '--color-inline-code-bg': '#ededeb',
    '--color-inline-code-text': '#0f766e'
  },
  newsprint: {
    '--font-reading': 'var(--font-serif)',
    '--font-editor': 'var(--font-mono)',
    '--color-bg-base': '#fbf7ef',
    '--color-bg-panel': '#f0e8d9',
    '--color-bg-hover': '#e7dcc9',
    '--color-bg-active': '#ded0ba',
    '--color-border-subtle': '#d4c4aa',
    '--color-text-primary': '#23201c',
    '--color-text-secondary': '#665d50',
    '--color-text-tertiary': '#948879',
    '--color-accent': '#8f3f2b',
    '--color-ai-user': '#8f3f2b',
    '--color-ai-bot': '#eee4d2',
    '--color-code-bg': '#efe6d5',
    '--color-code-header-bg': '#e5d7bf',
    '--color-code-text': '#302a23',
    '--color-code-muted': '#766b5d',
    '--color-code-keyword': '#7d4f8f',
    '--color-code-string': '#456d55',
    '--color-code-number': '#4f668c',
    '--color-code-title': '#7b5d34',
    '--color-code-comment': '#817569',
    '--color-code-attr': '#8b5a3c',
    '--color-inline-code-bg': '#eadcc5',
    '--color-inline-code-text': '#7f3826'
  },
  solarized: {
    '--font-reading': 'var(--font-serif)',
    '--font-editor': 'var(--font-mono)',
    '--color-bg-base': '#fdf6e3',
    '--color-bg-panel': '#eee8d5',
    '--color-bg-hover': '#e6dec8',
    '--color-bg-active': '#d9cfb7',
    '--color-border-subtle': '#d2c5a6',
    '--color-text-primary': '#586e75',
    '--color-text-secondary': '#657b83',
    '--color-text-tertiary': '#93a1a1',
    '--color-accent': '#268bd2',
    '--color-ai-user': '#268bd2',
    '--color-ai-bot': '#eee8d5',
    '--color-code-bg': '#eee8d5',
    '--color-code-header-bg': '#e4dcc4',
    '--color-code-text': '#586e75',
    '--color-code-muted': '#93a1a1',
    '--color-code-keyword': '#859900',
    '--color-code-string': '#2aa198',
    '--color-code-number': '#d33682',
    '--color-code-title': '#268bd2',
    '--color-code-comment': '#93a1a1',
    '--color-code-attr': '#b58900',
    '--color-inline-code-bg': '#eadfbd',
    '--color-inline-code-text': '#2a6f9b'
  },
  nord: {
    '--font-reading': 'var(--font-sans)',
    '--font-editor': 'var(--font-mono)',
    '--color-bg-base': '#2e3440',
    '--color-bg-panel': '#3b4252',
    '--color-bg-hover': '#434c5e',
    '--color-bg-active': '#4c566a',
    '--color-border-subtle': '#4c566a',
    '--color-text-primary': '#eceff4',
    '--color-text-secondary': '#d8dee9',
    '--color-text-tertiary': '#aeb8c8',
    '--color-accent': '#88c0d0',
    '--color-ai-user': '#5e81ac',
    '--color-ai-bot': '#3b4252',
    '--color-code-bg': '#343b49',
    '--color-code-header-bg': '#3f4858',
    '--color-code-text': '#e5e9f0',
    '--color-code-muted': '#a7b0c0',
    '--color-code-keyword': '#b48ead',
    '--color-code-string': '#a3be8c',
    '--color-code-number': '#d08770',
    '--color-code-title': '#88c0d0',
    '--color-code-comment': '#8f9bad',
    '--color-code-attr': '#ebcb8b',
    '--color-inline-code-bg': '#414b5d',
    '--color-inline-code-text': '#8fbcbb'
  },
  dracula: {
    '--font-reading': 'var(--font-sans)',
    '--font-editor': 'var(--font-mono)',
    '--color-bg-base': '#282a36',
    '--color-bg-panel': '#343746',
    '--color-bg-hover': '#3f4354',
    '--color-bg-active': '#4b5063',
    '--color-border-subtle': '#4d5065',
    '--color-text-primary': '#f8f8f2',
    '--color-text-secondary': '#d7d8e4',
    '--color-text-tertiary': '#9ea1b8',
    '--color-accent': '#bd93f9',
    '--color-ai-user': '#8be9fd',
    '--color-ai-bot': '#343746',
    '--color-code-bg': '#303341',
    '--color-code-header-bg': '#3a3e50',
    '--color-code-text': '#f1f1eb',
    '--color-code-muted': '#9aa0b8',
    '--color-code-keyword': '#ff79c6',
    '--color-code-string': '#f1fa8c',
    '--color-code-number': '#bd93f9',
    '--color-code-title': '#8be9fd',
    '--color-code-comment': '#7f849c',
    '--color-code-attr': '#50fa7b',
    '--color-inline-code-bg': '#3d4052',
    '--color-inline-code-text': '#f1fa8c'
  },
  everforest: {
    '--font-reading': 'var(--font-serif)',
    '--font-editor': 'var(--font-mono)',
    '--color-bg-base': '#fdf6e3',
    '--color-bg-panel': '#f3ead3',
    '--color-bg-hover': '#eadfca',
    '--color-bg-active': '#dfd3bd',
    '--color-border-subtle': '#d8cbb4',
    '--color-text-primary': '#3f4a3c',
    '--color-text-secondary': '#5d6858',
    '--color-text-tertiary': '#879080',
    '--color-accent': '#7f9f58',
    '--color-ai-user': '#5f8f6b',
    '--color-ai-bot': '#f0e5cc',
    '--color-code-bg': '#f0e6cf',
    '--color-code-header-bg': '#e7dbc3',
    '--color-code-text': '#465243',
    '--color-code-muted': '#7c8676',
    '--color-code-keyword': '#8f6f9f',
    '--color-code-string': '#5f8f6b',
    '--color-code-number': '#c07a4f',
    '--color-code-title': '#5f7f95',
    '--color-code-comment': '#879080',
    '--color-code-attr': '#9a7a4f',
    '--color-inline-code-bg': '#e8dcc4',
    '--color-inline-code-text': '#5f8f6b'
  },
  flexoki: {
    '--font-reading': 'var(--font-serif)',
    '--font-editor': 'var(--font-mono)',
    '--color-bg-base': '#fffcf0',
    '--color-bg-panel': '#f2f0e5',
    '--color-bg-hover': '#e6e4d9',
    '--color-bg-active': '#dad8ce',
    '--color-border-subtle': '#d3cfc2',
    '--color-text-primary': '#100f0f',
    '--color-text-secondary': '#6f6e69',
    '--color-text-tertiary': '#9c9a91',
    '--color-accent': '#4385be',
    '--color-ai-user': '#4385be',
    '--color-ai-bot': '#f2f0e5',
    '--color-code-bg': '#f1efe3',
    '--color-code-header-bg': '#e6e3d6',
    '--color-code-text': '#1c1b1a',
    '--color-code-muted': '#878580',
    '--color-code-keyword': '#ce5d97',
    '--color-code-string': '#66800b',
    '--color-code-number': '#d14d41',
    '--color-code-title': '#4385be',
    '--color-code-comment': '#878580',
    '--color-code-attr': '#ad8301',
    '--color-inline-code-bg': '#ebe7d9',
    '--color-inline-code-text': '#205ea6'
  },
  academic: {
    '--font-reading': 'var(--font-serif)',
    '--font-editor': 'var(--font-mono)',
    '--color-bg-base': '#fbfbf8',
    '--color-bg-panel': '#f1f1ec',
    '--color-bg-hover': '#e7e7df',
    '--color-bg-active': '#dddcd3',
    '--color-border-subtle': '#d6d4c8',
    '--color-text-primary': '#1c1c19',
    '--color-text-secondary': '#55554d',
    '--color-text-tertiary': '#8a897f',
    '--color-accent': '#315f9a',
    '--color-ai-user': '#315f9a',
    '--color-ai-bot': '#f0f0ea',
    '--color-code-bg': '#f3f3ee',
    '--color-code-header-bg': '#e8e8df',
    '--color-code-text': '#252520',
    '--color-code-muted': '#77766d',
    '--color-code-keyword': '#6c5a9a',
    '--color-code-string': '#3f6b55',
    '--color-code-number': '#715f9a',
    '--color-code-title': '#315f9a',
    '--color-code-comment': '#85847b',
    '--color-code-attr': '#8f6248',
    '--color-inline-code-bg': '#e9e9df',
    '--color-inline-code-text': '#315f9a'
  }
};

const DARK_BUILT_IN_THEME_IDS = new Set<BuiltInThemeId>(['dark', 'code-docs', 'nord', 'dracula']);

export const BUILT_IN_THEMES: ThemeOption[] = [
  themeMeta('light', 'InkStack Light', '默认清爽浅色，适合日常编辑。', 'Default clean light theme for everyday editing.', '基础', 'Base'),
  themeMeta('dark', 'InkStack Dark', '系统感深色，适合夜间和低光环境。', 'System-like dark theme for low-light writing.', '基础', 'Base'),
  themeMeta('focus', 'Focus Writing', '暖纸面写作主题，降低 UI 存在感。', 'Warm paper writing theme with quiet UI surfaces.', '写作', 'Writing'),
  themeMeta('code-docs', 'Code Docs', '深色代码文档主题，适合技术笔记。', 'Dark code documentation theme for technical notes.', '代码', 'Code'),
  themeMeta('github', 'GitHub Docs', '参考 GitHub/Typora 默认文档观感，适合 README。', 'GitHub-style docs theme for README and project notes.', '文档', 'Docs'),
  themeMeta('notion', 'Notion Clean', '类 Notion 的低噪声白底知识库风格。', 'Notion-like quiet white workspace for knowledge notes.', '文档', 'Docs'),
  themeMeta('newsprint', 'Newsprint', '参考报纸与 Typora Newsprint，适合长文审稿。', 'Newspaper-inspired theme for long-form review.', '纸面', 'Paper'),
  themeMeta('solarized', 'Solarized Paper', '低对比暖色调，适合长时间阅读。', 'Low-contrast warm palette for long reading sessions.', '护眼', 'Comfort'),
  themeMeta('nord', 'Nord Night', '冷色蓝灰深色主题，适合代码和夜间写作。', 'Cool blue-gray dark theme for code-heavy writing.', '代码', 'Code'),
  themeMeta('dracula', 'Dracula Soft', '高辨识深色代码主题，降低了原色饱和度。', 'Recognizable dark code theme with softened saturation.', '代码', 'Code'),
  themeMeta('everforest', 'Everforest Read', '林地暖绿护眼主题，适合资料阅读。', 'Warm green comfort theme for reading and notes.', '护眼', 'Comfort'),
  themeMeta('flexoki', 'Flexoki Notes', '墨色纸张风格，适合知识卡片和日记。', 'Ink-on-paper note theme for journals and cards.', '纸面', 'Paper'),
  themeMeta('academic', 'Academic Print', '学术论文式中性纸面，适合导出前校对。', 'Academic print-like neutral theme for proofreading.', '纸面', 'Paper')
];

export const DEFAULT_THEME_STATE: ThemeState = {
  activeThemeId: 'light',
  colorMode: 'light',
  importedThemes: [],
  importedThemeCss: ''
};

export const BUILT_IN_THEME_CSS: Record<BuiltInThemeId, string> = Object.fromEntries(
  (Object.keys(THEME_VARIABLES) as BuiltInThemeId[]).map((themeId) => [
    themeId,
    cssForTheme(themeId, `html[data-inkstack-theme="${themeId}"]`)
  ])
) as Record<BuiltInThemeId, string>;

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
  const isDark = normalized.colorMode === 'dark';

  document.documentElement.dataset.inkstackTheme = themeId;
  document.documentElement.dataset.inkstackMode = normalized.colorMode;
  setBuiltInThemeCss(isBuiltInThemeId(themeId) ? BUILT_IN_THEME_CSS[themeId] : '');
  setImportedThemeCss(isImportedTheme(themeId, normalized.importedThemes) ? normalized.importedThemeCss : '');
  setModeOverrideCss(normalized.colorMode);
  document.documentElement.classList.toggle('dark', isDark);
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

export async function openImportedThemesDir(): Promise<string> {
  return invoke<string>('open_imported_css_themes_dir');
}

export async function syncBuiltInThemesToThemeDir(): Promise<string> {
  const request: BuiltInCssThemeWriteRequest[] = BUILT_IN_THEMES.map((theme) => ({
    id: theme.id,
    css: BUILT_IN_THEME_CSS[theme.id as BuiltInThemeId]
  }));
  return invoke<string>('write_built_in_css_theme_files', { request });
}

export function allThemeOptions(importedThemes: ThemeOption[]) {
  return [...BUILT_IN_THEMES, ...importedThemes];
}

export function isDarkBuiltInThemeId(themeId: string) {
  return isBuiltInThemeId(themeId) && DARK_BUILT_IN_THEME_IDS.has(themeId);
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

function setBuiltInThemeCss(css: string) {
  let style = document.getElementById(BUILT_IN_THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!css.trim()) {
    style?.remove();
    return;
  }

  if (!style) {
    style = document.createElement('style');
    style.id = BUILT_IN_THEME_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;
}

function setModeOverrideCss(mode: ThemeState['colorMode']) {
  let style = document.getElementById(MODE_OVERRIDE_STYLE_ID) as HTMLStyleElement | null;
  if (mode !== 'dark') {
    style?.remove();
    return;
  }

  style?.remove();
  const root = document.documentElement;
  const hadDarkClass = root.classList.contains('dark');
  if (hadDarkClass) root.classList.remove('dark');
  const css = buildDarkModeOverrideCss(root);
  if (hadDarkClass) root.classList.add('dark');
  if (!css) return;

  style = document.createElement('style');
  style.id = MODE_OVERRIDE_STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

function isBuiltInThemeId(themeId: string): themeId is BuiltInThemeId {
  return Object.prototype.hasOwnProperty.call(THEME_VARIABLES, themeId);
}

function themeMeta(
  id: BuiltInThemeId,
  name: string,
  descriptionZh: string,
  descriptionEn: string,
  groupZh: string,
  groupEn: string
): ThemeOption {
  const variables = THEME_VARIABLES[id];
  return {
    id,
    name,
    kind: 'built-in',
    descriptionZh,
    descriptionEn,
    groupZh,
    groupEn,
    swatches: [
      variables['--color-bg-base'],
      variables['--color-bg-panel'],
      variables['--color-accent'],
      variables['--color-code-bg']
    ]
  };
}

function cssForTheme(themeId: BuiltInThemeId, selector: string) {
  const variables = THEME_VARIABLES[themeId];
  const body = Object.entries(variables)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
  return `${selector} {\n${body}\n}\n`;
}

function normalizeThemeState(value: Partial<ThemeState>): ThemeState {
  const activeThemeId = typeof value.activeThemeId === 'string' && value.activeThemeId.trim()
    ? value.activeThemeId
    : DEFAULT_THEME_STATE.activeThemeId;
  const fallbackMode = isDarkBuiltInThemeId(activeThemeId) ? 'dark' : 'light';
  return {
    activeThemeId,
    colorMode: value.colorMode === 'dark' || value.colorMode === 'light'
      ? value.colorMode
      : fallbackMode,
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

const MODE_COLOR_KEYS = [
  '--color-bg-base',
  '--color-bg-panel',
  '--color-bg-hover',
  '--color-bg-active',
  '--color-border-subtle',
  '--color-text-primary',
  '--color-text-secondary',
  '--color-text-tertiary',
  '--color-accent',
  '--color-ai-user',
  '--color-ai-bot',
  '--color-code-bg',
  '--color-code-header-bg',
  '--color-code-text',
  '--color-code-muted',
  '--color-code-keyword',
  '--color-code-string',
  '--color-code-number',
  '--color-code-title',
  '--color-code-comment',
  '--color-code-attr',
  '--color-inline-code-bg',
  '--color-inline-code-text'
] as const;

type ModeColorKey = typeof MODE_COLOR_KEYS[number];

const DARK_TARGET_LIGHTNESS: Record<ModeColorKey, number> = {
  '--color-bg-base': 11,
  '--color-bg-panel': 15,
  '--color-bg-hover': 21,
  '--color-bg-active': 28,
  '--color-border-subtle': 30,
  '--color-text-primary': 92,
  '--color-text-secondary': 76,
  '--color-text-tertiary': 60,
  '--color-accent': 64,
  '--color-ai-user': 62,
  '--color-ai-bot': 21,
  '--color-code-bg': 16,
  '--color-code-header-bg': 22,
  '--color-code-text': 90,
  '--color-code-muted': 64,
  '--color-code-keyword': 74,
  '--color-code-string': 71,
  '--color-code-number': 72,
  '--color-code-title': 76,
  '--color-code-comment': 60,
  '--color-code-attr': 72,
  '--color-inline-code-bg': 24,
  '--color-inline-code-text': 84
};

const DARK_TARGET_SATURATION: Partial<Record<ModeColorKey, number>> = {
  '--color-bg-base': 14,
  '--color-bg-panel': 14,
  '--color-bg-hover': 15,
  '--color-bg-active': 16,
  '--color-border-subtle': 16,
  '--color-text-primary': 18,
  '--color-text-secondary': 16,
  '--color-text-tertiary': 14,
  '--color-code-bg': 14,
  '--color-code-header-bg': 14,
  '--color-code-text': 18,
  '--color-code-muted': 16,
  '--color-inline-code-bg': 18
};

function buildDarkModeOverrideCss(root: HTMLElement) {
  const computed = window.getComputedStyle(root);
  const lines: string[] = [];
  for (const key of MODE_COLOR_KEYS) {
    const raw = computed.getPropertyValue(key).trim();
    const rgb = parseCssColor(raw);
    if (!rgb) continue;
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const saturation = DARK_TARGET_SATURATION[key] ?? hsl.s;
    const lightness = DARK_TARGET_LIGHTNESS[key];
    const next = hslToHex(hsl.h, saturation, lightness);
    lines.push(`  ${key}: ${next};`);
  }
  if (lines.length === 0) return '';
  return `html[data-inkstack-mode="dark"] {\n${lines.join('\n')}\n}\n`;
}

function parseCssColor(value: string) {
  const hexMatch = value.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16)
      };
    }
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }
  const rgbMatch = value.match(/^rgba?\(\s*([+\-.\d]+)\s*,\s*([+\-.\d]+)\s*,\s*([+\-.\d]+)(?:\s*,\s*[+\-.\d]+\s*)?\)$/i);
  if (rgbMatch) {
    return {
      r: clampChannel(Number(rgbMatch[1])),
      g: clampChannel(Number(rgbMatch[2])),
      b: clampChannel(Number(rgbMatch[3]))
    };
  }

  const hslMatch = value.match(/^hsla?\(\s*([+\-.\d]+)(?:deg)?\s*,\s*([+\-.\d]+)%\s*,\s*([+\-.\d]+)%(?:\s*,\s*[+\-.\d]+\s*)?\)$/i);
  if (!hslMatch) return null;
  const h = Number(hslMatch[1]);
  const s = Number(hslMatch[2]);
  const l = Number(hslMatch[3]);
  const rgb = hslToRgb(h, s, l);
  return {
    r: clampChannel(rgb.r),
    g: clampChannel(rgb.g),
    b: clampChannel(rgb.b)
  };
}

function clampChannel(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(255, Math.max(0, Math.round(value)));
}

function rgbToHsl(r: number, g: number, b: number) {
  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;
  const max = Math.max(r1, g1, b1);
  const min = Math.min(r1, g1, b1);
  const delta = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r1:
        h = 60 * (((g1 - b1) / delta) % 6);
        break;
      case g1:
        h = 60 * (((b1 - r1) / delta) + 2);
        break;
      default:
        h = 60 * (((r1 - g1) / delta) + 4);
        break;
    }
  }

  if (h < 0) h += 360;
  return {
    h,
    s: s * 100,
    l: l * 100
  };
}

function hslToHex(h: number, s: number, l: number) {
  const h1 = ((h % 360) + 360) % 360;
  const s1 = Math.min(100, Math.max(0, s)) / 100;
  const l1 = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * l1 - 1)) * s1;
  const x = c * (1 - Math.abs((h1 / 60) % 2 - 1));
  const m = l1 - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (h1 < 60) {
    r1 = c;
    g1 = x;
  } else if (h1 < 120) {
    r1 = x;
    g1 = c;
  } else if (h1 < 180) {
    g1 = c;
    b1 = x;
  } else if (h1 < 240) {
    g1 = x;
    b1 = c;
  } else if (h1 < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function toHex(value: number) {
  return Math.min(255, Math.max(0, value)).toString(16).padStart(2, '0');
}

function hslToRgb(h: number, s: number, l: number) {
  const h1 = ((h % 360) + 360) % 360;
  const s1 = Math.min(100, Math.max(0, s)) / 100;
  const l1 = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * l1 - 1)) * s1;
  const x = c * (1 - Math.abs((h1 / 60) % 2 - 1));
  const m = l1 - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (h1 < 60) {
    r1 = c;
    g1 = x;
  } else if (h1 < 120) {
    r1 = x;
    g1 = c;
  } else if (h1 < 180) {
    g1 = c;
    b1 = x;
  } else if (h1 < 240) {
    g1 = x;
    b1 = c;
  } else if (h1 < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255)
  };
}
