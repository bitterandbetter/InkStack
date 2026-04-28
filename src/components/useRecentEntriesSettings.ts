import { useEffect, useState } from 'react';
import { sanitizeAiError } from '../lib/ai';
import {
  getSettings,
  pruneMissingRecentEntries,
  updateSettings,
  type AppSettings
} from '../lib/fs';
import type { RecentSortMode } from './LocalSettingsPanels';
import {
  MAX_RECENT_ITEMS,
  countMigratedRecentPaths,
  dedupePaths,
  dedupeRecentMeta,
  migrateRecentPathPrefix
} from './aiPanelHelpers';

export function useRecentEntriesSettings(active: boolean, locale: 'zh' | 'en') {
  const [recentSettings, setRecentSettings] = useState<AppSettings | null>(null);
  const [recentMessage, setRecentMessage] = useState('');
  const [recentQuery, setRecentQuery] = useState('');
  const [recentSortMode, setRecentSortMode] = useState<RecentSortMode>('recent');

  useEffect(() => {
    if (!active) return;
    void getSettings()
      .then(setRecentSettings)
      .catch((error) => setRecentMessage(`${locale === 'zh' ? '读取最近项目失败' : 'Failed to load recent entries'}: ${sanitizeAiError(error, locale)}`));
  }, [active, locale]);

  const persistRecentSettings = async (next: AppSettings, message: string) => {
    try {
      setRecentMessage('');
      const saved = await updateSettings(next);
      setRecentSettings(saved);
      setRecentMessage(message);
    } catch (error: any) {
      setRecentMessage(`${locale === 'zh' ? '更新最近项目失败' : 'Failed to update recent entries'}: ${sanitizeAiError(error, locale)}`);
    }
  };

  const togglePinnedRecent = async (kind: 'workspace' | 'file', path: string) => {
    if (!recentSettings) return;
    const pinnedKey = kind === 'workspace' ? 'pinnedWorkspaces' : 'pinnedFiles';
    const pinned = recentSettings[pinnedKey];
    const isPinned = pinned.includes(path);
    if (!isPinned && pinned.length >= MAX_RECENT_ITEMS) {
      setRecentMessage(locale === 'zh'
        ? `固定项目最多 ${MAX_RECENT_ITEMS} 个，请先取消固定旧项目`
        : `You can pin up to ${MAX_RECENT_ITEMS} entries. Unpin an older entry first.`);
      return;
    }
    const nextPinned = pinned.includes(path)
      ? pinned.filter((item) => item !== path)
      : [path, ...pinned.filter((item) => item !== path)];

    await persistRecentSettings(
      { ...recentSettings, [pinnedKey]: nextPinned },
      isPinned
        ? (locale === 'zh' ? '已取消固定' : 'Unpinned')
        : (locale === 'zh' ? '已固定到顶部' : 'Pinned')
    );
  };

  const reorderPinnedRecent = async (kind: 'workspace' | 'file', draggedPath: string, targetPath: string) => {
    if (!recentSettings || draggedPath === targetPath) return;
    const pinnedKey = kind === 'workspace' ? 'pinnedWorkspaces' : 'pinnedFiles';
    const pinned = [...recentSettings[pinnedKey]];
    const draggedIndex = pinned.indexOf(draggedPath);
    const targetIndex = pinned.indexOf(targetPath);
    if (draggedIndex < 0 || targetIndex < 0) return;

    pinned.splice(draggedIndex, 1);
    pinned.splice(targetIndex, 0, draggedPath);
    await persistRecentSettings(
      { ...recentSettings, [pinnedKey]: pinned },
      locale === 'zh' ? '固定项目顺序已更新' : 'Pinned order updated'
    );
  };

  const removeRecentEntry = async (kind: 'workspace' | 'file', path: string) => {
    if (!recentSettings) return;
    const next: AppSettings = kind === 'workspace'
      ? {
        ...recentSettings,
        recentWorkspaces: recentSettings.recentWorkspaces.filter((item) => item !== path),
        recentWorkspaceEntries: recentSettings.recentWorkspaceEntries.filter((entry) => entry.path !== path),
        pinnedWorkspaces: recentSettings.pinnedWorkspaces.filter((item) => item !== path),
        lastWorkspace: recentSettings.lastWorkspace === path ? null : recentSettings.lastWorkspace
      }
      : {
        ...recentSettings,
        recentFiles: recentSettings.recentFiles.filter((item) => item !== path),
        recentFileEntries: recentSettings.recentFileEntries.filter((entry) => entry.path !== path),
        pinnedFiles: recentSettings.pinnedFiles.filter((item) => item !== path),
        lastFile: recentSettings.lastFile === path ? null : recentSettings.lastFile
      };

    await persistRecentSettings(next, locale === 'zh' ? '已移除最近项目' : 'Recent entry removed');
  };

  const replaceRecentEntryPath = async (kind: 'workspace' | 'file', path: string) => {
    if (!recentSettings) return;
    const nextPath = window.prompt(
      locale === 'zh' ? '输入迁移后的新路径' : 'Enter the migrated path',
      path
    )?.trim();
    if (!nextPath || nextPath === path) return;

    const replacePath = (items: string[]) => dedupePaths(items.map((item) => (item === path ? nextPath : item)));
    const replaceMetaPath = (entries: AppSettings['recentWorkspaceEntries']) => dedupeRecentMeta(
      entries.map((entry) => (entry.path === path ? { ...entry, path: nextPath } : entry))
    );
    const next: AppSettings = kind === 'workspace'
      ? {
        ...recentSettings,
        recentWorkspaces: replacePath(recentSettings.recentWorkspaces),
        recentWorkspaceEntries: replaceMetaPath(recentSettings.recentWorkspaceEntries),
        pinnedWorkspaces: replacePath(recentSettings.pinnedWorkspaces),
        lastWorkspace: recentSettings.lastWorkspace === path ? nextPath : recentSettings.lastWorkspace
      }
      : {
        ...recentSettings,
        recentFiles: replacePath(recentSettings.recentFiles),
        recentFileEntries: replaceMetaPath(recentSettings.recentFileEntries),
        pinnedFiles: replacePath(recentSettings.pinnedFiles),
        lastFile: recentSettings.lastFile === path ? nextPath : recentSettings.lastFile
      };

    await persistRecentSettings(next, locale === 'zh' ? '最近路径已迁移' : 'Recent path migrated');
  };

  const batchReplaceRecentPaths = async () => {
    if (!recentSettings) return;
    const fromPrefix = window.prompt(
      locale === 'zh' ? '输入需要批量替换的旧路径前缀' : 'Enter the old path prefix to replace'
    )?.trim();
    if (!fromPrefix) return;
    const toPrefix = window.prompt(
      locale === 'zh' ? '输入新的路径前缀' : 'Enter the new path prefix',
      fromPrefix
    )?.trim();
    if (!toPrefix || toPrefix === fromPrefix) return;

    const migratePath = (path: string) => migrateRecentPathPrefix(path, fromPrefix, toPrefix);
    const migratePaths = (paths: string[]) => dedupePaths(paths.map(migratePath));
    const migrateMeta = (entries: AppSettings['recentWorkspaceEntries']) => dedupeRecentMeta(
      entries.map((entry) => ({ ...entry, path: migratePath(entry.path) }))
    );
    const next: AppSettings = {
      ...recentSettings,
      recentWorkspaces: migratePaths(recentSettings.recentWorkspaces),
      recentWorkspaceEntries: migrateMeta(recentSettings.recentWorkspaceEntries),
      recentFiles: migratePaths(recentSettings.recentFiles),
      recentFileEntries: migrateMeta(recentSettings.recentFileEntries),
      pinnedWorkspaces: migratePaths(recentSettings.pinnedWorkspaces),
      pinnedFiles: migratePaths(recentSettings.pinnedFiles),
      lastWorkspace: recentSettings.lastWorkspace ? migratePath(recentSettings.lastWorkspace) : null,
      lastFile: recentSettings.lastFile ? migratePath(recentSettings.lastFile) : null
    };

    const changedCount = countMigratedRecentPaths(recentSettings, fromPrefix);
    await persistRecentSettings(
      next,
      changedCount === 0
        ? (locale === 'zh' ? '没有找到匹配的路径前缀' : 'No matching path prefix found')
        : (locale === 'zh' ? `已批量迁移 ${changedCount} 条路径` : `${changedCount} paths migrated`)
    );
  };

  const clearRecentEntries = async () => {
    if (!recentSettings) return;
    const confirmed = window.confirm(locale === 'zh' ? '清空所有最近文件和目录？固定项目也会移除。' : 'Clear all recent files and folders? Pinned entries will also be removed.');
    if (!confirmed) return;

    await persistRecentSettings(
      {
        ...recentSettings,
        recentWorkspaces: [],
        recentWorkspaceEntries: [],
        recentFiles: [],
        recentFileEntries: [],
        pinnedWorkspaces: [],
        pinnedFiles: [],
        lastWorkspace: null,
        lastFile: null
      },
      locale === 'zh' ? '最近项目已清空' : 'Recent entries cleared'
    );
  };

  const pruneRecentEntries = async () => {
    try {
      setRecentMessage('');
      const pruned = await pruneMissingRecentEntries();
      setRecentSettings(pruned);
      setRecentMessage(locale === 'zh' ? '已清理不存在的最近项目' : 'Missing recent entries removed');
    } catch (error: any) {
      setRecentMessage(`${locale === 'zh' ? '清理失败' : 'Cleanup failed'}: ${sanitizeAiError(error, locale)}`);
    }
  };

  return {
    recentSettings,
    recentMessage,
    recentQuery,
    recentSortMode,
    setRecentQuery,
    setRecentSortMode,
    togglePinnedRecent,
    reorderPinnedRecent,
    replaceRecentEntryPath,
    batchReplaceRecentPaths,
    removeRecentEntry,
    clearRecentEntries,
    pruneRecentEntries
  };
}
