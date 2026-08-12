import { EditorView } from '@codemirror/view';
import { pickAndImportMarkdownAsset } from '../lib/fs';
import { getErrorMessage } from '../lib/utils';
import type { ImageInsertMode } from '../store';
import type { MarkdownAction } from './editorPaneTypes';

const inlineMarkdownActions: Partial<Record<MarkdownAction, { open: string; close: string; sample: string }>> = {
  bold: { open: '**', close: '**', sample: 'bold text' },
  italic: { open: '*', close: '*', sample: 'italic text' },
  strike: { open: '~~', close: '~~', sample: 'strikethrough text' },
  inlineCode: { open: '`', close: '`', sample: 'code' },
};

export function applyMarkdownEdit(view: EditorView, action: MarkdownAction) {
  const { state } = view;
  const selection = state.selection.main;

  if (action in inlineMarkdownActions) {
    applyInlineMarkdownEdit(view, action, selection.from, selection.to);
    return;
  }

  if (action === 'heading1' || action === 'heading2' || action === 'heading3') {
    const level = Number(action.replace('heading', ''));
    applyLinePrefixEdit(view, selection.from, selection.to, '#'.repeat(level), { replaceHeading: true });
    return;
  }

  if (action === 'quote') {
    applyLinePrefixEdit(view, selection.from, selection.to, '>');
    return;
  }

  if (action === 'bulletList') {
    applyLinePrefixEdit(view, selection.from, selection.to, '-');
    return;
  }

  if (action === 'orderedList') {
    applyOrderedListEdit(view, selection.from, selection.to);
    return;
  }

  if (action === 'taskList') {
    applyLinePrefixEdit(view, selection.from, selection.to, '- [ ]');
    return;
  }

  if (action === 'codeBlock') {
    applyBlockTemplateEdit(view, selection.from, selection.to, '```text\n', '\n```', 'code');
    return;
  }

  if (action === 'link') {
    applyLinkEdit(view, selection.from, selection.to);
    return;
  }

  if (action === 'table') {
    applyBlockTemplateEdit(
      view,
      selection.from,
      selection.to,
      '',
      '',
      '| Column A | Column B |\n| --- | --- |\n| Value | Value |\n'
    );
    return;
  }

  if (action === 'formatTable') {
    applyTableEdit(view, 'format');
    return;
  }

  if (action === 'insertTableRow') {
    applyTableEdit(view, 'insertRow');
    return;
  }

  if (action === 'insertTableColumn') {
    applyTableEdit(view, 'insertColumn');
    return;
  }

  if (action === 'pasteCsvTable') {
    void pasteDelimitedTable(view);
    return;
  }

  if (action === 'divider') {
    applyBlockTemplateEdit(view, selection.from, selection.to, '\n---\n', '', '');
  }
}

export async function pickAndInsertAsset(
  view: EditorView,
  kind: 'image' | 'attachment',
  documentPath: string,
  imageInsertMode: ImageInsertMode,
  locale: 'zh' | 'en',
  setStatus: (message: string) => void
) {
  try {
    const selection = view.state.selection.main;
    const selectedText = view.state.sliceDoc(selection.from, selection.to).trim();
    const asset = await pickAndImportMarkdownAsset(documentPath, kind, kind === 'image' ? imageInsertMode : 'assets');
    if (!asset) return;

    const label = selectedText || fileNameWithoutExtension(asset.fileName) || asset.fileName;
    const src = kind === 'image' ? asset.markdownSrc : asset.relativeSrc;
    const markdown = kind === 'image'
      ? `![${label}](${src})`
      : `[${label}](${asset.relativeSrc})`;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: markdown },
      selection: { anchor: selection.from, head: selection.from + markdown.length },
      scrollIntoView: true
    });
    setStatus(kind === 'image'
      ? (locale === 'zh'
        ? `已插入图片（${imageInsertMode === 'embed' ? '内嵌' : 'assets'}）`
        : `Image inserted (${imageInsertMode === 'embed' ? 'embedded' : 'assets'})`)
      : (locale === 'zh' ? `已导入附件：${asset.relativeSrc}` : `Attachment imported: ${asset.relativeSrc}`));
    window.setTimeout(() => setStatus(''), 2200);
    view.focus();
  } catch (error: unknown) {
    setStatus(getErrorMessage(error));
    window.setTimeout(() => setStatus(''), 3500);
  }
}

export function fileNameWithoutExtension(path: string) {
  const name = path.split(/[\\/]/).pop() ?? '';
  return name.replace(/\.[^.]+$/, '').trim();
}

function applyInlineMarkdownEdit(view: EditorView, action: MarkdownAction, from: number, to: number) {
  const config = inlineMarkdownActions[action];
  if (!config) return;

  const selectedText = from === to ? config.sample : view.state.sliceDoc(from, to);
  const insertText = `${config.open}${selectedText}${config.close}`;
  const anchor = from + config.open.length;
  const head = anchor + selectedText.length;

  view.dispatch({
    changes: { from, to, insert: insertText },
    selection: { anchor, head },
    scrollIntoView: true,
  });
}

function applyLinePrefixEdit(
  view: EditorView,
  from: number,
  to: number,
  prefix: string,
  options: { replaceHeading?: boolean } = {}
) {
  const { doc } = view.state;
  const startLine = doc.lineAt(from);
  const endLine = doc.lineAt(Math.max(from, to - 1));
  const changes = [];

  for (let number = startLine.number; number <= endLine.number; number += 1) {
    const line = doc.line(number);
    const original = line.text;
    const withoutExistingHeading = options.replaceHeading
      ? original.replace(/^\s{0,3}#{1,6}\s+/, '')
      : original;
    const content = withoutExistingHeading.trim().length ? withoutExistingHeading : placeholderForPrefix(prefix);
    changes.push({
      from: line.from,
      to: line.to,
      insert: `${prefix} ${content}`
    });
  }

  view.dispatch({
    changes,
    selection: { anchor: changes[0].from + `${prefix} `.length, head: changes[changes.length - 1].from + changes[changes.length - 1].insert.length },
    scrollIntoView: true
  });
}

function applyOrderedListEdit(view: EditorView, from: number, to: number) {
  const { doc } = view.state;
  const startLine = doc.lineAt(from);
  const endLine = doc.lineAt(Math.max(from, to - 1));
  const changes = [];

  for (let number = startLine.number; number <= endLine.number; number += 1) {
    const line = doc.line(number);
    const index = number - startLine.number + 1;
    const content = line.text.trim().length ? line.text : 'List item';
    changes.push({
      from: line.from,
      to: line.to,
      insert: `${index}. ${content.replace(/^\s*\d+\.\s+/, '')}`
    });
  }

  view.dispatch({
    changes,
    selection: { anchor: changes[0].from + 3, head: changes[changes.length - 1].from + changes[changes.length - 1].insert.length },
    scrollIntoView: true
  });
}

function applyBlockTemplateEdit(
  view: EditorView,
  from: number,
  to: number,
  before: string,
  after: string,
  fallback: string
) {
  const selectedText = from === to ? fallback : view.state.sliceDoc(from, to);
  const insertText = `${before}${selectedText}${after}`;
  const anchor = from + before.length;
  const head = anchor + selectedText.length;

  view.dispatch({
    changes: { from, to, insert: insertText },
    selection: { anchor, head },
    scrollIntoView: true
  });
}

function applyLinkEdit(view: EditorView, from: number, to: number) {
  const selectedText = from === to ? 'link text' : view.state.sliceDoc(from, to);
  const insertText = `[${selectedText}](https://)`;
  const urlStart = from + selectedText.length + 3;

  view.dispatch({
    changes: { from, to, insert: insertText },
    selection: { anchor: urlStart, head: urlStart + 'https://'.length },
    scrollIntoView: true
  });
}

function applyTableEdit(view: EditorView, action: 'format' | 'insertRow' | 'insertColumn') {
  const table = findCurrentMarkdownTable(view);
  if (!table) return;

  const rows = table.lines.map(parseTableRow);
  const width = Math.max(1, ...rows.map((row) => row.length));
  const normalized = rows.map((row) => normalizeTableRow(row, width));
  const activeRowIndex = Math.max(0, Math.min(table.activeLineNumber - table.startLineNumber, normalized.length - 1));
  const activeColumnIndex = findActiveTableColumn(view, table.lines[activeRowIndex], normalized[activeRowIndex].length);

  if (action === 'insertRow') {
    const blank = Array.from({ length: width }, () => '');
    normalized.splice(activeRowIndex + 1, 0, blank);
  }

  if (action === 'insertColumn') {
    normalized.forEach((row, rowIndex) => {
      row.splice(activeColumnIndex + 1, 0, rowIndex === 0 ? 'Column' : '');
    });
  }

  const markdown = formatMarkdownTable(normalized);
  view.dispatch({
    changes: { from: table.from, to: table.to, insert: markdown },
    selection: { anchor: table.from, head: table.from + markdown.length },
    scrollIntoView: true
  });
  view.focus();
}

async function pasteDelimitedTable(view: EditorView) {
  const text = await navigator.clipboard.readText();
  const rows = parseDelimitedRows(text);
  if (rows.length === 0) return;

  const markdown = formatMarkdownTable(rows);
  const selection = view.state.selection.main;
  const prefix = selection.from > 0 && view.state.sliceDoc(selection.from - 1, selection.from) !== '\n' ? '\n\n' : '';
  const suffix = selection.to < view.state.doc.length && view.state.sliceDoc(selection.to, selection.to + 1) !== '\n' ? '\n\n' : '';
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: `${prefix}${markdown}${suffix}` },
    selection: { anchor: selection.from + prefix.length, head: selection.from + prefix.length + markdown.length },
    scrollIntoView: true
  });
  view.focus();
}

function placeholderForPrefix(prefix: string) {
  if (prefix.startsWith('#')) return 'Heading';
  if (prefix === '>') return 'Quote';
  if (prefix === '- [ ]') return 'Task item';
  return 'List item';
}

function findCurrentMarkdownTable(view: EditorView) {
  const { doc, selection } = view.state;
  const activeLine = doc.lineAt(selection.main.head);
  if (!isTableRow(activeLine.text)) return null;

  let start = activeLine.number;
  while (start > 1 && isTableRow(doc.line(start - 1).text)) {
    start -= 1;
  }

  let end = activeLine.number;
  while (end < doc.lines && isTableRow(doc.line(end + 1).text)) {
    end += 1;
  }

  if (end - start < 1) return null;
  const startLine = doc.line(start);
  const endLine = doc.line(end);
  return {
    from: startLine.from,
    to: endLine.to,
    startLineNumber: start,
    activeLineNumber: activeLine.number,
    lines: Array.from({ length: end - start + 1 }, (_, index) => doc.line(start + index).text)
  };
}

function isTableRow(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.includes('|');
}

function parseTableRow(line: string) {
  const trimmed = line.trim();
  const withoutEdges = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return splitMarkdownTableRow(withoutEdges).map((cell) => {
    const normalized = cell.trim();
    return /^:?-{3,}:?$/.test(normalized) ? '---' : normalized;
  });
}

function splitMarkdownTableRow(row: string) {
  const cells: string[] = [];
  let current = '';
  let escaped = false;
  for (const char of row) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      current += char;
      escaped = true;
      continue;
    }
    if (char === '|') {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function normalizeTableRow(row: string[], width: number) {
  return Array.from({ length: width }, (_, index) => row[index] ?? '');
}

function findActiveTableColumn(view: EditorView, lineText: string, width: number) {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const offset = view.state.selection.main.head - line.from;
  let column = 0;
  let escaped = false;
  for (let index = 0; index < Math.min(offset, lineText.length); index += 1) {
    const char = lineText[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '|') {
      column += 1;
    }
  }
  return Math.min(Math.max(0, column - 1), Math.max(0, width - 1));
}

function formatMarkdownTable(rows: string[][]) {
  const width = Math.max(1, ...rows.map((row) => row.length));
  const normalized = rows.map((row) => normalizeTableRow(row, width));
  if (normalized.length === 0) return '';

  const header = normalized[0].map((cell, index) => {
    const value = cell && cell !== '---' ? cell : `Column ${index + 1}`;
    return value;
  });
  const body = normalized.slice(1).filter((row, index) => index !== 0 || !isDividerRow(row));
  const allRows = [header, ...body];
  const widths = Array.from({ length: width }, (_, column) => {
    const maxCell = Math.max(...allRows.map((row) => displayCell(row[column]).length), 3);
    return maxCell;
  });
  const divider = widths.map((size) => '-'.repeat(Math.max(3, size)));

  return [header, divider, ...body]
    .map((row) => `| ${row.map((cell, index) => displayCell(cell).padEnd(widths[index], ' ')).join(' | ')} |`)
    .join('\n');
}

function isDividerRow(row: string[]) {
  return row.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function displayCell(value: string) {
  return value.trim().replace(/\n/g, '<br>').replace(/\|/g, '\\|');
}

function parseDelimitedRows(text: string) {
  const lines = text.trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const delimiter = text.includes('\t') ? '\t' : ',';
  return lines.map((line) => splitDelimitedLine(line, delimiter).map((cell) => cell.trim()));
}

function splitDelimitedLine(line: string, delimiter: string) {
  if (delimiter === '\t') return line.split('\t');

  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}
