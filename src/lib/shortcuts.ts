import type { AppCommandId } from './appCommands';

export interface ShortcutConfig {
  id: AppCommandId;
  label: string;
  category: 'file' | 'edit' | 'view' | 'ai';
  defaultKeys: string[];
  currentKeys: string[];
}

const SHORTCUTS_STORAGE_KEY = 'inkstack.shortcuts.v1';

export const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  { id: 'new-file', label: '新建文件', category: 'file', defaultKeys: ['Cmd/Ctrl+N'], currentKeys: ['Cmd/Ctrl+N'] },
  { id: 'open-file', label: '打开文件', category: 'file', defaultKeys: ['Cmd/Ctrl+O'], currentKeys: ['Cmd/Ctrl+O'] },
  { id: 'open-workspace', label: '打开目录', category: 'file', defaultKeys: ['Cmd/Ctrl+Shift+O'], currentKeys: ['Cmd/Ctrl+Shift+O'] },
  { id: 'save', label: '保存', category: 'file', defaultKeys: ['Cmd/Ctrl+S'], currentKeys: ['Cmd/Ctrl+S'] },
  { id: 'save-as', label: '另存为', category: 'file', defaultKeys: ['Cmd/Ctrl+Shift+S'], currentKeys: ['Cmd/Ctrl+Shift+S'] },
  
  { id: 'find', label: '查找', category: 'edit', defaultKeys: ['Cmd/Ctrl+F'], currentKeys: ['Cmd/Ctrl+F'] },
  
  { id: 'view-edit', label: '编辑模式', category: 'view', defaultKeys: ['Cmd/Ctrl+1'], currentKeys: ['Cmd/Ctrl+1'] },
  { id: 'view-split', label: '分屏模式', category: 'view', defaultKeys: ['Cmd/Ctrl+2'], currentKeys: ['Cmd/Ctrl+2'] },
  { id: 'view-read', label: '阅读模式', category: 'view', defaultKeys: ['Cmd/Ctrl+3'], currentKeys: ['Cmd/Ctrl+3'] },
  { id: 'view-code', label: '代码模式', category: 'view', defaultKeys: ['Cmd/Ctrl+4'], currentKeys: ['Cmd/Ctrl+4'] },
  { id: 'view-wysiwyg', label: '所见即所得模式', category: 'view', defaultKeys: ['Cmd/Ctrl+5'], currentKeys: ['Cmd/Ctrl+5'] },
  { id: 'toggle-sidebar', label: '切换侧边栏', category: 'view', defaultKeys: ['Cmd/Ctrl+\\'], currentKeys: ['Cmd/Ctrl+\\'] },
  
  { id: 'toggle-ai', label: 'AI 面板', category: 'ai', defaultKeys: ['Cmd/Ctrl+Shift+A'], currentKeys: ['Cmd/Ctrl+Shift+A'] },
  { id: 'open-command-palette', label: '命令面板', category: 'ai', defaultKeys: ['Cmd/Ctrl+K'], currentKeys: ['Cmd/Ctrl+K'] },
];

export function loadShortcuts(): ShortcutConfig[] {
  try {
    const saved = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    if (!saved) return DEFAULT_SHORTCUTS;
    const parsed = JSON.parse(saved) as ShortcutConfig[];
    // Merge with defaults to ensure new commands are added
    return DEFAULT_SHORTCUTS.map(defaultShortcut => {
      const savedShortcut = parsed.find(s => s.id === defaultShortcut.id);
      return savedShortcut ? { ...defaultShortcut, currentKeys: savedShortcut.currentKeys } : defaultShortcut;
    });
  } catch {
    return DEFAULT_SHORTCUTS;
  }
}

export function saveShortcuts(shortcuts: ShortcutConfig[]): void {
  localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(shortcuts));
}

export function getShortcutForCommand(command: AppCommandId, shortcuts?: ShortcutConfig[]): string {
  const list = shortcuts || loadShortcuts();
  const shortcut = list.find(s => s.id === command);
  return shortcut?.currentKeys[0] || '';
}

export function parseShortcutToKeys(shortcut: string): { ctrl: boolean; shift: boolean; alt: boolean; key: string } {
  const parts = shortcut.split('+');
  return {
    ctrl: parts.includes('Cmd/Ctrl') || parts.includes('Ctrl'),
    shift: parts.includes('Shift'),
    alt: parts.includes('Alt'),
    key: parts[parts.length - 1]
  };
}

export function formatKeysToShortcut(keys: { ctrl: boolean; shift: boolean; alt: boolean; key: string }): string {
  const parts: string[] = [];
  if (keys.ctrl) parts.push('Cmd/Ctrl');
  if (keys.shift) parts.push('Shift');
  if (keys.alt) parts.push('Alt');
  parts.push(keys.key);
  return parts.join('+');
}
