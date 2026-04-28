import type { AiProviderKind } from '../lib/ai';
import type { AppSettings } from '../lib/fs';

export const MAX_RECENT_ITEMS = 12;
export const AI_ACTIVE_CONTEXT_CHARS = 12000;
export const AI_CONTEXT_DOCUMENT_CHARS = 8000;

export const providerKindLabels: Record<AiProviderKind, string> = {
  openai: 'OpenAI',
  anthropic: 'Claude',
  gemini: 'Gemini',
  nvidia: 'NVIDIA'
};

export function truncateContext(content: string, limit: number) {
  if (content.length <= limit) return content;
  return `${content.slice(0, limit)}\n\n[InkStack: context truncated]`;
}

export function dedupePaths(paths: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const path of paths) {
    const normalized = path.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    next.push(normalized);
  }
  return next;
}

export function dedupeRecentMeta(entries: AppSettings['recentWorkspaceEntries']) {
  const seen = new Set<string>();
  const next: AppSettings['recentWorkspaceEntries'] = [];
  for (const entry of entries) {
    const path = entry.path.trim();
    if (!path || seen.has(path)) continue;
    seen.add(path);
    next.push({ ...entry, path });
  }
  return next;
}

export function migrateRecentPathPrefix(path: string, fromPrefix: string, toPrefix: string) {
  if (path === fromPrefix) return toPrefix;
  const normalizedPrefix = fromPrefix.endsWith('/') ? fromPrefix : `${fromPrefix}/`;
  if (!path.startsWith(normalizedPrefix)) return path;
  return `${toPrefix.replace(/\/$/, '')}/${path.slice(normalizedPrefix.length)}`;
}

export function countMigratedRecentPaths(settings: AppSettings, fromPrefix: string) {
  const paths = [
    ...settings.recentWorkspaces,
    ...settings.recentFiles,
    ...settings.pinnedWorkspaces,
    ...settings.pinnedFiles,
    ...settings.recentWorkspaceEntries.map((entry) => entry.path),
    ...settings.recentFileEntries.map((entry) => entry.path),
    settings.lastWorkspace,
    settings.lastFile
  ].filter((path): path is string => Boolean(path));
  return new Set(paths.filter((path) => migrateRecentPathPrefix(path, fromPrefix, fromPrefix) === path && (
    path === fromPrefix || path.startsWith(fromPrefix.endsWith('/') ? fromPrefix : `${fromPrefix}/`)
  ))).size;
}
