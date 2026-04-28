import { Bot, Check, ChevronDown, ChevronRight, Copy, Search } from 'lucide-react';
import type { CodeBlockInfo, OutlineItem } from '../lib/outline';
import { cn } from '../lib/utils';
import {
  extractMarkdownCodeBlocks,
  findPreviousComparableBlock,
  highlightCodeQuery,
  type ExtractedCodeBlock
} from './aiCodeHelpers';

export function CodeBlocksPanel({
  blocks,
  languages,
  activeLanguage,
  query,
  collapsedBlockIds,
  copiedCodeBlockId,
  copiedAll,
  locale,
  onLanguageChange,
  onQueryChange,
  onToggleCollapse,
  onJump,
  onCopy,
  onCopyAll,
  onExplain,
  onRefactor,
  onComment,
  onCompare,
  renderOutlineIcon
}: {
  blocks: CodeBlockInfo[];
  languages: string[];
  activeLanguage: string;
  query: string;
  collapsedBlockIds: string[];
  copiedCodeBlockId: string | null;
  copiedAll: boolean;
  locale: 'zh' | 'en';
  onLanguageChange: (language: string) => void;
  onQueryChange: (query: string) => void;
  onToggleCollapse: (blockId: string) => void;
  onJump: (line: number) => void;
  onCopy: (block: CodeBlockInfo) => void;
  onCopyAll: () => void;
  onExplain: (block: CodeBlockInfo) => void;
  onRefactor: (block: CodeBlockInfo) => void;
  onComment: (block: CodeBlockInfo) => void;
  onCompare: (block: CodeBlockInfo, previousBlock: CodeBlockInfo | null) => void;
  renderOutlineIcon: (item: OutlineItem) => React.ReactNode;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-bg-panel/30 p-4">
      <div className="mb-3 flex items-center gap-2">
        <select
          value={activeLanguage}
          onChange={(event) => onLanguageChange(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-[12px] text-text-primary focus:outline-none focus:border-accent"
        >
          <option value="all">{locale === 'zh' ? '全部语言' : 'All languages'}</option>
          {languages.map((language) => (
            <option key={language} value={language}>{language}</option>
          ))}
        </select>
        <label className="flex min-w-0 flex-[1.2] items-center gap-1.5 rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-[11px] text-text-secondary">
          <Search size={12} className="shrink-0 text-text-tertiary" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={locale === 'zh' ? '搜索代码...' : 'Search code...'}
            className="min-w-0 flex-1 bg-transparent text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </label>
        <span className="shrink-0 rounded border border-border-subtle bg-bg-base px-2 py-1.5 text-[11px] text-text-tertiary">
          {blocks.length}
        </span>
        <button
          onClick={onCopyAll}
          disabled={blocks.length === 0}
          className="rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-[11px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-45"
          title={locale === 'zh' ? '复制当前筛选下的全部代码块' : 'Copy all visible code blocks'}
        >
          {copiedAll ? (locale === 'zh' ? '已复制' : 'Copied') : (locale === 'zh' ? '复制全部' : 'Copy all')}
        </button>
      </div>

      {blocks.length === 0 ? (
        <div className="mt-10 text-center text-[13px] text-text-tertiary">
          {locale === 'zh' ? '文档中没有代码块' : 'No code blocks in this document'}
        </div>
      ) : (
        <div className="space-y-3">
          {blocks.map((block, index) => {
            const previousBlock = findPreviousComparableBlock(blocks, block, index);
            const collapsed = collapsedBlockIds.includes(block.id);

            return (
              <div key={block.id} className="overflow-hidden rounded-md border border-border-subtle bg-bg-base">
                <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
                  <button
                    onClick={() => onToggleCollapse(block.id)}
                    className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
                    title={collapsed ? (locale === 'zh' ? '展开代码块' : 'Expand block') : (locale === 'zh' ? '折叠代码块' : 'Collapse block')}
                  >
                    {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  </button>
                  <button
                    onClick={() => onJump(block.startLine)}
                    className="min-w-0 flex-1 text-left"
                    title={locale === 'zh' ? '跳转到代码块' : 'Jump to code block'}
                  >
                    <span className="block truncate text-[12px] font-medium text-text-primary">
                      {index + 1}. {block.language || 'text'}
                    </span>
                    <span className="block text-[10px] text-text-tertiary">
                      {locale === 'zh' ? '行' : 'Lines'} {block.startLine}-{block.endLine}
                      {block.symbols.length > 0 ? ` · ${block.symbols.length} ${locale === 'zh' ? '个符号' : 'symbols'}` : ''}
                    </span>
                  </button>
                  <button
                    onClick={() => onCopy(block)}
                    className="rounded p-1.5 text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
                    title={locale === 'zh' ? '复制代码块' : 'Copy code block'}
                  >
                    {copiedCodeBlockId === block.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                  </button>
                  <button
                    onClick={() => onExplain(block)}
                    className="rounded p-1.5 text-accent hover:bg-bg-hover"
                    title={locale === 'zh' ? '让 AI 解释代码块' : 'Ask AI to explain'}
                  >
                    <Bot size={14} />
                  </button>
                </div>

                {!collapsed && (
                  <div className="flex flex-wrap gap-1 border-b border-border-subtle bg-bg-panel/30 px-3 py-2">
                    <button
                      onClick={() => onExplain(block)}
                      className="rounded border border-border-subtle bg-bg-base px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                    >
                      {locale === 'zh' ? '解释' : 'Explain'}
                    </button>
                    <button
                      onClick={() => onRefactor(block)}
                      className="rounded border border-border-subtle bg-bg-base px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                    >
                      {locale === 'zh' ? '重构建议' : 'Refactor'}
                    </button>
                    <button
                      onClick={() => onComment(block)}
                      className="rounded border border-border-subtle bg-bg-base px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                    >
                      {locale === 'zh' ? '生成注释' : 'Comment'}
                    </button>
                    <button
                      onClick={() => onCompare(block, previousBlock)}
                      disabled={!previousBlock}
                      className="rounded border border-border-subtle bg-bg-base px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {locale === 'zh' ? '对比上段' : 'Diff previous'}
                    </button>
                  </div>
                )}

                {!collapsed && block.symbols.length > 0 && (
                  <div className="border-b border-border-subtle bg-bg-panel/40 px-3 py-2">
                    <div className="space-y-1">
                      {block.symbols.slice(0, 8).map((symbol) => (
                        <button
                          key={`${symbol.line}-${symbol.text}`}
                          onClick={() => onJump(symbol.line)}
                          className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                        >
                          {renderOutlineIcon(symbol)}
                          <span className="min-w-0 flex-1 truncate font-mono">{symbol.text}</span>
                          <span className="text-[10px] text-text-tertiary">{symbol.line}</span>
                        </button>
                      ))}
                      {block.symbols.length > 8 && (
                        <div className="px-1.5 pt-1 text-[10px] text-text-tertiary">
                          {locale === 'zh' ? `还有 ${block.symbols.length - 8} 个符号` : `${block.symbols.length - 8} more symbols`}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <pre className={cn(
                  "inkstack-code-surface overflow-auto border-0 px-3 py-2 text-[11px] leading-relaxed",
                  collapsed ? "max-h-0 p-0" : "max-h-40"
                )}>
                  <code>{highlightCodeQuery(block.code, query)}</code>
                </pre>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AssistantCodeActions({
  content,
  locale,
  documentBlocks,
  canReplace,
  onInsert,
  onReplace
}: {
  content: string;
  locale: 'zh' | 'en';
  documentBlocks: CodeBlockInfo[];
  canReplace: boolean;
  onInsert: (block: ExtractedCodeBlock) => void;
  onReplace: (block: ExtractedCodeBlock, targetBlock: CodeBlockInfo) => void;
}) {
  const blocks = extractMarkdownCodeBlocks(content);
  if (blocks.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {blocks.slice(0, 4).map((block, index) => {
        const compatibleBlocks = documentBlocks.filter((candidate) => (
          !block.language
          || block.language === 'text'
          || candidate.language === block.language
        ));
        const fallbackTarget = compatibleBlocks[0] ?? documentBlocks[0] ?? null;

        return (
          <div key={`${block.language}-${index}-${block.code.length}`} className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => onInsert(block)}
              className="rounded border border-border-subtle bg-bg-base px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-accent"
            >
              {locale === 'zh'
                ? `插入代码块 ${index + 1}${block.language ? ` · ${block.language}` : ''}`
                : `Insert code ${index + 1}${block.language ? ` · ${block.language}` : ''}`}
            </button>
            {canReplace && fallbackTarget && (
              <button
                onClick={() => onReplace(block, fallbackTarget)}
                className="rounded border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] text-accent hover:bg-accent/15"
              >
                {locale === 'zh'
                  ? `替换 ${fallbackTarget.language || 'text'}:${fallbackTarget.startLine}`
                  : `Replace ${fallbackTarget.language || 'text'}:${fallbackTarget.startLine}`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
