import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  FilePlus2,
  FileText,
  FolderOpen,
  Moon,
  PanelLeft,
  Save,
  Search,
  TextSearch,
  Sun
} from 'lucide-react';
import { useStore } from '../store';
import { searchTextFiles, type MarkdownSearchResult } from '../lib/fs';
import {
  createUntitledMarkdownFile,
  openTextPath,
  openWorkspacePath,
  saveActiveFile
} from '../lib/desktopActions';
import { openDirectory, openMarkdownFileDialog } from '../lib/fs';
import { cn } from '../lib/utils';

type CommandItem = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  icon: React.ReactNode;
  run: () => void | boolean | Promise<void | boolean>;
};

const SEARCH_DEBOUNCE_MS = 120;

export function CommandPalette() {
  const {
    commandPaletteOpen,
    closeCommandPalette,
    locale,
    rootPath,
    setViewMode,
    toggleAiPanel,
    toggleDarkMode,
    toggleSidebar,
    isDarkMode
  } = useStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MarkdownSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!commandPaletteOpen) return;
    setQuery('');
    setResults([]);
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [commandPaletteOpen]);

  useEffect(() => {
    if (!commandPaletteOpen || !rootPath) return;

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        setIsSearching(true);
        const nextResults = await searchTextFiles(query);
        if (!cancelled) setResults(nextResults);
      } catch (error) {
        console.error('Workspace search failed', error);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [commandPaletteOpen, query, rootPath]);

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      {
        id: 'new-file',
        title: locale === 'zh' ? '新建 Markdown 文档' : 'New Markdown document',
        subtitle: locale === 'zh' ? '创建一个未保存的新文档' : 'Create an unsaved Markdown file',
        icon: <FilePlus2 size={15} />,
        run: createUntitledMarkdownFile
      },
      {
        id: 'open-file',
        title: locale === 'zh' ? '打开文本或代码文件' : 'Open text or code file',
        subtitle: locale === 'zh' ? '使用系统文件选择器' : 'Use the native file picker',
        icon: <FileText size={15} />,
        run: async () => {
          const path = await openMarkdownFileDialog();
          if (path) await openTextPath(path);
        }
      },
      {
        id: 'open-workspace',
        title: locale === 'zh' ? '打开本地目录' : 'Open local folder',
        subtitle: locale === 'zh' ? '载入 Markdown / 代码工作区' : 'Load a Markdown / code workspace',
        icon: <FolderOpen size={15} />,
        run: async () => {
          const path = await openDirectory();
          if (path) await openWorkspacePath(path);
        }
      },
      {
        id: 'save',
        title: locale === 'zh' ? '保存当前文档' : 'Save current document',
        subtitle: 'Cmd/Ctrl+S',
        icon: <Save size={15} />,
        run: saveActiveFile
      },
      {
        id: 'toggle-ai',
        title: locale === 'zh' ? '切换 AI 面板' : 'Toggle AI panel',
        subtitle: locale === 'zh' ? '打开写作助手与模型设置' : 'Open assistant and model settings',
        icon: <Bot size={15} />,
        run: toggleAiPanel
      },
      {
        id: 'toggle-sidebar',
        title: locale === 'zh' ? '切换侧边栏' : 'Toggle sidebar',
        icon: <PanelLeft size={15} />,
        run: toggleSidebar
      },
      {
        id: 'theme',
        title: isDarkMode
          ? (locale === 'zh' ? '切换到浅色主题' : 'Switch to light theme')
          : (locale === 'zh' ? '切换到深色主题' : 'Switch to dark theme'),
        icon: isDarkMode ? <Sun size={15} /> : <Moon size={15} />,
        run: toggleDarkMode
      },
      {
        id: 'view-split',
        title: locale === 'zh' ? '切换到分屏模式' : 'Switch to split view',
        icon: <PanelLeft size={15} />,
        run: () => setViewMode('split')
      },
      {
        id: 'view-edit',
        title: locale === 'zh' ? '切换到编辑模式' : 'Switch to edit view',
        icon: <FileText size={15} />,
        run: () => setViewMode('edit')
      },
      {
        id: 'view-read',
        title: locale === 'zh' ? '切换到阅读模式' : 'Switch to read view',
        icon: <Search size={15} />,
        run: () => setViewMode('read')
      }
    ];

    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return items;

    return items.filter((item) => (
      item.title.toLowerCase().includes(normalizedQuery)
      || item.subtitle?.toLowerCase().includes(normalizedQuery)
    ));
  }, [isDarkMode, locale, query, setViewMode, toggleAiPanel, toggleDarkMode, toggleSidebar]);

  const fileItems = useMemo<CommandItem[]>(() => results.map((file) => ({
    id: `${file.matchKind}:${file.path}:${file.line ?? 0}`,
    title: file.matchKind === 'content' && file.line
      ? `${file.name}:${file.line}`
      : file.name,
    subtitle: file.matchKind === 'content' && file.snippet
      ? file.snippet
      : file.relativePath,
    meta: file.matchKind === 'content' ? file.relativePath : undefined,
    icon: file.matchKind === 'content' ? <TextSearch size={15} /> : <FileText size={15} />,
    run: () => openTextPath(file.path, file.line)
  })), [results]);

  const items = query.trim() ? [...fileItems, ...commands] : [...commands, ...fileItems];
  const clampedActiveIndex = Math.min(activeIndex, Math.max(items.length - 1, 0));

  useEffect(() => {
    setActiveIndex(0);
  }, [query, commandPaletteOpen]);

  useEffect(() => {
    if (activeIndex !== clampedActiveIndex) setActiveIndex(clampedActiveIndex);
  }, [activeIndex, clampedActiveIndex]);

  if (!commandPaletteOpen) return null;

  const runItem = async (item: CommandItem | undefined) => {
    if (!item) return;
    closeCommandPalette();
    await item.run();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      closeCommandPalette();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, items.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void runItem(items[clampedActiveIndex]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/25 flex items-start justify-center pt-[12vh]" onMouseDown={closeCommandPalette}>
      <div
        className="w-[42rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border-subtle bg-bg-base shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
          <Search size={17} className="text-text-tertiary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={locale === 'zh' ? '搜索文件或输入命令...' : 'Search files or type a command...'}
            className="h-8 flex-1 bg-transparent text-[14px] text-text-primary outline-none placeholder:text-text-tertiary"
          />
          {isSearching && <span className="text-[11px] text-text-tertiary">{locale === 'zh' ? '搜索中' : 'Searching'}</span>}
        </div>

        <div className="max-h-[24rem] overflow-y-auto p-2">
          {items.length === 0 ? (
            <div className="px-3 py-10 text-center text-[13px] text-text-tertiary">
              {rootPath
                ? (locale === 'zh' ? '没有匹配结果' : 'No matches')
                : (locale === 'zh' ? '先打开一个本地目录以搜索文件' : 'Open a local folder to search files')}
            </div>
          ) : (
            items.map((item, index) => (
              <button
                key={item.id}
                onClick={() => void runItem(item)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
                  index === clampedActiveIndex ? 'bg-bg-hover text-text-primary' : 'text-text-secondary'
                )}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border-subtle bg-bg-panel text-accent">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{item.title}</span>
                  {item.subtitle && <span className="block truncate text-[11px] text-text-tertiary">{item.subtitle}</span>}
                  {item.meta && <span className="block truncate text-[10px] text-text-tertiary/80">{item.meta}</span>}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
