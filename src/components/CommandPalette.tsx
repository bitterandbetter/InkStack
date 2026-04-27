import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  BookOpen,
  Braces,
  ChevronLeft,
  ChevronRight,
  Code,
  Code2,
  Columns2,
  FilePlus2,
  FileText,
  FolderOpen,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Italic,
  Languages,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Moon,
  PanelLeft,
  Pilcrow,
  Quote,
  Save,
  Search,
  Settings,
  Sparkles,
  Strikethrough,
  Table2,
  TextSearch,
  Wand2,
  WholeWord,
  Sun
} from 'lucide-react';
import { useStore } from '../store';
import { getSettings, searchTextFiles, type AppSettings, type MarkdownSearchResult } from '../lib/fs';
import {
  createUntitledMarkdownFile,
  openTextPath,
  openWorkspacePath,
  saveActiveFile
} from '../lib/desktopActions';
import { openDirectory, openMarkdownFileDialog } from '../lib/fs';
import { cn } from '../lib/utils';
import { BUILT_IN_THEMES } from '../lib/themes';
import { emitAiPanelTab, emitEditorCommand, type AiPanelTab, type MarkdownEditorCommand } from '../lib/appEvents';
import type { EditorAiPromptKey } from '../lib/aiPrompts';
import { fileNameFromPath } from '../lib/path';

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
    toggleThemeMode,
    toggleSidebar,
    isDarkMode,
    activeFile,
    editorSelection,
    themeState,
    setActiveThemeId,
    readingSettings,
    setReadingSettings,
    resetReadingSettings,
    canGoBack,
    canGoForward,
    goBack,
    goForward
  } = useStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MarkdownSearchResult[]>([]);
  const [recentSettings, setRecentSettings] = useState<AppSettings | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!commandPaletteOpen) return;
    setQuery('');
    setResults([]);
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
    void getSettings()
      .then(setRecentSettings)
      .catch((error) => {
        console.error('Failed to load recent entries', error);
        setRecentSettings(null);
      });
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
    const openAiTab = (tab: AiPanelTab) => {
      if (!useStore.getState().aiPanelOpen) toggleAiPanel();
      emitAiPanelTab(tab);
    };
    const isMarkdownEditable = Boolean(activeFile?.isMarkdown && !activeFile.readOnly);
    const hasSelection = Boolean(editorSelection?.text.trim());
    const commandDisabledSubtitle = locale === 'zh' ? '需要打开可编辑 Markdown 文档' : 'Open an editable Markdown document first';
    const selectionDisabledSubtitle = locale === 'zh' ? '需要先选中文本' : 'Select text first';
    const markdownCommand = (
      id: string,
      title: string,
      action: MarkdownEditorCommand,
      icon: React.ReactNode,
      subtitle?: string
    ): CommandItem => ({
      id,
      title,
      subtitle: isMarkdownEditable ? subtitle : commandDisabledSubtitle,
      icon,
      run: () => {
        if (!useStore.getState().activeFile?.isMarkdown || useStore.getState().activeFile?.readOnly) return false;
        emitEditorCommand({ type: 'markdown', action });
      }
    });
    const selectionAiCommand = (
      id: string,
      title: string,
      action: EditorAiPromptKey,
      icon: React.ReactNode
    ): CommandItem => ({
      id,
      title,
      subtitle: hasSelection ? (locale === 'zh' ? '对当前选区执行 AI 命令' : 'Run on the current selection') : selectionDisabledSubtitle,
      icon,
      run: () => {
        if (!useStore.getState().editorSelection?.text.trim()) return false;
        emitEditorCommand({ type: 'selection-ai', action });
      }
    });
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
      ...(mergePinnedRecentEntries(recentSettings?.pinnedWorkspaces ?? [], recentSettings?.recentWorkspaces ?? [], 6).map(({ path, pinned }) => ({
        id: `${pinned ? 'pinned' : 'recent'}-workspace:${path}`,
        title: locale === 'zh'
          ? `${pinned ? '固定目录' : '最近目录'}：${fileNameFromPath(path) || path}`
          : `${pinned ? 'Pinned folder' : 'Recent folder'}: ${fileNameFromPath(path) || path}`,
        subtitle: path,
        icon: <FolderOpen size={15} />,
        run: async () => {
          await openWorkspacePath(path);
        }
      } satisfies CommandItem)) ?? []),
      ...(mergePinnedRecentEntries(recentSettings?.pinnedFiles ?? [], recentSettings?.recentFiles ?? [], 10).map(({ path, pinned }) => ({
        id: `${pinned ? 'pinned' : 'recent'}-file:${path}`,
        title: locale === 'zh'
          ? `${pinned ? '固定文件' : '最近文件'}：${fileNameFromPath(path) || path}`
          : `${pinned ? 'Pinned file' : 'Recent file'}: ${fileNameFromPath(path) || path}`,
        subtitle: path,
        icon: <FileText size={15} />,
        run: async () => {
          await openTextPath(path);
        }
      } satisfies CommandItem)) ?? []),
      {
        id: 'find',
        title: locale === 'zh' ? '查找 / 替换当前文档' : 'Find / replace in current document',
        subtitle: 'Cmd/Ctrl+F',
        icon: <Search size={15} />,
        run: () => emitEditorCommand({ type: 'find' })
      },
      {
        id: 'history-back',
        title: locale === 'zh' ? '返回上一个文档' : 'Back to previous document',
        subtitle: canGoBack ? undefined : (locale === 'zh' ? '没有可返回的标签历史' : 'No previous tab history'),
        icon: <ChevronLeft size={15} />,
        run: () => {
          if (useStore.getState().canGoBack) goBack();
        }
      },
      {
        id: 'history-forward',
        title: locale === 'zh' ? '前进到下一个文档' : 'Forward to next document',
        subtitle: canGoForward ? undefined : (locale === 'zh' ? '没有可前进的标签历史' : 'No forward tab history'),
        icon: <ChevronRight size={15} />,
        run: () => {
          if (useStore.getState().canGoForward) goForward();
        }
      },
      {
        id: 'toggle-ai',
        title: locale === 'zh' ? '切换 AI 面板' : 'Toggle AI panel',
        subtitle: locale === 'zh' ? '打开写作助手与模型设置' : 'Open assistant and model settings',
        icon: <Bot size={15} />,
        run: toggleAiPanel
      },
      {
        id: 'ai-chat',
        title: locale === 'zh' ? '打开 AI 对话' : 'Open AI chat',
        subtitle: locale === 'zh' ? '切到 AI 助手页' : 'Switch to the AI assistant tab',
        icon: <Sparkles size={15} />,
        run: () => openAiTab('ai')
      },
      {
        id: 'ai-outline',
        title: locale === 'zh' ? '打开智能大纲' : 'Open smart outline',
        subtitle: locale === 'zh' ? '标题、代码块和代码符号' : 'Headings, code blocks, and code symbols',
        icon: <Pilcrow size={15} />,
        run: () => openAiTab('outline')
      },
      {
        id: 'ai-code',
        title: locale === 'zh' ? '打开代码面板' : 'Open code panel',
        subtitle: locale === 'zh' ? '查看、筛选、复制和解释代码块' : 'Inspect, filter, copy, and explain code blocks',
        icon: <Code2 size={15} />,
        run: () => openAiTab('code')
      },
      {
        id: 'ai-settings',
        title: locale === 'zh' ? '打开 AI 与主题设置' : 'Open AI and theme settings',
        subtitle: locale === 'zh' ? '模型、提示词、主题导入与导出' : 'Models, prompts, theme import and export',
        icon: <Settings size={15} />,
        run: () => openAiTab('settings')
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
        run: toggleThemeMode
      },
      ...BUILT_IN_THEMES.map((theme) => ({
        id: `theme-${theme.id}`,
        title: locale === 'zh' ? `切换主题：${theme.name}` : `Switch theme: ${theme.name}`,
        subtitle: themeState.activeThemeId === theme.id
          ? (locale === 'zh' ? '当前主题' : 'Current theme')
          : (locale === 'zh' ? '内置主题' : 'Built-in theme'),
        icon: theme.id === 'dark' || theme.id === 'code-docs' ? <Moon size={15} /> : <Sun size={15} />,
        run: () => setActiveThemeId(theme.id)
      })),
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
      },
      {
        id: 'reading-width-up',
        title: locale === 'zh' ? '阅读宽度增加' : 'Increase reading width',
        subtitle: `${readingSettings.width}px`,
        icon: <Columns2 size={15} />,
        run: () => setReadingSettings({ width: readingSettings.width + 40 })
      },
      {
        id: 'reading-width-down',
        title: locale === 'zh' ? '阅读宽度减少' : 'Decrease reading width',
        subtitle: `${readingSettings.width}px`,
        icon: <Columns2 size={15} />,
        run: () => setReadingSettings({ width: readingSettings.width - 40 })
      },
      {
        id: 'reading-font-up',
        title: locale === 'zh' ? '阅读字号增加' : 'Increase reading font size',
        subtitle: `${readingSettings.fontSize}px`,
        icon: <WholeWord size={15} />,
        run: () => setReadingSettings({ fontSize: readingSettings.fontSize + 1 })
      },
      {
        id: 'reading-font-down',
        title: locale === 'zh' ? '阅读字号减少' : 'Decrease reading font size',
        subtitle: `${readingSettings.fontSize}px`,
        icon: <WholeWord size={15} />,
        run: () => setReadingSettings({ fontSize: readingSettings.fontSize - 1 })
      },
      {
        id: 'reading-reset',
        title: locale === 'zh' ? '重置阅读设置' : 'Reset reading settings',
        icon: <BookOpen size={15} />,
        run: resetReadingSettings
      },
      markdownCommand('md-h1', locale === 'zh' ? '插入一级标题' : 'Insert heading 1', 'heading1', <Heading1 size={15} />, 'Cmd/Ctrl+1'),
      markdownCommand('md-h2', locale === 'zh' ? '插入二级标题' : 'Insert heading 2', 'heading2', <Heading2 size={15} />, 'Cmd/Ctrl+2'),
      markdownCommand('md-h3', locale === 'zh' ? '插入三级标题' : 'Insert heading 3', 'heading3', <Heading3 size={15} />, 'Cmd/Ctrl+3'),
      markdownCommand('md-bold', locale === 'zh' ? '加粗选区' : 'Bold selection', 'bold', <Braces size={15} />, 'Cmd/Ctrl+B'),
      markdownCommand('md-italic', locale === 'zh' ? '斜体选区' : 'Italic selection', 'italic', <Italic size={15} />, 'Cmd/Ctrl+I'),
      markdownCommand('md-strike', locale === 'zh' ? '删除线' : 'Strikethrough', 'strike', <Strikethrough size={15} />),
      markdownCommand('md-inline-code', locale === 'zh' ? '行内代码' : 'Inline code', 'inlineCode', <Code size={15} />),
      markdownCommand('md-code-block', locale === 'zh' ? '插入代码块' : 'Insert code block', 'codeBlock', <Code2 size={15} />),
      markdownCommand('md-quote', locale === 'zh' ? '引用块' : 'Block quote', 'quote', <Quote size={15} />),
      markdownCommand('md-bullet', locale === 'zh' ? '无序列表' : 'Bulleted list', 'bulletList', <List size={15} />),
      markdownCommand('md-ordered', locale === 'zh' ? '有序列表' : 'Ordered list', 'orderedList', <ListOrdered size={15} />),
      markdownCommand('md-task', locale === 'zh' ? '任务列表' : 'Task list', 'taskList', <ListChecks size={15} />),
      markdownCommand('md-link', locale === 'zh' ? '插入链接' : 'Insert link', 'link', <Link size={15} />, 'Cmd/Ctrl+K'),
      markdownCommand('md-image', locale === 'zh' ? '插入图片语法' : 'Insert image syntax', 'image', <Image size={15} />),
      markdownCommand('md-table', locale === 'zh' ? '插入 Markdown 表格' : 'Insert Markdown table', 'table', <Table2 size={15} />),
      markdownCommand('md-table-format', locale === 'zh' ? '格式化当前表格' : 'Format current table', 'formatTable', <Table2 size={15} />),
      markdownCommand('md-table-row', locale === 'zh' ? '表格：在下方插入行' : 'Table: insert row below', 'insertTableRow', <ListOrdered size={15} />),
      markdownCommand('md-table-column', locale === 'zh' ? '表格：在右侧插入列' : 'Table: insert column right', 'insertTableColumn', <Columns2 size={15} />),
      markdownCommand('md-table-paste-csv', locale === 'zh' ? '从剪贴板 CSV/TSV 插入表格' : 'Insert table from clipboard CSV/TSV', 'pasteCsvTable', <Table2 size={15} />),
      markdownCommand('md-divider', locale === 'zh' ? '插入分割线' : 'Insert divider', 'divider', <Minus size={15} />),
      selectionAiCommand('ai-selection-rewrite', locale === 'zh' ? 'AI 改写选区' : 'AI rewrite selection', 'rewrite', <Wand2 size={15} />),
      selectionAiCommand('ai-selection-polish', locale === 'zh' ? 'AI 润色选区' : 'AI polish selection', 'polish', <Sparkles size={15} />),
      selectionAiCommand('ai-selection-expand', locale === 'zh' ? 'AI 扩写选区' : 'AI expand selection', 'expand', <Columns2 size={15} />),
      selectionAiCommand('ai-selection-translate', locale === 'zh' ? 'AI 翻译选区' : 'AI translate selection', 'translate', <Languages size={15} />),
      selectionAiCommand('ai-selection-summarize', locale === 'zh' ? 'AI 总结选区' : 'AI summarize selection', 'summarize', <FileText size={15} />),
      selectionAiCommand('ai-selection-ask', locale === 'zh' ? '向 AI 提问选区' : 'Ask AI about selection', 'ask', <Bot size={15} />)
    ];

    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return items;

    return items.filter((item) => (
      item.title.toLowerCase().includes(normalizedQuery)
      || item.subtitle?.toLowerCase().includes(normalizedQuery)
    ));
  }, [
    activeFile,
    canGoBack,
    canGoForward,
    editorSelection,
    goBack,
    goForward,
    isDarkMode,
    locale,
    query,
    recentSettings?.recentFiles,
    recentSettings?.pinnedFiles,
    recentSettings?.pinnedWorkspaces,
    recentSettings?.recentWorkspaces,
    readingSettings,
    resetReadingSettings,
    setActiveThemeId,
    setReadingSettings,
    setViewMode,
    themeState.activeThemeId,
    toggleAiPanel,
    toggleThemeMode,
    toggleSidebar
  ]);

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

function mergePinnedRecentEntries(pinned: string[], recent: string[], limit: number) {
  const entries: Array<{ path: string; pinned: boolean }> = [];
  const seen = new Set<string>();

  for (const path of pinned) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    entries.push({ path, pinned: true });
  }

  for (const path of recent) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    entries.push({ path, pinned: false });
  }

  return entries.slice(0, limit);
}
