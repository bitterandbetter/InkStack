import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type {
  MarkdownDocumentIndex,
  MarkdownSourceRange,
  MarkdownVisualNode,
  MarkdownVisualNodeType
} from './types';

const syntaxNodeTypes: Partial<Record<string, MarkdownVisualNodeType>> = {
  StrongEmphasis: 'strong',
  Emphasis: 'emphasis',
  InlineCode: 'inlineCode',
  Link: 'link',
  Image: 'image',
  Blockquote: 'blockquote',
  BulletList: 'list',
  OrderedList: 'list',
  FencedCode: 'codeBlock',
  HorizontalRule: 'thematicBreak',
  HTMLBlock: 'html',
  Paragraph: 'paragraph',
  LinkReference: 'footnote'
};

export function buildMarkdownDocumentIndex(state: EditorState): MarkdownDocumentIndex {
  const source = state.doc.toString();
  const nodes: MarkdownVisualNode[] = [];
  const seen = new Set<string>();

  const addNode = (
    type: MarkdownVisualNodeType,
    from: number,
    to: number,
    content?: { from: number; to: number },
    metadata?: Record<string, unknown>,
    fallbackReason?: string
  ) => {
    if (from < 0 || to <= from || to > state.doc.length) return;
    const key = `${type}:${from}:${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    nodes.push({
      id: key,
      type,
      range: sourceRange(state, from, to),
      contentRange: content && content.to > content.from
        ? sourceRange(state, content.from, content.to)
        : undefined,
      metadata,
      fallbackReason
    });
  };

  syntaxTree(state).iterate({
    enter(node) {
      const heading = node.name.match(/^ATXHeading([1-6])$/);
      if (heading) {
        const raw = state.sliceDoc(node.from, node.to);
        const match = raw.match(/^\s{0,3}(#{1,6})[ \t]+([\s\S]*?)(?:[ \t]+#+[ \t]*)?$/);
        const contentFrom = match ? node.from + raw.indexOf(match[2]) : node.from;
        const contentTo = match ? contentFrom + match[2].length : node.to;
        addNode('heading', node.from, node.to, { from: contentFrom, to: contentTo }, {
          level: Number(heading[1])
        });
        return;
      }

      const type = syntaxNodeTypes[node.name];
      if (!type) return;
      const raw = state.sliceDoc(node.from, node.to);
      const inlineContent = inlineContentRange(type, raw, node.from);
      addNode(type, node.from, node.to, inlineContent, metadataForSyntaxNode(type, raw));
    }
  });

  addFrontmatter(state, source, addNode);
  addLineBasedNodes(state, source, addNode);
  addTableNodes(state, source, addNode);
  addMathNodes(state, source, nodes, addNode);
  addStrikethroughNodes(state, source, nodes, addNode);
  addDefinitionListNodes(state, source, addNode);

  nodes.sort((left, right) => left.range.from - right.range.from || right.range.to - left.range.to || left.type.localeCompare(right.type));
  const byType = new Map<MarkdownVisualNodeType, MarkdownVisualNode[]>();
  for (const node of nodes) {
    const list = byType.get(node.type) ?? [];
    list.push(node);
    byType.set(node.type, list);
  }
  return { nodes, byType };
}

function sourceRange(state: EditorState, from: number, to: number): MarkdownSourceRange {
  return {
    from,
    to,
    lineFrom: state.doc.lineAt(from).number,
    lineTo: state.doc.lineAt(Math.max(from, to - 1)).number
  };
}

function inlineContentRange(type: MarkdownVisualNodeType, raw: string, offset: number) {
  if (type === 'strong') return delimitedRange(raw, offset, /^(\*\*|__)([\s\S]+)\1$/);
  if (type === 'emphasis') return delimitedRange(raw, offset, /^(\*|_)([\s\S]+)\1$/);
  if (type === 'inlineCode') {
    const match = raw.match(/^(`+)([\s\S]*?)\1$/);
    if (match) return { from: offset + match[1].length, to: offset + raw.length - match[1].length };
  }
  if (type === 'link') {
    const match = raw.match(/^\[([^\]]+)]\(([\s\S]*)\)$/);
    if (match) return { from: offset + 1, to: offset + 1 + match[1].length };
  }
  if (type === 'image') {
    const match = raw.match(/^!\[([^\]]*)]\(([\s\S]*)\)$/);
    if (match) return { from: offset + 2, to: offset + 2 + match[1].length };
  }
  if (type === 'codeBlock') {
    const openEnd = raw.indexOf('\n');
    const closeStart = raw.lastIndexOf('\n');
    if (openEnd >= 0 && closeStart > openEnd) return { from: offset + openEnd + 1, to: offset + closeStart };
  }
  return undefined;
}

function delimitedRange(raw: string, offset: number, pattern: RegExp) {
  const match = raw.match(pattern);
  if (!match) return undefined;
  return { from: offset + match[1].length, to: offset + raw.length - match[1].length };
}

function metadataForSyntaxNode(type: MarkdownVisualNodeType, raw: string) {
  if (type === 'link') {
    const match = raw.match(/^\[([^\]]+)]\((\S+?)(?:\s+["']([^"']*)["'])?\)$/);
    return match ? { label: match[1], target: match[2], title: match[3] ?? '' } : undefined;
  }
  if (type === 'image') {
    const match = raw.match(/^!\[([^\]]*)]\((\S+?)(?:\s+["']([^"']*)["'])?\)$/);
    return match ? { alt: match[1], src: match[2], title: match[3] ?? '' } : undefined;
  }
  if (type === 'codeBlock') {
    const match = raw.match(/^\s{0,3}(`{3,}|~{3,})\s*([^\s\n]*)/);
    return { language: match?.[2] || 'text', fence: match?.[1] || '```' };
  }
  if (type === 'list') return { ordered: /^\s*\d+[.)]/.test(raw) };
  return undefined;
}

function addFrontmatter(
  state: EditorState,
  source: string,
  addNode: NodeAdder
) {
  if (!source.startsWith('---\n') && !source.startsWith('---\r\n')) return;
  const lines = source.split(/\r?\n/);
  let offset = lines[0].length + newlineLengthAt(source, lines[0].length);
  for (let index = 1; index < Math.min(lines.length, 200); index += 1) {
    const line = lines[index];
    if (line.trim() === '---') {
      const to = offset + line.length;
      addNode('frontmatter', 0, to, undefined, { lineCount: index + 1 });
      return;
    }
    offset += line.length + newlineLengthAt(source, offset + line.length);
  }
}

function addLineBasedNodes(state: EditorState, source: string, addNode: NodeAdder) {
  for (let number = 1; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number);
    const text = line.text;
    const task = text.match(/^(\s*)([-+*]|\d+[.)])\s+\[([ xX])]\s+(.*)$/);
    if (task) {
      const prefixLength = task[0].length - task[4].length;
      const checkOffset = text.indexOf('[', task[1].length + task[2].length) + 1;
      addNode('task', line.from, line.to, { from: line.from + prefixLength, to: line.to }, {
        marker: task[2],
        checked: task[3].toLowerCase() === 'x',
        markerFrom: line.from + task[1].length,
        markerTo: line.from + prefixLength,
        checkFrom: line.from + checkOffset
      });
      continue;
    }

    const list = text.match(/^(\s*)([-+*]|\d+[.)])\s+(.*)$/);
    if (list) {
      const prefixLength = list[0].length - list[3].length;
      addNode('listItem', line.from, line.to, { from: line.from + prefixLength, to: line.to }, {
        marker: list[2],
        ordered: /^\d/.test(list[2]),
        markerFrom: line.from + list[1].length,
        markerTo: line.from + prefixLength
      });
    }

    const toc = text.trim().match(/^(\[toc]|\[\[toc]])$/i);
    if (toc) addNode('toc', line.from, line.to, undefined, { token: toc[1] });

    if (/^\s*\[\^[^\]]+]:/.test(text)) {
      addNode('footnote', line.from, line.to, undefined, { definition: true });
    }

    if (/\{\{[^}\n]+}}/.test(text)) {
      addNode('fallback', line.from, line.to, undefined, { syntax: 'private-extension' }, 'Unsupported visual extension');
    }
  }
}

function addTableNodes(state: EditorState, _source: string, addNode: NodeAdder) {
  let lineNumber = 1;
  while (lineNumber < state.doc.lines) {
    const header = state.doc.line(lineNumber);
    const divider = state.doc.line(lineNumber + 1);
    if (!header.text.includes('|') || !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(divider.text)) {
      lineNumber += 1;
      continue;
    }
    let end = lineNumber + 1;
    while (end < state.doc.lines) {
      const next = state.doc.line(end + 1);
      if (!next.text.trim() || !next.text.includes('|')) break;
      end += 1;
    }
    const endLine = state.doc.line(end);
    addNode('table', header.from, endLine.to, undefined, { rows: end - lineNumber, columns: countTableColumns(header.text) });
    lineNumber = end + 1;
  }
}

function addMathNodes(
  state: EditorState,
  source: string,
  existing: MarkdownVisualNode[],
  addNode: NodeAdder
) {
  let blockStart: number | null = null;
  for (let number = 1; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number);
    if (!/^\s*\$\$\s*$/.test(line.text)) continue;
    if (blockStart === null) {
      blockStart = line.from;
    } else {
      const openLine = state.doc.lineAt(blockStart);
      addNode('mathBlock', blockStart, line.to, { from: openLine.to + 1, to: line.from }, { display: true });
      blockStart = null;
    }
  }
  if (blockStart !== null) {
    addNode('fallback', blockStart, state.doc.length, undefined, undefined, 'Unclosed math block');
  }

  for (let number = 1; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number);
    if (/^\s*\$\$\s*$/.test(line.text) || insideType(existing, line.from, 'codeBlock')) continue;
    for (const match of line.text.matchAll(/(^|[^\\$])\$([^$\n]+?)\$/g)) {
      const prefix = match[1].length;
      const from = line.from + (match.index ?? 0) + prefix;
      const to = from + match[0].length - prefix;
      addNode('mathInline', from, to, { from: from + 1, to: to - 1 }, { display: false });
    }
  }
}

function addStrikethroughNodes(
  state: EditorState,
  _source: string,
  existing: MarkdownVisualNode[],
  addNode: NodeAdder
) {
  for (let number = 1; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number);
    if (insideType(existing, line.from, 'codeBlock')) continue;
    for (const match of line.text.matchAll(/~~([^~\n]+)~~/g)) {
      const from = line.from + (match.index ?? 0);
      const to = from + match[0].length;
      addNode('strikethrough', from, to, { from: from + 2, to: to - 2 });
    }
  }
}

function addDefinitionListNodes(state: EditorState, _source: string, addNode: NodeAdder) {
  let number = 1;
  while (number < state.doc.lines) {
    const term = state.doc.line(number);
    const detail = state.doc.line(number + 1);
    if (!term.text.trim() || !/^\s*:\s+\S/.test(detail.text)) {
      number += 1;
      continue;
    }
    let end = number + 1;
    while (end < state.doc.lines && /^\s*:\s+\S/.test(state.doc.line(end + 1).text)) end += 1;
    addNode('definitionList', term.from, state.doc.line(end).to);
    number = end + 1;
  }
}

function insideType(nodes: MarkdownVisualNode[], position: number, type: MarkdownVisualNodeType) {
  return nodes.some((node) => node.type === type && position >= node.range.from && position < node.range.to);
}

function countTableColumns(line: string) {
  return Math.max(1, line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).length);
}

function newlineLengthAt(source: string, offset: number) {
  if (source.slice(offset, offset + 2) === '\r\n') return 2;
  return source[offset] === '\n' || source[offset] === '\r' ? 1 : 0;
}

type NodeAdder = (
  type: MarkdownVisualNodeType,
  from: number,
  to: number,
  content?: { from: number; to: number },
  metadata?: Record<string, unknown>,
  fallbackReason?: string
) => void;
