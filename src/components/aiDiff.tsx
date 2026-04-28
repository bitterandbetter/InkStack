import { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import type { CodeBlockInfo } from '../lib/outline';
import { cn } from '../lib/utils';
import type { ExtractedCodeBlock } from './aiCodeHelpers';

export interface CodeApplyDraft {
  aiBlock: ExtractedCodeBlock;
  targetBlock: CodeBlockInfo;
  original: string;
  proposed: string;
  range: { from: number; to: number };
}

export interface RewriteDraft {
  instruction: string;
  original: string;
  proposed: string;
  scope: 'document' | 'selection';
  range: { from: number; to: number } | null;
  startLine: number;
  documentSnapshot: string;
  acceptedChunkIds: string[];
}

export type DiffLine = {
  type: 'same' | 'added' | 'removed';
  text: string;
};

type RewriteDiffLine = DiffLine & {
  chunkId?: string;
  inlineParts?: InlineDiffPart[];
};

type InlineDiffPart = {
  type: 'same' | 'changed';
  text: string;
};

type RewriteDiffChunk = {
  id: string;
  lines: RewriteDiffLine[];
  removedCount: number;
  addedCount: number;
  originalStartLine: number;
  originalEndLine: number;
};

export function CodeApplyDiffCard({
  draft,
  locale,
  onApply,
  onDiscard
}: {
  draft: CodeApplyDraft;
  locale: 'zh' | 'en';
  onApply: () => void;
  onDiscard: () => void;
}) {
  const diff = useMemo(() => buildLineDiff(draft.original, draft.proposed), [draft.original, draft.proposed]);
  const added = diff.filter((line) => line.type === 'added').length;
  const removed = diff.filter((line) => line.type === 'removed').length;

  return (
    <div className="overflow-hidden rounded-lg border border-accent/30 bg-bg-base text-[12px] shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle bg-accent/5 px-3 py-2">
        <div className="min-w-0">
          <div className="font-medium text-text-primary">
            {locale === 'zh' ? 'AI 代码替换审查' : 'Review AI Code Replacement'}
          </div>
          <div className="truncate text-[10px] text-text-tertiary">
            {draft.targetBlock.language || 'text'} · {locale === 'zh' ? '行' : 'Lines'} {draft.targetBlock.startLine}-{draft.targetBlock.endLine}
            {' · '}
            <span className="text-emerald-600">+{added}</span>
            {' / '}
            <span className="text-red-500">-{removed}</span>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={onApply}
            className="rounded bg-accent px-2 py-1 text-[11px] font-medium text-white hover:opacity-90"
          >
            {locale === 'zh' ? '应用' : 'Apply'}
          </button>
          <button
            onClick={onDiscard}
            className="rounded border border-border-subtle bg-bg-panel px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            {locale === 'zh' ? '撤销' : 'Discard'}
          </button>
        </div>
      </div>
      <div className="max-h-72 overflow-auto bg-code-bg">
        {diff.map((line, index) => (
          <div
            key={`${index}-${line.type}-${line.text}`}
            className={cn(
              'grid grid-cols-[28px_1fr] gap-2 border-b border-border-subtle/50 px-2 py-1 font-mono text-[11px] leading-relaxed last:border-b-0',
              line.type === 'added' && 'bg-emerald-500/8 text-text-primary',
              line.type === 'removed' && 'bg-red-500/8 text-text-secondary line-through decoration-red-400/70',
              line.type === 'same' && 'text-text-tertiary'
            )}
          >
            <span className="select-none text-right text-text-tertiary">
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
            </span>
            <span className="whitespace-pre-wrap break-words">{line.text || ' '}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RewriteDiffCard({
  draft,
  locale,
  onApply,
  onDiscard,
  onChunkDecision,
  onAcceptAll,
  onRejectAll,
  onRegenerateChunk
}: {
  draft: RewriteDraft;
  locale: 'zh' | 'en';
  onApply: () => void;
  onDiscard: () => void;
  onChunkDecision: (chunkId: string, accepted: boolean) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onRegenerateChunk: (chunkId: string) => void;
}) {
  const { lines, chunks, summarized } = useMemo(
    () => buildRewriteDiff(draft.original, draft.proposed),
    [draft.original, draft.proposed]
  );
  const acceptedChunkIds = useMemo(() => new Set(draft.acceptedChunkIds), [draft.acceptedChunkIds]);
  const acceptedCount = chunks.filter((chunk) => acceptedChunkIds.has(chunk.id)).length;
  const previewLines = lines.length > 120 ? lines.slice(0, 120) : lines;
  const changedLines = lines.filter((line) => line.type !== 'same').length;

  return (
    <div className="self-start w-full rounded-md border border-border-subtle bg-bg-base p-3 text-[12px] text-text-secondary shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-text-primary">{locale === 'zh' ? 'AI 改写候选' : 'AI Rewrite Draft'}</div>
          <div className="truncate text-[11px] text-text-tertiary">
            {draft.scope === 'selection'
              ? (locale === 'zh' ? '选区改写' : 'Selection rewrite')
              : (locale === 'zh' ? '全文改写' : 'Document rewrite')}
            {' · '}
            {draft.instruction}
          </div>
        </div>
        <span className="shrink-0 rounded border border-border-subtle px-1.5 py-0.5 text-[10px] text-text-tertiary">
          {chunks.length > 0
            ? `${acceptedCount}/${chunks.length} ${locale === 'zh' ? '块已接受' : 'chunks accepted'}`
            : `${changedLines} ${locale === 'zh' ? '处变更' : 'changes'}`}
        </span>
      </div>

      {chunks.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          <button
            onClick={onAcceptAll}
            className="rounded border border-border-subtle bg-bg-panel px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            {locale === 'zh' ? '全部接受' : 'Accept all'}
          </button>
          <button
            onClick={onRejectAll}
            className="rounded border border-border-subtle bg-bg-panel px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            {locale === 'zh' ? '全部拒绝' : 'Reject all'}
          </button>
          <span className="self-center text-[11px] text-text-tertiary">
            {locale === 'zh' ? '应用时只写入已接受的变更块。' : 'Only accepted chunks will be written when applied.'}
          </span>
        </div>
      )}

      <div className="max-h-72 overflow-auto rounded border border-border-subtle bg-bg-panel font-mono text-[11px] leading-relaxed">
        {previewLines.map((line, index) => (
          <RewriteDiffLineRow
            key={`${line.type}-${line.chunkId ?? 'same'}-${index}`}
            line={line}
            accepted={line.chunkId ? acceptedChunkIds.has(line.chunkId) : false}
            locale={locale}
            onChunkDecision={onChunkDecision}
            onRegenerateChunk={onRegenerateChunk}
          />
        ))}
        {lines.length > previewLines.length && (
          <div className="px-3 py-2 text-[11px] text-text-tertiary">
            {locale === 'zh' ? `还有 ${lines.length - previewLines.length} 行未显示` : `${lines.length - previewLines.length} more lines hidden`}
          </div>
        )}
        {summarized && (
          <div className="px-3 py-2 text-[11px] text-text-tertiary">
            {locale === 'zh'
              ? '文档较大，Diff 已摘要显示；本次只能整体接受或整体拒绝。'
              : 'The document is large, so the diff is summarized. This draft can only be accepted or rejected as a whole.'}
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={onApply}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-[12px] font-medium text-white hover:bg-accent/90"
        >
          <Check size={13} />
          {locale === 'zh' ? '应用改写' : 'Apply Rewrite'}
        </button>
        <button
          onClick={onDiscard}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-[12px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary"
        >
          <X size={13} />
          {locale === 'zh' ? '丢弃' : 'Discard'}
        </button>
      </div>
    </div>
  );
}

function RewriteDiffLineRow({
  line,
  accepted,
  locale,
  onChunkDecision,
  onRegenerateChunk
}: {
  line: RewriteDiffLine;
  accepted: boolean;
  locale: 'zh' | 'en';
  onChunkDecision: (chunkId: string, accepted: boolean) => void;
  onRegenerateChunk: (chunkId: string) => void;
}) {
  const isChanged = line.type !== 'same' && line.chunkId;
  return (
    <div
      className={cn(
        'grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2 px-2 py-0.5',
        isChanged && 'grid-cols-[1.25rem_minmax(0,1fr)_auto]',
        line.type === 'added' && (accepted ? 'bg-green-500/10 text-green-700 dark:text-green-300' : 'bg-bg-base/70 text-text-tertiary line-through decoration-green-700/50'),
        line.type === 'removed' && (accepted ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-bg-base/70 text-text-tertiary'),
        line.type === 'same' && 'text-text-tertiary'
      )}
    >
      <span className="select-none text-center">
        {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
      </span>
      <span className="whitespace-pre-wrap break-words">
        <InlineRewriteText line={line} />
      </span>
      {isChanged && line.type === 'added' && (
        <span className="ml-2 flex gap-1 self-start">
          <button
            onClick={() => onChunkDecision(line.chunkId!, !accepted)}
            className="rounded border border-border-subtle bg-bg-base px-1.5 py-0.5 font-sans text-[10px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            {accepted
              ? (locale === 'zh' ? '拒绝块' : 'Reject')
              : (locale === 'zh' ? '接受块' : 'Accept')}
          </button>
          <button
            onClick={() => onRegenerateChunk(line.chunkId!)}
            className="rounded border border-border-subtle bg-bg-base px-1.5 py-0.5 font-sans text-[10px] text-text-secondary hover:bg-bg-hover hover:text-accent"
          >
            {locale === 'zh' ? '重生成' : 'Regenerate'}
          </button>
        </span>
      )}
    </div>
  );
}

function InlineRewriteText({ line }: { line: RewriteDiffLine }) {
  if ((line.type !== 'added' && line.type !== 'removed') || !line.inlineParts?.length) {
    return <>{line.text || ' '}</>;
  }
  return (
    <>
      {line.inlineParts.map((part, index) => (
        <span
          key={`${part.type}-${index}-${part.text}`}
          className={cn(
            part.type === 'changed' && line.type === 'added' && 'rounded bg-green-500/20 px-0.5 text-green-800 dark:text-green-200',
            part.type === 'changed' && line.type === 'removed' && 'rounded bg-red-500/20 px-0.5 text-red-800 dark:text-red-200'
          )}
        >
          {part.text || ' '}
        </span>
      ))}
    </>
  );
}

export function buildLineDiff(original: string, proposed: string): DiffLine[] {
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

export function getDefaultAcceptedRewriteChunkIds(original: string, proposed: string) {
  return buildRewriteDiff(original, proposed).chunks.map((chunk) => chunk.id);
}

export function buildAcceptedRewriteText(original: string, proposed: string, acceptedChunkIds: string[]) {
  const { lines, chunks, summarized } = buildRewriteDiff(original, proposed);
  if (summarized) return acceptedChunkIds.length > 0 ? proposed : original;
  if (chunks.length === 0) return proposed;

  const accepted = new Set(acceptedChunkIds);
  const output: string[] = [];
  for (const line of lines) {
    if (line.type === 'same') {
      output.push(line.text);
      continue;
    }
    if (!line.chunkId || !accepted.has(line.chunkId)) {
      if (line.type === 'removed') output.push(line.text);
      continue;
    }
    if (line.type === 'added') output.push(line.text);
  }

  return output.join('\n');
}

export function getFirstAcceptedRewriteLine(original: string, proposed: string, acceptedChunkIds: string[]) {
  const { chunks } = buildRewriteDiff(original, proposed);
  const accepted = new Set(acceptedChunkIds);
  return chunks.find((chunk) => accepted.has(chunk.id))?.originalStartLine ?? 1;
}

export function replaceProposedChunk(original: string, proposed: string, chunkId: string, replacement: string) {
  const { lines, chunks, summarized } = buildRewriteDiff(original, proposed);
  if (summarized) return proposed;
  const target = chunks.find((chunk) => chunk.id === chunkId);
  if (!target) return proposed;

  const output: string[] = [];
  let inserted = false;
  for (const line of lines) {
    if (line.chunkId !== chunkId) {
      if (line.type !== 'removed') output.push(line.text);
      continue;
    }

    if (!inserted) {
      output.push(...replacement.replace(/\n$/, '').split('\n'));
      inserted = true;
    }
  }

  return output.join('\n');
}

export function buildRewriteDiff(original: string, proposed: string): {
  lines: RewriteDiffLine[];
  chunks: RewriteDiffChunk[];
  summarized: boolean;
} {
  const originalLines = original.split('\n');
  const proposedLines = proposed.split('\n');
  if (originalLines.length * proposedLines.length > 120_000) {
    const chunkId = 'chunk-1';
    return {
      lines: [
        { type: 'removed', text: `Original document: ${originalLines.length} lines`, chunkId },
        { type: 'added', text: `AI rewrite: ${proposedLines.length} lines`, chunkId },
        { type: 'same', text: 'Diff is summarized because the document is large.' }
      ],
      chunks: [{
        id: chunkId,
        removedCount: originalLines.length,
        addedCount: proposedLines.length,
        lines: [],
        originalStartLine: 1,
        originalEndLine: originalLines.length
      }],
      summarized: true
    };
  }

  return groupRewriteDiffLines(buildLineDiff(original, proposed));
}

function groupRewriteDiffLines(diff: DiffLine[]) {
  const lines: RewriteDiffLine[] = [];
  const chunks: RewriteDiffChunk[] = [];
  let currentChunk: RewriteDiffChunk | null = null;
  let originalLine = 1;

  const closeChunk = () => {
    if (!currentChunk) return;
    chunks.push(currentChunk);
    currentChunk = null;
  };

  for (const line of diff) {
    if (line.type === 'same') {
      closeChunk();
      lines.push(line);
      originalLine += 1;
      continue;
    }

    if (!currentChunk) {
      currentChunk = {
        id: `chunk-${chunks.length + 1}`,
        lines: [],
        removedCount: 0,
        addedCount: 0,
        originalStartLine: originalLine,
        originalEndLine: originalLine
      };
    }

    const nextLine = { ...line, chunkId: currentChunk.id };
    currentChunk.lines.push(nextLine);
    if (line.type === 'removed') {
      currentChunk.removedCount += 1;
      currentChunk.originalEndLine = originalLine;
      originalLine += 1;
    }
    if (line.type === 'added') currentChunk.addedCount += 1;
    lines.push(nextLine);
  }
  closeChunk();

  annotateInlineDiffParts(chunks);
  return { lines, chunks, summarized: false };
}

function annotateInlineDiffParts(chunks: RewriteDiffChunk[]) {
  for (const chunk of chunks) {
    const removed = chunk.lines.filter((line) => line.type === 'removed');
    const added = chunk.lines.filter((line) => line.type === 'added');
    if (removed.length !== added.length || removed.length > 8) continue;

    for (let index = 0; index < removed.length; index += 1) {
      const before = removed[index];
      const after = added[index];
      if (before.text.length > 260 || after.text.length > 260) continue;
      const [beforeParts, afterParts] = buildInlineDiffParts(before.text, after.text);
      before.inlineParts = beforeParts;
      after.inlineParts = afterParts;
    }
  }
}

function buildInlineDiffParts(before: string, after: string): [InlineDiffPart[], InlineDiffPart[]] {
  let prefix = 0;
  const maxPrefix = Math.min(before.length, after.length);
  while (prefix < maxPrefix && before[prefix] === after[prefix]) prefix += 1;

  let beforeSuffix = before.length - 1;
  let afterSuffix = after.length - 1;
  while (
    beforeSuffix >= prefix &&
    afterSuffix >= prefix &&
    before[beforeSuffix] === after[afterSuffix]
  ) {
    beforeSuffix -= 1;
    afterSuffix -= 1;
  }

  const beforeParts = compactInlineParts([
    { type: 'same' as const, text: before.slice(0, prefix) },
    { type: 'changed' as const, text: before.slice(prefix, beforeSuffix + 1) },
    { type: 'same' as const, text: before.slice(beforeSuffix + 1) }
  ]);
  const afterParts = compactInlineParts([
    { type: 'same' as const, text: after.slice(0, prefix) },
    { type: 'changed' as const, text: after.slice(prefix, afterSuffix + 1) },
    { type: 'same' as const, text: after.slice(afterSuffix + 1) }
  ]);
  return [beforeParts, afterParts];
}

function compactInlineParts(parts: InlineDiffPart[]) {
  return parts.filter((part) => part.text.length > 0);
}

export function buildSafeLineDiff(original: string, proposed: string): DiffLine[] {
  const originalLines = original.split('\n');
  const proposedLines = proposed.split('\n');
  if (originalLines.length * proposedLines.length > 120_000) {
    return [
      { type: 'removed', text: `Original document: ${originalLines.length} lines` },
      { type: 'added', text: `AI rewrite: ${proposedLines.length} lines` },
      { type: 'same', text: 'Diff is summarized because the document is large.' }
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
