import { useMemo } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import { cn } from '../lib/utils';
import type { EditorAiPromptKey } from '../lib/aiPrompts';
import type { InsightAction, TransformAction } from './editorPaneTypes';

type DiffLine = {
  type: 'same' | 'added' | 'removed';
  text: string;
};

export function getActionRunningText(action: EditorAiPromptKey, locale: 'zh' | 'en') {
  const zh: Record<EditorAiPromptKey, string> = {
    rewrite: 'AI 正在改写选区...',
    polish: 'AI 正在润色选区...',
    expand: 'AI 正在扩写选区...',
    translate: 'AI 正在翻译选区...',
    ask: 'AI 正在阅读选区...',
    summarize: 'AI 正在总结选区...'
  };
  const en: Record<EditorAiPromptKey, string> = {
    rewrite: 'AI is rewriting...',
    polish: 'AI is polishing...',
    expand: 'AI is expanding...',
    translate: 'AI is translating...',
    ask: 'AI is reading...',
    summarize: 'AI is summarizing...'
  };

  return locale === 'zh' ? zh[action] : en[action];
}

export function formatInlineAnswerForMarkdown(action: InsightAction, answer: string, locale: 'zh' | 'en') {
  const title = action === 'summarize'
    ? (locale === 'zh' ? 'AI 总结' : 'AI Summary')
    : (locale === 'zh' ? 'AI 回答' : 'AI Answer');
  const body = answer
    .trim()
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

  return `\n\n> [!note] ${title}\n${body}\n`;
}

export function InlineDraftCard({
  draft,
  locale,
  onApply,
  onDiscard
}: {
  draft: {
    original: string;
    proposed: string;
    action: TransformAction;
  };
  locale: 'zh' | 'en';
  onApply: () => void;
  onDiscard: () => void;
}) {
  const diff = useMemo(() => buildSafeLineDiff(draft.original, draft.proposed), [draft.original, draft.proposed]);
  const previewLines = diff.length > 80 ? diff.slice(0, 80) : diff;
  const changedLines = diff.filter((line) => line.type !== 'same').length;

  return (
    <div className="absolute right-5 top-5 z-20 flex w-[min(34rem,calc(100%-2.5rem))] flex-col overflow-hidden rounded-md border border-border-subtle bg-bg-base shadow-xl">
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12px] font-medium text-text-primary">
            <Sparkles size={14} className="text-accent" />
            <span>{getDraftTitle(draft.action, locale)}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-text-tertiary">
            {locale === 'zh' ? 'AI 尚未写入正文，请审阅后应用。' : 'AI has not changed the document yet. Review before applying.'}
          </div>
        </div>
        <span className="shrink-0 rounded border border-border-subtle px-1.5 py-0.5 text-[10px] text-text-tertiary">
          {changedLines} {locale === 'zh' ? '处变更' : 'changes'}
        </span>
      </div>

      <div className="max-h-80 overflow-auto bg-bg-panel font-mono text-[11px] leading-relaxed">
        {previewLines.map((line, index) => (
          <div
            key={`${line.type}-${index}`}
            className={cn(
              'grid grid-cols-[1.25rem_1fr] gap-2 px-2 py-0.5',
              line.type === 'added' && 'bg-green-500/10 text-green-700 dark:text-green-300',
              line.type === 'removed' && 'bg-red-500/10 text-red-700 dark:text-red-300',
              line.type === 'same' && 'text-text-tertiary'
            )}
          >
            <span className="select-none text-center">
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
            </span>
            <span className="whitespace-pre-wrap break-words">{line.text || ' '}</span>
          </div>
        ))}
        {diff.length > previewLines.length && (
          <div className="px-3 py-2 text-[11px] text-text-tertiary">
            {locale === 'zh' ? `还有 ${diff.length - previewLines.length} 行未显示` : `${diff.length - previewLines.length} more lines hidden`}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border-subtle bg-bg-base px-3 py-2">
        <button onClick={onApply} className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-[12px] font-medium text-white hover:bg-accent/90">
          <Check size={13} />
          {locale === 'zh' ? '应用到选区' : 'Apply to Selection'}
        </button>
        <button onClick={onDiscard} className="flex items-center gap-1 rounded border border-border-subtle bg-bg-panel px-2 py-1 text-[12px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary">
          <X size={13} />
          {locale === 'zh' ? '丢弃' : 'Discard'}
        </button>
      </div>
    </div>
  );
}

function getDraftTitle(action: TransformAction, locale: 'zh' | 'en') {
  const zh: Record<TransformAction, string> = {
    rewrite: 'AI 改写候选',
    polish: 'AI 润色候选',
    expand: 'AI 扩写候选',
    translate: 'AI 翻译候选'
  };
  const en: Record<TransformAction, string> = {
    rewrite: 'AI Rewrite Draft',
    polish: 'AI Polish Draft',
    expand: 'AI Expansion Draft',
    translate: 'AI Translation Draft'
  };

  return locale === 'zh' ? zh[action] : en[action];
}

function buildLineDiff(original: string, proposed: string): DiffLine[] {
  const originalLines = original.split('\n');
  const proposedLines = proposed.split('\n');
  const table = buildLcsTable(originalLines, proposedLines);
  const diff: DiffLine[] = [];

  let left = originalLines.length;
  let right = proposedLines.length;
  while (left > 0 || right > 0) {
    if (left > 0 && right > 0 && originalLines[left - 1] === proposedLines[right - 1]) {
      diff.push({ type: 'same', text: originalLines[left - 1] });
      left -= 1;
      right -= 1;
    } else if (right > 0 && (left === 0 || table[left][right - 1] >= table[left - 1][right])) {
      diff.push({ type: 'added', text: proposedLines[right - 1] });
      right -= 1;
    } else if (left > 0) {
      diff.push({ type: 'removed', text: originalLines[left - 1] });
      left -= 1;
    }
  }

  return diff.reverse();
}

function buildSafeLineDiff(original: string, proposed: string): DiffLine[] {
  const originalLines = original.split('\n');
  const proposedLines = proposed.split('\n');
  if (originalLines.length * proposedLines.length > 120_000) {
    return [
      { type: 'removed', text: `Original selection: ${originalLines.length} lines` },
      { type: 'added', text: `AI draft: ${proposedLines.length} lines` },
      { type: 'same', text: 'Diff is summarized because the selection is large.' }
    ];
  }

  return buildLineDiff(original, proposed);
}

function buildLcsTable(left: string[], right: string[]) {
  const table = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      table[row][column] = left[row - 1] === right[column - 1]
        ? table[row - 1][column - 1] + 1
        : Math.max(table[row - 1][column], table[row][column - 1]);
    }
  }

  return table;
}
