import { ChevronDown, ChevronUp, Replace, Search, X } from 'lucide-react';

type FindReplacePanelProps = {
  locale: 'zh' | 'en';
  query: string;
  replaceText: string;
  matchCase: boolean;
  matchCount: number;
  activeIndex: number;
  canReplace: boolean;
  onQueryChange: (value: string) => void;
  onReplaceTextChange: (value: string) => void;
  onMatchCaseChange: (value: boolean) => void;
  onPrevious: () => void;
  onNext: () => void;
  onReplaceCurrent: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
};

export function FindReplacePanel({
  locale,
  query,
  replaceText,
  matchCase,
  matchCount,
  activeIndex,
  canReplace,
  onQueryChange,
  onReplaceTextChange,
  onMatchCaseChange,
  onPrevious,
  onNext,
  onReplaceCurrent,
  onReplaceAll,
  onClose
}: FindReplacePanelProps) {
  const matchLabel = !query
    ? (locale === 'zh' ? '输入关键词' : 'Type to find')
    : matchCount > 0
      ? `${activeIndex + 1}/${matchCount}`
      : (locale === 'zh' ? '无匹配' : 'No matches');

  return (
    <div className="absolute right-5 top-5 z-30 w-[min(30rem,calc(100%-2.5rem))] rounded-md border border-border-subtle bg-bg-base shadow-xl">
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <Search size={14} className="shrink-0 text-accent" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          autoFocus
          placeholder={locale === 'zh' ? '查找当前文档' : 'Find in current document'}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-tertiary"
        />
        <span className="shrink-0 rounded border border-border-subtle px-1.5 py-0.5 text-[10px] text-text-tertiary">
          {matchLabel}
        </span>
        <button onClick={onPrevious} disabled={!matchCount} className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary disabled:opacity-40">
          <ChevronUp size={14} />
        </button>
        <button onClick={onNext} disabled={!matchCount} className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary disabled:opacity-40">
          <ChevronDown size={14} />
        </button>
        <button onClick={onClose} className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary">
          <X size={14} />
        </button>
      </div>

      <div className="space-y-2 px-3 py-3">
        <label className="flex items-center gap-2 text-[12px] text-text-secondary">
          <input
            type="checkbox"
            checked={matchCase}
            onChange={(event) => onMatchCaseChange(event.target.checked)}
            className="size-3 accent-[var(--color-accent)]"
          />
          {locale === 'zh' ? '区分大小写' : 'Match case'}
        </label>

        <div className="flex items-center gap-2">
          <Replace size={14} className="shrink-0 text-text-tertiary" />
          <input
            value={replaceText}
            onChange={(event) => onReplaceTextChange(event.target.value)}
            disabled={!canReplace}
            placeholder={canReplace ? (locale === 'zh' ? '替换为' : 'Replace with') : (locale === 'zh' ? '只读文件不可替换' : 'Read-only file')}
            className="min-w-0 flex-1 rounded-md border border-border-subtle bg-bg-panel px-2 py-1.5 text-[12px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent disabled:opacity-50"
          />
          <button
            onClick={onReplaceCurrent}
            disabled={!canReplace || !matchCount}
            className="rounded-md border border-border-subtle bg-bg-panel px-2 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
          >
            {locale === 'zh' ? '替换' : 'Replace'}
          </button>
          <button
            onClick={onReplaceAll}
            disabled={!canReplace || !matchCount}
            className="rounded-md bg-accent px-2 py-1.5 text-[12px] font-medium text-white hover:bg-accent/90 disabled:opacity-40"
          >
            {locale === 'zh' ? '全部' : 'All'}
          </button>
        </div>
      </div>
    </div>
  );
}
