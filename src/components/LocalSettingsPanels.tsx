import { Clock3, FileCode2, FolderOpen, GripVertical, Pencil, Pin, PinOff, RefreshCw, Search, Trash2, X } from 'lucide-react';
import type { SaveHistoryEntry } from '../store';
import type { AppSettings } from '../lib/fs';
import { fileNameFromPath } from '../lib/path';
import { cn } from '../lib/utils';

export type RecentSortMode = 'recent' | 'name' | 'path';
export type SaveHistoryFilter = 'all' | 'failed' | 'success' | 'auto' | 'conflict';

type RecentEntryView = { path: string; pinned: boolean; openedAt: number | null };

export function RecentEntriesPanel({
  locale,
  settings,
  message,
  query,
  sortMode,
  maxPinned,
  onQueryChange,
  onSortModeChange,
  onOpenWorkspace,
  onOpenFile,
  onTogglePin,
  onReorderPinned,
  onReplacePath,
  onBatchReplacePaths,
  onRemove,
  onClear,
  onPrune
}: {
  locale: 'zh' | 'en';
  settings: AppSettings | null;
  message: string;
  query: string;
  sortMode: RecentSortMode;
  maxPinned: number;
  onQueryChange: (query: string) => void;
  onSortModeChange: (sortMode: RecentSortMode) => void;
  onOpenWorkspace: (path: string) => void;
  onOpenFile: (path: string) => void;
  onTogglePin: (kind: 'workspace' | 'file', path: string) => void;
  onReorderPinned: (kind: 'workspace' | 'file', draggedPath: string, targetPath: string) => void;
  onReplacePath: (kind: 'workspace' | 'file', path: string) => void;
  onBatchReplacePaths: () => void;
  onRemove: (kind: 'workspace' | 'file', path: string) => void;
  onClear: () => void;
  onPrune: () => void;
}) {
  const allWorkspaces = mergeRecentEntries(settings?.pinnedWorkspaces ?? [], settings?.recentWorkspaces ?? [], settings?.recentWorkspaceEntries ?? []);
  const allFiles = mergeRecentEntries(settings?.pinnedFiles ?? [], settings?.recentFiles ?? [], settings?.recentFileEntries ?? []);
  const normalizedQuery = query.trim().toLowerCase();
  const workspaces = sortRecentEntries(filterRecentEntries(allWorkspaces, normalizedQuery), sortMode);
  const files = sortRecentEntries(filterRecentEntries(allFiles, normalizedQuery), sortMode);
  const empty = allWorkspaces.length === 0 && allFiles.length === 0;
  const filteredEmpty = !empty && workspaces.length === 0 && files.length === 0;
  const pinnedCount = (settings?.pinnedWorkspaces.length ?? 0) + (settings?.pinnedFiles.length ?? 0);
  const totalCount = allWorkspaces.length + allFiles.length;

  return (
    <div className="space-y-3 rounded-md border border-border-subtle bg-bg-base p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
            {locale === 'zh' ? '最近项目' : 'Recent Entries'}
          </div>
          <div className="mt-0.5 text-[11px] text-text-tertiary">
            {locale === 'zh' ? '固定常用目录或清理失效记录' : 'Pin frequent entries or remove stale paths'}
          </div>
          <div className="mt-1 text-[10px] text-text-tertiary">
            {locale === 'zh'
              ? `共 ${totalCount} 项，已固定 ${pinnedCount}/${maxPinned}`
              : `${totalCount} entries, ${pinnedCount}/${maxPinned} pinned`}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={onBatchReplacePaths}
            disabled={empty}
            className="rounded border border-border-subtle bg-bg-panel p-1.5 text-text-tertiary hover:bg-bg-hover hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            title={locale === 'zh' ? '批量迁移路径前缀' : 'Batch replace path prefix'}
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onPrune}
            className="rounded border border-border-subtle bg-bg-panel p-1.5 text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
            title={locale === 'zh' ? '清理失效路径' : 'Prune missing paths'}
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={onClear}
            disabled={empty}
            className="rounded border border-border-subtle bg-bg-panel p-1.5 text-text-tertiary hover:bg-bg-hover hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
            title={locale === 'zh' ? '清空最近项目' : 'Clear recent entries'}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded border border-border-subtle bg-bg-panel px-2 py-1.5">
        <Search size={13} className="shrink-0 text-text-tertiary" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={locale === 'zh' ? '搜索最近路径...' : 'Search recent paths...'}
          className="min-w-0 flex-1 bg-transparent text-[12px] text-text-primary outline-none placeholder:text-text-tertiary"
        />
        {query && (
          <button
            onClick={() => onQueryChange('')}
            className="rounded p-0.5 text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
            title={locale === 'zh' ? '清空搜索' : 'Clear search'}
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 rounded border border-border-subtle bg-bg-panel p-1">
        {(['recent', 'name', 'path'] as RecentSortMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => onSortModeChange(mode)}
            className={cn(
              'flex-1 rounded px-2 py-1 text-[11px] transition-colors',
              sortMode === mode
                ? 'bg-bg-base text-text-primary shadow-sm'
                : 'text-text-tertiary hover:bg-bg-hover hover:text-text-primary'
            )}
          >
            {recentSortLabel(mode, locale)}
          </button>
        ))}
      </div>

      {empty ? (
        <div className="rounded border border-dashed border-border-subtle bg-bg-panel/50 px-3 py-3 text-center text-[12px] text-text-tertiary">
          {settings
            ? (locale === 'zh' ? '暂无最近文件或目录' : 'No recent files or folders yet')
            : (locale === 'zh' ? '正在读取最近项目...' : 'Loading recent entries...')}
        </div>
      ) : filteredEmpty ? (
        <div className="rounded border border-dashed border-border-subtle bg-bg-panel/50 px-3 py-3 text-center text-[12px] text-text-tertiary">
          {locale === 'zh' ? '没有匹配的最近项目' : 'No matching recent entries'}
        </div>
      ) : (
        <div className="space-y-3">
          <RecentEntryGroup
            title={locale === 'zh' ? '目录' : 'Folders'}
            kind="workspace"
            entries={workspaces}
            locale={locale}
            onOpen={onOpenWorkspace}
            onTogglePin={(path) => onTogglePin('workspace', path)}
            onReorderPinned={(draggedPath, targetPath) => onReorderPinned('workspace', draggedPath, targetPath)}
            onReplacePath={(path) => onReplacePath('workspace', path)}
            onRemove={(path) => onRemove('workspace', path)}
          />
          <RecentEntryGroup
            title={locale === 'zh' ? '文件' : 'Files'}
            kind="file"
            entries={files}
            locale={locale}
            onOpen={onOpenFile}
            onTogglePin={(path) => onTogglePin('file', path)}
            onReorderPinned={(draggedPath, targetPath) => onReorderPinned('file', draggedPath, targetPath)}
            onReplacePath={(path) => onReplacePath('file', path)}
            onRemove={(path) => onRemove('file', path)}
          />
        </div>
      )}

      {message && (
        <div className="rounded bg-bg-panel px-2 py-1.5 text-[11px] text-text-tertiary">
          {message}
        </div>
      )}
    </div>
  );
}

function RecentEntryGroup({
  title,
  kind,
  entries,
  locale,
  onOpen,
  onTogglePin,
  onReorderPinned,
  onReplacePath,
  onRemove
}: {
  title: string;
  kind: 'workspace' | 'file';
  entries: RecentEntryView[];
  locale: 'zh' | 'en';
  onOpen: (path: string) => void;
  onTogglePin: (path: string) => void;
  onReorderPinned: (draggedPath: string, targetPath: string) => void;
  onReplacePath: (path: string) => void;
  onRemove: (path: string) => void;
}) {
  if (entries.length === 0) return null;

  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-text-secondary">{title}</div>
      <div className="space-y-1">
        {entries.map((entry) => (
          <div
            key={`${kind}-${entry.path}`}
            onDragOver={(event) => {
              if (entry.pinned) event.preventDefault();
            }}
            onDrop={(event) => {
              if (!entry.pinned) return;
              const draggedPath = event.dataTransfer.getData('text/inkstack-recent-path');
              if (draggedPath) onReorderPinned(draggedPath, entry.path);
            }}
            className="flex items-center gap-1 rounded border border-border-subtle bg-bg-panel/60 px-2 py-1.5"
          >
            <button
              draggable={entry.pinned}
              onDragStart={(event) => {
                event.dataTransfer.setData('text/inkstack-recent-path', entry.path);
                event.dataTransfer.effectAllowed = 'move';
              }}
              className={cn(
                'rounded p-0.5 text-text-tertiary',
                entry.pinned ? 'cursor-grab hover:bg-bg-hover hover:text-text-primary active:cursor-grabbing' : 'cursor-not-allowed opacity-30'
              )}
              title={entry.pinned
                ? (locale === 'zh' ? '拖拽调整固定顺序' : 'Drag to reorder pinned entries')
                : (locale === 'zh' ? '固定后可拖拽排序' : 'Pin to enable drag sorting')}
            >
              <GripVertical size={12} />
            </button>
            {kind === 'workspace'
              ? <FolderOpen size={13} className="shrink-0 text-text-tertiary" />
              : <FileCode2 size={13} className="shrink-0 text-text-tertiary" />}
            <button
              onClick={() => onOpen(entry.path)}
              className="min-w-0 flex-1 text-left"
              title={entry.path}
            >
              <span className="block truncate text-[12px] text-text-primary">{fileNameFromPath(entry.path) || entry.path}</span>
              <span className="block truncate text-[10px] text-text-tertiary">{entry.path}</span>
              <span className="mt-0.5 block text-[10px] text-text-tertiary">
                {locale === 'zh' ? '上次打开：' : 'Opened: '}
                {formatRecentOpenedAt(entry.openedAt, locale)}
              </span>
            </button>
            <button
              onClick={() => onTogglePin(entry.path)}
              className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-accent"
              title={entry.pinned ? (locale === 'zh' ? '取消固定' : 'Unpin') : (locale === 'zh' ? '固定' : 'Pin')}
            >
              {entry.pinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>
            <button
              onClick={() => onReplacePath(entry.path)}
              className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-accent"
              title={locale === 'zh' ? '迁移路径' : 'Replace path'}
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => onRemove(entry.path)}
              className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-red-500"
              title={locale === 'zh' ? '移除记录' : 'Remove'}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LocalSavePanel({
  locale,
  rootPath,
  autoSaveEnabled,
  history,
  filter,
  onToggleAutoSave,
  onResetWorkspaceAutoSave,
  onFilterChange,
  onClearHistory
}: {
  locale: 'zh' | 'en';
  rootPath: string | null;
  autoSaveEnabled: boolean;
  history: SaveHistoryEntry[];
  filter: SaveHistoryFilter;
  onToggleAutoSave: (enabled: boolean) => void;
  onResetWorkspaceAutoSave: () => void;
  onFilterChange: (filter: SaveHistoryFilter) => void;
  onClearHistory: () => void;
}) {
  const filteredHistory = filterSaveHistory(history, filter);
  const visibleHistory = filteredHistory.slice(0, 10);
  const failureCount = history.filter((entry) => !entry.success).length;

  return (
    <div className="space-y-3 rounded-md border border-border-subtle bg-bg-base p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
            {locale === 'zh' ? '本地保存' : 'Local Saving'}
          </div>
          <div className="mt-0.5 text-[11px] text-text-tertiary">
            {rootPath
              ? (locale === 'zh' ? '自动保存会记住当前工作区偏好' : 'Autosave is remembered for this workspace')
              : (locale === 'zh' ? '未打开目录时使用全局默认偏好' : 'Global default is used before a folder is open')}
          </div>
        </div>
        <button
          onClick={() => onToggleAutoSave(!autoSaveEnabled)}
          className={cn(
            'shrink-0 rounded px-2 py-1 text-[12px] font-medium transition-colors',
            autoSaveEnabled
              ? 'bg-accent/10 text-accent hover:bg-accent/20'
              : 'bg-bg-panel text-text-tertiary hover:bg-bg-hover hover:text-text-primary'
          )}
        >
          {autoSaveEnabled ? (locale === 'zh' ? '自动保存开启' : 'Autosave On') : (locale === 'zh' ? '自动保存关闭' : 'Autosave Off')}
        </button>
      </div>

      {rootPath && (
        <div className="flex items-center justify-between gap-2 rounded border border-border-subtle bg-bg-panel px-2 py-1.5">
          <span className="min-w-0 truncate text-[11px] text-text-tertiary" title={rootPath}>
            {rootPath}
          </span>
          <button
            onClick={onResetWorkspaceAutoSave}
            className="shrink-0 rounded px-2 py-1 text-[11px] text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            {locale === 'zh' ? '恢复默认' : 'Reset'}
          </button>
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-1 text-[11px] font-medium text-text-secondary">
            <Clock3 size={12} />
            {locale === 'zh' ? '保存历史' : 'Save History'}
          </div>
          <div className="flex items-center gap-1">
            {failureCount > 0 && (
              <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-500">
                {locale === 'zh' ? `${failureCount} 次失败` : `${failureCount} failed`}
              </span>
            )}
            <button
              onClick={onClearHistory}
              disabled={history.length === 0}
              className="rounded px-2 py-1 text-[11px] text-text-tertiary hover:bg-bg-hover hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {locale === 'zh' ? '清空' : 'Clear'}
            </button>
          </div>
        </div>

        <div className="mb-2 flex flex-wrap gap-1 rounded border border-border-subtle bg-bg-panel p-1">
          {(['all', 'failed', 'success', 'auto', 'conflict'] as SaveHistoryFilter[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onFilterChange(mode)}
              className={cn(
                'rounded px-2 py-1 text-[10px] transition-colors',
                filter === mode
                  ? 'bg-bg-base text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:bg-bg-hover hover:text-text-primary'
              )}
            >
              {saveHistoryFilterLabel(mode, locale)}
            </button>
          ))}
        </div>

        {history.length === 0 ? (
          <div className="rounded border border-dashed border-border-subtle bg-bg-panel/50 px-3 py-3 text-center text-[12px] text-text-tertiary">
            {locale === 'zh' ? '暂无保存记录' : 'No save events yet'}
          </div>
        ) : visibleHistory.length === 0 ? (
          <div className="rounded border border-dashed border-border-subtle bg-bg-panel/50 px-3 py-3 text-center text-[12px] text-text-tertiary">
            {locale === 'zh' ? '没有匹配的保存记录' : 'No matching save events'}
          </div>
        ) : (
          <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
            {visibleHistory.map((entry) => (
              <div key={entry.id} className="rounded border border-border-subtle bg-bg-panel/60 px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[12px] text-text-primary" title={entry.filePath}>
                    {entry.fileName}
                  </span>
                  <span className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-[10px]',
                    entry.success ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500'
                  )}>
                    {saveHistorySourceLabel(entry.source, locale)}
                  </span>
                </div>
                {!entry.success && (
                  <div className="mt-1 text-[10px] text-red-500">
                    {saveFailureTypeLabel(entry.failureType, locale)}
                  </div>
                )}
                <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-text-tertiary">
                  <span className="min-w-0 truncate">{entry.message}</span>
                  <span className="shrink-0">{formatSaveHistoryTime(entry.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function mergeRecentEntries(
  pinned: string[],
  recent: string[],
  meta: AppSettings['recentWorkspaceEntries']
) {
  const seen = new Set<string>();
  const entries: RecentEntryView[] = [];
  const openedAtByPath = new Map(meta.map((entry) => [entry.path, entry.openedAt]));

  for (const path of pinned) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    entries.push({ path, pinned: true, openedAt: openedAtByPath.get(path) ?? null });
  }

  for (const path of recent) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    entries.push({ path, pinned: false, openedAt: openedAtByPath.get(path) ?? null });
  }

  for (const entry of meta) {
    if (!entry.path || seen.has(entry.path)) continue;
    seen.add(entry.path);
    entries.push({ path: entry.path, pinned: false, openedAt: entry.openedAt });
  }

  return entries;
}

function filterRecentEntries(entries: RecentEntryView[], query: string) {
  if (!query) return entries;
  return entries.filter((entry) => {
    const name = fileNameFromPath(entry.path);
    return entry.path.toLowerCase().includes(query) || name.toLowerCase().includes(query);
  });
}

function sortRecentEntries(entries: RecentEntryView[], sortMode: RecentSortMode) {
  if (sortMode === 'recent') {
    return [...entries].sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      return (right.openedAt ?? 0) - (left.openedAt ?? 0);
    });
  }
  return [...entries].sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    const leftValue = sortMode === 'name' ? fileNameFromPath(left.path) || left.path : left.path;
    const rightValue = sortMode === 'name' ? fileNameFromPath(right.path) || right.path : right.path;
    return leftValue.localeCompare(rightValue, undefined, { sensitivity: 'base', numeric: true });
  });
}

function recentSortLabel(sortMode: RecentSortMode, locale: 'zh' | 'en') {
  if (sortMode === 'name') return locale === 'zh' ? '按名称' : 'Name';
  if (sortMode === 'path') return locale === 'zh' ? '按路径' : 'Path';
  return locale === 'zh' ? '最近' : 'Recent';
}

function formatRecentOpenedAt(openedAt: number | null, locale: 'zh' | 'en') {
  if (!openedAt) return locale === 'zh' ? '暂无打开时间' : 'No open time yet';
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(openedAt));
}

function saveHistorySourceLabel(source: SaveHistoryEntry['source'], locale: 'zh' | 'en') {
  if (source === 'auto') return locale === 'zh' ? '自动' : 'Auto';
  if (source === 'save-as') return locale === 'zh' ? '另存' : 'Save As';
  return locale === 'zh' ? '手动' : 'Manual';
}

function filterSaveHistory(history: SaveHistoryEntry[], filter: SaveHistoryFilter) {
  if (filter === 'failed') return history.filter((entry) => !entry.success);
  if (filter === 'success') return history.filter((entry) => entry.success);
  if (filter === 'auto') return history.filter((entry) => entry.source === 'auto');
  if (filter === 'conflict') return history.filter((entry) => entry.failureType === 'conflict');
  return history;
}

function saveHistoryFilterLabel(filter: SaveHistoryFilter, locale: 'zh' | 'en') {
  if (filter === 'failed') return locale === 'zh' ? '失败' : 'Failed';
  if (filter === 'success') return locale === 'zh' ? '成功' : 'Success';
  if (filter === 'auto') return locale === 'zh' ? '自动' : 'Auto';
  if (filter === 'conflict') return locale === 'zh' ? '冲突' : 'Conflicts';
  return locale === 'zh' ? '全部' : 'All';
}

function saveFailureTypeLabel(type: SaveHistoryEntry['failureType'], locale: 'zh' | 'en') {
  const labels: Record<SaveHistoryEntry['failureType'], { zh: string; en: string }> = {
    none: { zh: '无失败', en: 'No failure' },
    conflict: { zh: '外部修改冲突：请重新加载磁盘版本或另存为副本', en: 'External edit conflict: reload from disk or save a copy' },
    permission: { zh: '权限或只读问题：请检查文件权限和目录位置', en: 'Permission or read-only issue: check file access and folder location' },
    missing: { zh: '路径不存在：文件可能已移动或删除', en: 'Missing path: the file may have moved or been deleted' },
    readonly: { zh: '只读文件：当前文件不能直接保存', en: 'Read-only file: this document cannot be saved directly' },
    cancelled: { zh: '用户取消：未写入文件', en: 'Cancelled: no file was written' },
    unsupported: { zh: '不支持保存：当前仅直接保存 Markdown 文档', en: 'Unsupported save: only Markdown documents are writable' },
    unknown: { zh: '未知失败：请查看错误信息', en: 'Unknown failure: inspect the error message' }
  };
  return labels[type]?.[locale] ?? labels.unknown[locale];
}

function formatSaveHistoryTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));
}
