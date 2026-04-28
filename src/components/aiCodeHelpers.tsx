import type { ReactNode } from 'react';
import type { CodeBlockInfo } from '../lib/outline';

export interface ExtractedCodeBlock {
  language: string;
  code: string;
}

export function codeAiPrompt(action: 'explain' | 'refactor' | 'comment', language: string, locale: 'zh' | 'en') {
  if (locale === 'zh') {
    if (action === 'refactor') {
      return `审查这个 ${language} 代码块，给出重构建议、潜在风险和更清晰的写法。不要直接改正文；如需给示例，请提供可复制的代码片段。`;
    }
    if (action === 'comment') {
      return `为这个 ${language} 代码块生成适度注释版本。保留原有行为，不要过度注释；先简述注释策略，再给出完整代码。`;
    }
    return `解释这个 ${language} 代码块的作用、主要结构、输入输出和潜在注意点。`;
  }

  if (action === 'refactor') {
    return `Review this ${language} code block and suggest refactors, risks, and clearer alternatives. Do not modify the document directly; include copyable snippets only when useful.`;
  }
  if (action === 'comment') {
    return `Generate a moderately commented version of this ${language} code block. Preserve behavior and avoid noisy comments; briefly explain the commenting strategy, then provide the full code.`;
  }
  return `Explain what this ${language} code block does, its structure, inputs/outputs, and any caveats.`;
}

export function codeAiConfirmTitle(action: 'explain' | 'refactor' | 'comment', locale: 'zh' | 'en') {
  if (locale === 'zh') {
    if (action === 'refactor') return '确认 AI 代码重构上下文';
    if (action === 'comment') return '确认 AI 代码注释上下文';
    return '确认 AI 代码解释上下文';
  }

  if (action === 'refactor') return 'Confirm AI code refactor context';
  if (action === 'comment') return 'Confirm AI code comment context';
  return 'Confirm AI code explanation context';
}

export function extractMarkdownCodeBlocks(content: string): ExtractedCodeBlock[] {
  const blocks: ExtractedCodeBlock[] = [];
  const pattern = /```([\w-]*)[^\n]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const code = match[2]?.replace(/\n$/, '') ?? '';
    if (!code.trim()) continue;
    blocks.push({
      language: (match[1] || 'text').toLowerCase(),
      code
    });
  }
  return blocks;
}

export function getCodeBlockContentRange(content: string, block: CodeBlockInfo) {
  const lines = content.split(/\r?\n/);
  let offset = 0;
  let start: number | null = null;
  let end: number | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];
    const lineLength = line.length;

    if (lineNumber === block.codeStartLine) {
      start = offset;
    }
    if (lineNumber === block.endLine) {
      end = Math.max(start ?? offset, offset - 1);
      break;
    }
    offset += lineLength + 1;
  }

  if (start === null || end === null || end < start) return null;
  return { from: start, to: end };
}

export function highlightCodeQuery(code: string, query: string) {
  const needle = query.trim();
  if (!needle) return code || ' ';
  const lowerCode = code.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const parts: ReactNode[] = [];
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

export function findPreviousComparableBlock(blocks: CodeBlockInfo[], block: CodeBlockInfo, index: number) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = blocks[cursor];
    if ((candidate.language || 'text') === (block.language || 'text')) return candidate;
  }
  return null;
}

export function lineNumberAtOffset(content: string, offset: number) {
  const safeOffset = Math.min(Math.max(offset, 0), content.length);
  let line = 1;
  for (let index = 0; index < safeOffset; index += 1) {
    if (content.charCodeAt(index) === 10) line += 1;
  }
  return line;
}
