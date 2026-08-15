import Markdown from 'react-markdown';
import 'katex/dist/katex.min.css';
import type { CSSProperties } from 'react';
import { Bot, Check, ChevronDown, ChevronRight, Copy, FileCode2, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { cn } from '../lib/utils';
import {
  buildHeadingIndex,
  childrenToPlainText,
  preparePreviewMarkdown,
  rehypePlugins,
  remarkPlugins,
  TOC_PLACEHOLDER
} from '../features/preview/markdownPipeline';
import { PreviewCodeBlock } from '../features/preview/PreviewCodeBlock';
import { PreviewHeading } from '../features/preview/PreviewHeading';
import { PreviewImage } from '../features/preview/PreviewImage';
import { PreviewTable } from '../features/preview/PreviewTable';
import { PreviewToc } from '../features/preview/PreviewToc';
import { useDebouncedValue } from '../features/preview/useDebouncedValue';
import { codeFileToBlock, parseCodeBlocks, type CodeBlockInfo } from '../lib/outline';
import { emitAiPanelTab, emitAiSelection } from '../lib/appEvents';
import { InlineSelectionToolbar } from './InlineSelectionToolbar';

const PREVIEW_DEBOUNCE_MS = 180;

export function PreviewPane() {
  const { activeFileContent, viewMode, activeFile, locale, readingSettings, splitScrollSync, setPendingEditorLine, toggleAiPanel } = useStore();
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const syncingFromEditorRef = useRef(false);
  const [codeLanguageFilter, setCodeLanguageFilter] = useState('all');
  const [codeQuery, setCodeQuery] = useState('');
  const [collapsedCodeBlocks, setCollapsedCodeBlocks] = useState<string[]>([]);
  const [copiedCodeBlockId, setCopiedCodeBlockId] = useState<string | null>(null);
  const [copiedAllCodeBlocks, setCopiedAllCodeBlocks] = useState(false);
  const [previewSelection, setPreviewSelection] = useState('');
  const markdownContent = useMemo(() => preparePreviewMarkdown(activeFileContent), [activeFileContent]);
  const headings = useMemo(() => buildHeadingIndex(markdownContent), [markdownContent]);
  const displayContent = markdownContent || (locale === 'zh' ? '*这是一个空的文档。*' : '*This document is empty.*');
  const debouncedContent = useDebouncedValue(displayContent, PREVIEW_DEBOUNCE_MS);
  const renderedContent = viewMode === 'read' ? displayContent : debouncedContent;
  const previewStyle = {
    '--inkstack-reading-width': `${readingSettings.width}px`,
    '--inkstack-reading-font-size': `${readingSettings.fontSize}px`,
    '--inkstack-reading-line-height': String(readingSettings.lineHeight),
    '--inkstack-reading-paragraph-spacing': `${readingSettings.paragraphSpacing}em`,
    '--inkstack-reading-font-family': readingFontFamily(readingSettings.font)
  } as CSSProperties;
  const codeBlocks = useMemo(() => {
    if (!activeFile) return [];
    if (!activeFile.isMarkdown) return [codeFileToBlock(activeFileContent, activeFile.language || 'text')];
    return parseCodeBlocks(activeFileContent);
  }, [activeFile, activeFileContent]);
  const codeLanguages = useMemo(() => Array.from(new Set(codeBlocks.map((block) => block.language || 'text'))).sort(), [codeBlocks]);
  const filteredCodeBlocks = useMemo(() => (
    codeBlocks.filter((block) => {
      const languageMatches = codeLanguageFilter === 'all' || block.language === codeLanguageFilter;
      const query = codeQuery.trim().toLowerCase();
      const queryMatches = !query
        || block.code.toLowerCase().includes(query)
        || (block.language || 'text').toLowerCase().includes(query)
        || block.symbols.some((symbol) => symbol.text.toLowerCase().includes(query));
      return languageMatches && queryMatches;
    })
  ), [codeBlocks, codeLanguageFilter, codeQuery]);
  const markdownComponents = useMemo(() => ({
    code: PreviewCodeBlock,
    h1: ({node, children, ...props}) => <PreviewHeading level={1} headings={headings} sourceLine={node?.position?.start.line} {...props}>{children}</PreviewHeading>,
    h2: ({node, children, ...props}) => <PreviewHeading level={2} headings={headings} sourceLine={node?.position?.start.line} {...props}>{children}</PreviewHeading>,
    h3: ({node, children, ...props}) => <PreviewHeading level={3} headings={headings} sourceLine={node?.position?.start.line} {...props}>{children}</PreviewHeading>,
    h4: ({node, children, ...props}) => <PreviewHeading level={4} headings={headings} sourceLine={node?.position?.start.line} {...props}>{children}</PreviewHeading>,
    h5: ({node, children, ...props}) => <PreviewHeading level={5} headings={headings} sourceLine={node?.position?.start.line} {...props}>{children}</PreviewHeading>,
    h6: ({node, children, ...props}) => <PreviewHeading level={6} headings={headings} sourceLine={node?.position?.start.line} {...props}>{children}</PreviewHeading>,
    p: ({children, ...props}) => {
      if (childrenToPlainText(children).trim() === TOC_PLACEHOLDER) {
        return <PreviewToc headings={headings} locale={locale} />;
      }
      return <p {...props}>{children}</p>;
    },
    img: ({src, alt, ...props}) => (
      <PreviewImage
        src={typeof src === 'string' ? src : ''}
        alt={typeof alt === 'string' ? alt : ''}
        documentPath={activeFile?.path || ''}
        locale={locale}
      />
    ),
    table: ({children, ...props}) => <PreviewTable locale={locale} {...props}>{children}</PreviewTable>,
    th: ({...props}) => <th className="border-b border-border-subtle p-3 font-semibold bg-bg-panel" {...props} />,
    td: ({...props}) => <td className="border-b border-border-subtle p-3" {...props} />,
  }), [activeFile?.path, headings, locale]);
  const markdownContentNode = useMemo(() => (
    <Markdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={markdownComponents}
    >
      {renderedContent}
    </Markdown>
  ), [markdownComponents, renderedContent]);

  useEffect(() => {
    if (viewMode === 'edit' || viewMode === 'wysiwyg') setPreviewSelection('');
  }, [viewMode]);

  useEffect(() => {
    if (!splitScrollSync || viewMode !== 'split') return;
    const container = previewContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      if (syncingFromEditorRef.current) {
        syncingFromEditorRef.current = false;
        return;
      }
      const max = container.scrollHeight - container.clientHeight;
      const ratio = max > 0 ? container.scrollTop / max : 0;
      window.dispatchEvent(new CustomEvent('inkstack:split-scroll-sync', {
        detail: { source: 'preview', ratio }
      }));
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [splitScrollSync, viewMode, activeFile?.path]);

  useEffect(() => {
    if (!splitScrollSync || viewMode !== 'split') return;
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<{ source: 'preview' | 'editor'; ratio: number }>).detail;
      if (!detail || detail.source !== 'editor') return;
      const container = previewContainerRef.current;
      if (!container) return;
      const max = container.scrollHeight - container.clientHeight;
      syncingFromEditorRef.current = true;
      container.scrollTop = Math.max(0, Math.min(max, detail.ratio * max));
    };
    window.addEventListener('inkstack:split-scroll-sync', onSync as EventListener);
    return () => window.removeEventListener('inkstack:split-scroll-sync', onSync as EventListener);
  }, [splitScrollSync, viewMode, activeFile?.path]);

  const refreshPreviewSelection = () => {
    const activeElement = document.activeElement as HTMLElement | null;
    if (activeElement?.closest('[data-selection-toolbar="true"]')) {
      return;
    }
    const container = previewContainerRef.current;
    const selection = window.getSelection();
    if (!container || !selection || selection.isCollapsed) {
      setPreviewSelection('');
      return;
    }
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    if (!anchorNode || !focusNode || !container.contains(anchorNode) || !container.contains(focusNode)) {
      setPreviewSelection('');
      return;
    }
    setPreviewSelection(selection.toString().trim());
  };

  const addPreviewSelectionToAiChat = () => {
    const text = previewSelection.trim();
    if (!text) return;
    emitAiSelection({ text, source: 'preview' });
    emitAiPanelTab('ai');
    if (!useStore.getState().aiPanelOpen) toggleAiPanel();
  };

  if (viewMode === 'code') {
    return (
      <CodeReviewPane
        blocks={filteredCodeBlocks}
        languages={codeLanguages}
        activeLanguage={codeLanguageFilter}
        copiedCodeBlockId={copiedCodeBlockId}
        copiedAll={copiedAllCodeBlocks}
        locale={locale}
        activeFileName={activeFile?.name}
        onLanguageChange={setCodeLanguageFilter}
        query={codeQuery}
        collapsedBlockIds={collapsedCodeBlocks}
        onQueryChange={setCodeQuery}
        onToggleCollapse={(blockId) => setCollapsedCodeBlocks((current) => (
          current.includes(blockId)
            ? current.filter((id) => id !== blockId)
            : [...current, blockId]
        ))}
        onJump={(line) => setPendingEditorLine(line)}
        onCopy={(block) => {
          void navigator.clipboard.writeText(block.code);
          setCopiedCodeBlockId(block.id);
          window.setTimeout(() => setCopiedCodeBlockId(null), 1800);
        }}
        onCopyAll={() => {
          if (filteredCodeBlocks.length === 0) return;
          const markdown = filteredCodeBlocks
            .map((block) => `\`\`\`${block.language || 'text'}\n${block.code.replace(/\n$/, '')}\n\`\`\``)
            .join('\n\n');
          void navigator.clipboard.writeText(markdown);
          setCopiedAllCodeBlocks(true);
          window.setTimeout(() => setCopiedAllCodeBlocks(false), 1800);
        }}
        onAskAi={(block) => {
          if (!useStore.getState().aiPanelOpen) toggleAiPanel();
          emitAiPanelTab('code');
          setPendingEditorLine(block.startLine);
        }}
      />
    );
  }

  if (!activeFile && viewMode === 'read') {
    return (
       <div className="flex-1 h-full flex items-center justify-center text-text-tertiary bg-bg-base">
         <p className="text-[13px]">{locale === 'zh' ? '无活动文档' : 'No active document'}</p>
       </div>
    );
  }

  if (activeFile && !activeFile.isMarkdown) {
    return (
      <div className={cn(
        "h-full items-center justify-center bg-bg-base text-text-tertiary",
        (viewMode === 'edit' || viewMode === 'wysiwyg') ? 'hidden' : 'flex-1 flex',
        viewMode === 'read' ? 'max-w-4xl mx-auto border-x border-border-subtle shadow-sm' : 'border-l border-border-subtle'
      )}>
        <div className="flex flex-col items-center gap-3 text-center">
          <FileCode2 size={26} className="text-accent opacity-70" />
          <div className="text-[13px] text-text-secondary">
            {locale === 'zh' ? '代码/文本文件使用只读代码视图' : 'Code and text files use the read-only code view'}
          </div>
          <div className="text-[11px] font-mono">
            {activeFile.language || activeFile.fileKind}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={previewContainerRef} style={previewStyle} onMouseUp={refreshPreviewSelection} className={cn(
      "relative h-full overflow-y-auto px-8 py-10 lg:px-12",
      (viewMode === 'edit' || viewMode === 'wysiwyg') ? 'hidden' : 'flex-1',
      viewMode === 'read' ? 'mx-auto border-x border-border-subtle bg-bg-base shadow-sm' : 'border-l border-border-subtle bg-bg-base'
    )}>
      {previewSelection && (
        <InlineSelectionToolbar
          locale={locale}
          canEditSelection={false}
          onCopy={() => void navigator.clipboard.writeText(previewSelection)}
          onTransform={() => undefined}
          onInsight={() => addPreviewSelectionToAiChat()}
          onAddToChat={addPreviewSelectionToAiChat}
        />
      )}
      <div className="inkstack-reading-surface prose dark:prose-invert prose-p:text-text-primary prose-headings:text-text-primary max-w-none prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0 prose-img:rounded-md prose-img:border prose-img:border-border-subtle prose-a:text-accent prose-headings:scroll-mt-20">
        {markdownContentNode}
      </div>
    </div>
  );
}

function readingFontFamily(font: 'theme' | 'sans' | 'serif' | 'mono' | `custom:${string}`) {
  if (font.startsWith('custom:')) {
    const family = font.slice(7).trim();
    if (family) return `"${family.replace(/"/g, '\\"')}", var(--font-reading)`;
  }
  if (font === 'serif') return 'var(--font-serif)';
  if (font === 'mono') return 'var(--font-mono)';
  if (font === 'sans') return 'var(--font-sans)';
  return 'var(--font-reading)';
}

function CodeReviewPane({
  blocks,
  languages,
  activeLanguage,
  copiedCodeBlockId,
  copiedAll,
  locale,
  activeFileName,
  onLanguageChange,
  query,
  collapsedBlockIds,
  onQueryChange,
  onToggleCollapse,
  onJump,
  onCopy,
  onCopyAll,
  onAskAi
}: {
  blocks: CodeBlockInfo[];
  languages: string[];
  activeLanguage: string;
  copiedCodeBlockId: string | null;
  copiedAll: boolean;
  locale: 'zh' | 'en';
  activeFileName?: string;
  onLanguageChange: (language: string) => void;
  query: string;
  collapsedBlockIds: string[];
  onQueryChange: (query: string) => void;
  onToggleCollapse: (blockId: string) => void;
  onJump: (line: number) => void;
  onCopy: (block: CodeBlockInfo) => void;
  onCopyAll: () => void;
  onAskAi: (block: CodeBlockInfo) => void;
}) {
  const pushSelectionToAi = () => {
    const selection = window.getSelection()?.toString().trim() ?? '';
    if (!selection) return false;
    emitAiSelection({ text: selection, source: 'preview' });
    emitAiPanelTab('ai');
    if (!useStore.getState().aiPanelOpen) useStore.getState().toggleAiPanel();
    return true;
  };

  return (
    <div className="flex-1 overflow-hidden bg-bg-base">
      <div className="flex h-full flex-col">
        <div className="border-b border-border-subtle bg-bg-panel px-5 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
                <FileCode2 size={15} className="text-accent" />
                <span className="truncate">{locale === 'zh' ? '代码查看' : 'Code View'}</span>
              </div>
              <div className="mt-0.5 truncate text-[11px] text-text-tertiary">
                {activeFileName || (locale === 'zh' ? '无活动文件' : 'No active file')}
              </div>
            </div>

            <select
              value={activeLanguage}
              onChange={(event) => onLanguageChange(event.target.value)}
              className="h-8 rounded-md border border-border-subtle bg-bg-base px-2 text-[12px] text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="all">{locale === 'zh' ? '全部语言' : 'All languages'}</option>
              {languages.map((language) => (
                <option key={language} value={language}>{language}</option>
              ))}
            </select>

            <label className="flex h-8 min-w-[14rem] items-center gap-2 rounded-md border border-border-subtle bg-bg-base px-2 text-[12px] text-text-secondary">
              <Search size={13} className="shrink-0 text-text-tertiary" />
              <input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder={locale === 'zh' ? '搜索代码/符号...' : 'Search code/symbols...'}
                className="min-w-0 flex-1 bg-transparent text-text-primary outline-none placeholder:text-text-tertiary"
              />
            </label>

            <span className="rounded border border-border-subtle bg-bg-base px-2 py-1.5 text-[11px] text-text-tertiary">
              {blocks.length} {locale === 'zh' ? '段' : 'blocks'}
            </span>

            <button
              onClick={onCopyAll}
              disabled={blocks.length === 0}
              className="rounded-md border border-border-subtle bg-bg-base px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-45"
            >
              {copiedAll ? (locale === 'zh' ? '已复制全部' : 'Copied all') : (locale === 'zh' ? '复制全部' : 'Copy all')}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {blocks.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[13px] text-text-tertiary">
              {locale === 'zh' ? '当前文档没有可查看的代码块' : 'No code blocks to inspect in the current document'}
            </div>
          ) : (
            <div className="mx-auto grid max-w-6xl gap-4">
              {blocks.map((block, index) => (
                <CodeReviewBlock
                  key={block.id}
                  block={block}
                  index={index}
                  locale={locale}
                  query={query}
                  collapsed={collapsedBlockIds.includes(block.id)}
                  copied={copiedCodeBlockId === block.id}
                  onToggleCollapse={() => onToggleCollapse(block.id)}
                  onJump={onJump}
                  onCopy={onCopy}
                  onAskAi={onAskAi}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CodeReviewBlock({
  block,
  index,
  locale,
  query,
  collapsed,
  copied,
  onToggleCollapse,
  onJump,
  onCopy,
  onAskAi
}: {
  block: CodeBlockInfo;
  index: number;
  locale: 'zh' | 'en';
  query: string;
  collapsed: boolean;
  copied: boolean;
  onToggleCollapse: () => void;
  onJump: (line: number) => void;
  onCopy: (block: CodeBlockInfo) => void;
  onAskAi: (block: CodeBlockInfo) => void;
}) {
  const highlightedCode = useMemo(() => highlightCodeQuery(block.code, query), [block.code, query]);
  const pushSelectionToAi = () => {
    const selection = window.getSelection()?.toString().trim() ?? '';
    if (!selection) return false;
    emitAiSelection({ text: selection, source: 'preview' });
    emitAiPanelTab('ai');
    if (!useStore.getState().aiPanelOpen) useStore.getState().toggleAiPanel();
    return true;
  };

  return (
    <div className="overflow-hidden rounded-md border border-border-subtle bg-bg-base shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-bg-panel px-4 py-3">
        <button
          onClick={onToggleCollapse}
          className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          title={collapsed ? (locale === 'zh' ? '展开代码块' : 'Expand block') : (locale === 'zh' ? '折叠代码块' : 'Collapse block')}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>
        <button
          onClick={() => onJump(block.startLine)}
          className="min-w-0 flex-1 text-left"
          title={locale === 'zh' ? '跳转到编辑器对应行' : 'Jump to source line'}
        >
          <span className="block truncate text-[13px] font-semibold text-text-primary">
            {index + 1}. {block.language || 'text'}
          </span>
          <span className="block text-[11px] text-text-tertiary">
            {locale === 'zh' ? '行' : 'Lines'} {block.startLine}-{block.endLine}
            {block.symbols.length > 0 ? ` · ${block.symbols.length} ${locale === 'zh' ? '个结构符号' : 'symbols'}` : ''}
          </span>
        </button>
        <button
          onClick={() => onCopy(block)}
          className="flex items-center gap-1 rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-[12px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
        >
          {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
          {copied ? (locale === 'zh' ? '已复制' : 'Copied') : (locale === 'zh' ? '复制' : 'Copy')}
        </button>
        <button
          onClick={() => {
            if (!pushSelectionToAi()) onAskAi(block);
          }}
          className="flex items-center gap-1 rounded-md bg-accent px-2 py-1.5 text-[12px] font-medium text-white hover:bg-accent/90"
        >
          <Bot size={13} />
          {locale === 'zh' ? '发到聊天' : 'To Chat'}
        </button>
      </div>

      {!collapsed && block.symbols.length > 0 && (
        <div className="border-b border-border-subtle bg-bg-panel/50 px-4 py-2">
          <div className="flex flex-wrap gap-1.5">
            {block.symbols.slice(0, 20).map((symbol) => (
              <button
                key={`${symbol.line}-${symbol.text}`}
                onClick={() => onJump(symbol.line)}
                className="rounded border border-border-subtle bg-bg-base px-2 py-1 font-mono text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              >
                {symbol.text}
                <span className="ml-1 text-text-tertiary">{symbol.line}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <pre className={cn(
        "inkstack-code-surface overflow-auto border-0 px-4 py-3 text-[12px] leading-relaxed",
        collapsed ? "max-h-0 p-0" : "max-h-[32rem]"
      )}>
        <code>{highlightedCode}</code>
      </pre>
    </div>
  );
}

function highlightCodeQuery(code: string, query: string) {
  const needle = query.trim();
  if (!needle) return code || ' ';
  const lowerCode = code.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let matchIndex = lowerCode.indexOf(lowerNeedle);
  while (matchIndex !== -1) {
    parts.push(code.slice(cursor, matchIndex));
    parts.push(
      <mark key={`${matchIndex}-${needle}`} className="rounded bg-yellow-300/40 px-0.5 text-text-primary">
        {code.slice(matchIndex, matchIndex + needle.length)}
      </mark>
    );
    cursor = matchIndex + needle.length;
    matchIndex = lowerCode.indexOf(lowerNeedle, cursor);
  }
  parts.push(code.slice(cursor));
  return parts.length > 0 ? parts : (code || ' ');
}
