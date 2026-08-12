export type MarkdownBlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'task'
  | 'blockquote'
  | 'code'
  | 'table'
  | 'image'
  | 'math'
  | 'html'
  | 'thematicBreak';

export type MarkdownLinkKind = 'markdown' | 'wiki' | 'image' | 'reference' | 'definition';

export interface MarkdownFrontmatter {
  raw: string;
  data: Record<string, string | string[] | boolean | number>;
  startLine: number;
  endLine: number;
}

export interface MarkdownLinkRef {
  kind: MarkdownLinkKind;
  raw: string;
  target: string;
  label: string;
  line: number;
  title?: string;
  heading?: string;
  alias?: string;
}

export interface MarkdownBlock {
  id: string;
  type: MarkdownBlockType;
  text: string;
  raw: string;
  startLine: number;
  endLine: number;
  depth: number;
  parentHeadingId: string | null;
  headingPath: string[];
  links: MarkdownLinkRef[];
  tags: string[];
  language?: string;
  checked?: boolean;
}

export interface MarkdownDocumentMeta {
  title: string | null;
  frontmatter: MarkdownFrontmatter | null;
  blocks: MarkdownBlock[];
  links: MarkdownLinkRef[];
  tags: string[];
}

type HeadingContext = {
  id: string;
  level: number;
  text: string;
};

type FenceState = {
  marker: '`' | '~';
  length: number;
  startLine: number;
  language: string;
  lines: string[];
};

export function parseMarkdownDocument(content: string): MarkdownDocumentMeta {
  const frontmatter = extractFrontmatter(content);
  const blocks = parseMarkdownBlocks(content, frontmatter);
  const links = uniqueLinks(blocks.flatMap((block) => block.links));
  const tags = uniqueStrings([
    ...extractFrontmatterTags(frontmatter),
    ...blocks.flatMap((block) => block.tags),
  ]);
  const title = frontmatterTitle(frontmatter) ?? blocks.find((block) => block.type === 'heading')?.text ?? null;

  return {
    title,
    frontmatter,
    blocks,
    links,
    tags,
  };
}

export function parseMarkdownBlocks(content: string, frontmatter = extractFrontmatter(content)): MarkdownBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  const headingStack: HeadingContext[] = [];
  let fence: FenceState | null = null;
  let index = frontmatter ? frontmatter.endLine : 0;

  while (index < lines.length) {
    const line = lines[index];
    const lineNumber = index + 1;

    if (fence) {
      const closeMatch = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
      if (closeMatch && closeMatch[1][0] === fence.marker && closeMatch[1].length >= fence.length) {
        const rawLines = [fenceMarkerLine(fence), ...fence.lines, line];
        blocks.push(createBlock({
          type: 'code',
          rawLines,
          startLine: fence.startLine,
          endLine: lineNumber,
          headingStack,
          language: fence.language,
        }));
        fence = null;
      } else {
        fence.lines.push(line);
      }
      index += 1;
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      fence = {
        marker: fenceMatch[1][0] as '`' | '~',
        length: fenceMatch[1].length,
        startLine: lineNumber,
        language: normalizeFenceLanguage(fenceMatch[2] ?? ''),
        lines: [],
      };
      index += 1;
      continue;
    }

    const heading = parseHeading(line);
    if (heading) {
      const block = createBlock({
        type: 'heading',
        rawLines: [line],
        startLine: lineNumber,
        endLine: lineNumber,
        headingStack,
        textOverride: heading.text,
      });
      blocks.push(block);
      while (headingStack.length && headingStack[headingStack.length - 1].level >= heading.level) {
        headingStack.pop();
      }
      headingStack.push({ id: block.id, level: heading.level, text: heading.text });
      index += 1;
      continue;
    }

    if (isThematicBreak(line)) {
      blocks.push(createBlock({
        type: 'thematicBreak',
        rawLines: [line],
        startLine: lineNumber,
        endLine: lineNumber,
        headingStack,
      }));
      index += 1;
      continue;
    }

    if (isHtmlBlockStart(line)) {
      const { rawLines, nextIndex } = collectUntilBlank(lines, index);
      blocks.push(createBlock({
        type: 'html',
        rawLines,
        startLine: lineNumber,
        endLine: nextIndex,
        headingStack,
      }));
      index = nextIndex;
      continue;
    }

    if (isMathBlockStart(line)) {
      const { rawLines, nextIndex } = collectMathBlock(lines, index);
      blocks.push(createBlock({
        type: 'math',
        rawLines,
        startLine: lineNumber,
        endLine: nextIndex,
        headingStack,
      }));
      index = nextIndex;
      continue;
    }

    if (isTableStart(lines, index)) {
      const { rawLines, nextIndex } = collectTable(lines, index);
      blocks.push(createBlock({
        type: 'table',
        rawLines,
        startLine: lineNumber,
        endLine: nextIndex,
        headingStack,
      }));
      index = nextIndex;
      continue;
    }

    const task = parseTaskItem(line);
    if (task) {
      const { rawLines, nextIndex } = collectList(lines, index);
      blocks.push(createBlock({
        type: 'task',
        rawLines,
        startLine: lineNumber,
        endLine: nextIndex,
        headingStack,
        checked: task.checked,
      }));
      index = nextIndex;
      continue;
    }

    if (isListItem(line)) {
      const { rawLines, nextIndex } = collectList(lines, index);
      blocks.push(createBlock({
        type: 'list',
        rawLines,
        startLine: lineNumber,
        endLine: nextIndex,
        headingStack,
      }));
      index = nextIndex;
      continue;
    }

    if (isBlockquote(line)) {
      const { rawLines, nextIndex } = collectBlockquote(lines, index);
      blocks.push(createBlock({
        type: 'blockquote',
        rawLines,
        startLine: lineNumber,
        endLine: nextIndex,
        headingStack,
      }));
      index = nextIndex;
      continue;
    }

    const { rawLines, nextIndex } = collectParagraph(lines, index);
    const raw = rawLines.join('\n');
    blocks.push(createBlock({
      type: isImageOnlyParagraph(raw) ? 'image' : 'paragraph',
      rawLines,
      startLine: lineNumber,
      endLine: nextIndex,
      headingStack,
    }));
    index = nextIndex;
  }

  if (fence) {
    const rawLines = [fenceMarkerLine(fence), ...fence.lines];
    blocks.push(createBlock({
      type: 'code',
      rawLines,
      startLine: fence.startLine,
      endLine: lines.length,
      headingStack,
      language: fence.language,
    }));
  }

  return blocks;
}

export function extractFrontmatter(content: string): MarkdownFrontmatter | null {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) return null;

  const lines = content.split(/\r?\n/);
  for (let index = 1; index < Math.min(lines.length, 200); index += 1) {
    if (lines[index].trim() === '---') {
      const rawLines = lines.slice(0, index + 1);
      return {
        raw: rawLines.join('\n'),
        data: parseSimpleYaml(lines.slice(1, index)),
        startLine: 1,
        endLine: index + 1,
      };
    }
  }

  return null;
}

export function extractMarkdownLinks(content: string): MarkdownLinkRef[] {
  return uniqueLinks(content
    .split(/\r?\n/)
    .flatMap((line, index) => extractLinksFromText(line, index + 1)));
}

export function extractTags(content: string): string[] {
  return uniqueStrings(content
    .split(/\r?\n/)
    .flatMap((line) => extractTagsFromText(line)));
}

function createBlock({
  type,
  rawLines,
  startLine,
  endLine,
  headingStack,
  textOverride,
  language,
  checked,
}: {
  type: MarkdownBlockType;
  rawLines: string[];
  startLine: number;
  endLine: number;
  headingStack: HeadingContext[];
  textOverride?: string;
  language?: string;
  checked?: boolean;
}): MarkdownBlock {
  const raw = rawLines.join('\n');
  const text = textOverride ?? normalizeBlockText(type, raw);
  const headingPath = headingStack.map((heading) => heading.text);
  const parentHeading = headingStack[headingStack.length - 1] ?? null;
  const links = rawLines.flatMap((line, offset) => extractLinksFromText(line, startLine + offset));
  const tags = extractTagsFromText(raw);

  return {
    id: buildBlockId(type, startLine, text || raw),
    type,
    text,
    raw,
    startLine,
    endLine,
    depth: type === 'heading' ? (parseHeading(rawLines[0])?.level ?? 1) : headingStack.length,
    parentHeadingId: parentHeading?.id ?? null,
    headingPath,
    links,
    tags,
    language,
    checked,
  };
}

function parseHeading(line: string) {
  const match = line.match(/^\s{0,3}(#{1,6})(?:[ \t]+|$)(.*)$/);
  if (!match) return null;
  return {
    level: match[1].length,
    text: match[2].replace(/[ \t]+#+[ \t]*$/, '').trim() || '(untitled)',
  };
}

function parseTaskItem(line: string) {
  const match = line.match(/^\s{0,3}(?:[-+*]|\d+[.)])\s+\[([ xX])\]\s+/);
  if (!match) return null;
  return { checked: match[1].toLowerCase() === 'x' };
}

function isListItem(line: string) {
  return /^\s{0,3}(?:[-+*]|\d+[.)])\s+\S/.test(line);
}

function isBlockquote(line: string) {
  return /^\s{0,3}>\s?/.test(line);
}

function isThematicBreak(line: string) {
  return /^\s{0,3}(([-*_])\s*){3,}$/.test(line.trim());
}

function isHtmlBlockStart(line: string) {
  return /^\s{0,3}<\/?[A-Za-z][^>]*>\s*$/.test(line.trim());
}

function isMathBlockStart(line: string) {
  return /^\s{0,3}\$\$\s*$/.test(line);
}

function isTableStart(lines: string[], index: number) {
  const line = lines[index] ?? '';
  const next = lines[index + 1] ?? '';
  return line.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(next);
}

function collectUntilBlank(lines: string[], startIndex: number) {
  const rawLines: string[] = [];
  let index = startIndex;
  while (index < lines.length && lines[index].trim()) {
    rawLines.push(lines[index]);
    index += 1;
  }
  return { rawLines, nextIndex: index };
}

function collectMathBlock(lines: string[], startIndex: number) {
  const rawLines = [lines[startIndex]];
  let index = startIndex + 1;
  while (index < lines.length) {
    rawLines.push(lines[index]);
    if (/^\s{0,3}\$\$\s*$/.test(lines[index])) {
      index += 1;
      break;
    }
    index += 1;
  }
  return { rawLines, nextIndex: index };
}

function collectTable(lines: string[], startIndex: number) {
  const rawLines: string[] = [];
  let index = startIndex;
  while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
    rawLines.push(lines[index]);
    index += 1;
  }
  return { rawLines, nextIndex: index };
}

function collectList(lines: string[], startIndex: number) {
  const rawLines: string[] = [];
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      if (lines[index + 1] && /^\s{2,}\S/.test(lines[index + 1])) {
        rawLines.push(line);
        index += 1;
        continue;
      }
      break;
    }
    if (index !== startIndex && !isListItem(line) && !/^\s{2,}\S/.test(line)) break;
    rawLines.push(line);
    index += 1;
  }
  return { rawLines, nextIndex: index };
}

function collectBlockquote(lines: string[], startIndex: number) {
  const rawLines: string[] = [];
  let index = startIndex;
  while (index < lines.length && (isBlockquote(lines[index]) || !lines[index].trim())) {
    if (!lines[index].trim() && !isBlockquote(lines[index + 1] ?? '')) break;
    rawLines.push(lines[index]);
    index += 1;
  }
  return { rawLines, nextIndex: index };
}

function collectParagraph(lines: string[], startIndex: number) {
  const rawLines: string[] = [];
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) break;
    if (index !== startIndex && startsNewBlock(lines, index)) break;
    rawLines.push(line);
    index += 1;
  }
  return { rawLines, nextIndex: index };
}

function startsNewBlock(lines: string[], index: number) {
  const line = lines[index];
  return Boolean(
    parseHeading(line)
      || line.match(/^\s{0,3}(`{3,}|~{3,})/)
      || isThematicBreak(line)
      || isMathBlockStart(line)
      || isTableStart(lines, index)
      || isListItem(line)
      || isBlockquote(line)
      || isHtmlBlockStart(line)
  );
}

function normalizeBlockText(type: MarkdownBlockType, raw: string) {
  if (type === 'code') {
    return raw
      .split('\n')
      .slice(1, raw.endsWith('```') || raw.endsWith('~~~') ? -1 : undefined)
      .join('\n')
      .trim();
  }
  if (type === 'heading') {
    return parseHeading(raw)?.text ?? raw.trim();
  }
  return raw
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}(?:[-+*]|\d+[.)])\s+\[[ xX]\]\s+/gm, '')
    .replace(/^\s{0,3}(?:[-+*]|\d+[.)])\s+/gm, '')
    .trim();
}

function extractLinksFromText(text: string, line: number): MarkdownLinkRef[] {
  const links: MarkdownLinkRef[] = [];
  const wikiPattern = /!?\[\[([^\]|#]+)?(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;
  const markdownPattern = /(!?)\[([^\]\n]+)\]\(([^)\s]+)(?:\s+["']([^"']+)["'])?\)/g;
  const referencePattern = /\[([^\]\n]+)\]\[([^\]\n]*)\]/g;
  const footnotePattern = /\[\^([^\]\n]+)\]/g;
  const definitionPattern = /^\s{0,3}\[([^\]\n]+)\]:\s+(\S+)/gm;

  for (const match of text.matchAll(wikiPattern)) {
    const raw = match[0];
    const target = (match[1] ?? '').trim();
    const heading = match[2]?.trim();
    const alias = match[3]?.trim();
    links.push({
      kind: 'wiki',
      raw,
      target,
      label: alias || heading || target,
      line,
      heading,
      alias,
    });
  }

  for (const match of text.matchAll(markdownPattern)) {
    const raw = match[0];
    const target = match[3].trim();
    const heading = target.includes('#') ? target.split('#').slice(1).join('#') : undefined;
    links.push({
      kind: match[1] ? 'image' : 'markdown',
      raw,
      target,
      label: match[2].trim(),
      line,
      title: match[4]?.trim(),
      heading,
    });
  }

  for (const match of text.matchAll(referencePattern)) {
    if (match[0].startsWith('!')) continue;
    links.push({
      kind: 'reference',
      raw: match[0],
      target: (match[2] || match[1]).trim(),
      label: match[1].trim(),
      line,
    });
  }

  for (const match of text.matchAll(footnotePattern)) {
    links.push({
      kind: 'reference',
      raw: match[0],
      target: match[1].trim(),
      label: match[1].trim(),
      line,
    });
  }

  for (const match of text.matchAll(definitionPattern)) {
    links.push({
      kind: 'definition',
      raw: match[0],
      target: match[2].trim(),
      label: match[1].trim(),
      line,
    });
  }

  return links;
}

function extractTagsFromText(text: string) {
  const tags = new Set<string>();
  const withoutCode = text.replace(/`[^`]*`/g, ' ');
  for (const match of withoutCode.matchAll(/(^|[\s([{:;,.!?])#([\p{L}\p{N}_/-]{1,64})/gu)) {
    const tag = match[2].replace(/\/+$/g, '');
    if (tag && !/^\d+$/.test(tag)) tags.add(tag);
  }
  return Array.from(tags);
}

function parseSimpleYaml(lines: string[]) {
  const data: Record<string, string | string[] | boolean | number> = {};
  let activeArrayKey: string | null = null;

  for (const line of lines) {
    const arrayItem = line.match(/^\s*-\s+(.+)$/);
    if (arrayItem && activeArrayKey) {
      const current = Array.isArray(data[activeArrayKey]) ? data[activeArrayKey] as string[] : [];
      data[activeArrayKey] = [...current, unquote(arrayItem[1].trim())];
      continue;
    }

    const keyValue = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyValue) {
      activeArrayKey = null;
      continue;
    }

    const key = keyValue[1];
    const value = keyValue[2].trim();
    if (!value) {
      data[key] = [];
      activeArrayKey = key;
      continue;
    }

    activeArrayKey = null;
    data[key] = parseYamlScalar(value);
  }

  return data;
}

function parseYamlScalar(value: string): string | string[] | boolean | number {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => unquote(item.trim()))
      .filter(Boolean);
  }
  return unquote(value);
}

function extractFrontmatterTags(frontmatter: MarkdownFrontmatter | null) {
  if (!frontmatter) return [];
  const value = frontmatter.data.tags ?? frontmatter.data.tag;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return value.split(/[,\s]+/).filter(Boolean);
  return [];
}

function frontmatterTitle(frontmatter: MarkdownFrontmatter | null) {
  const value = frontmatter?.data.title;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function unquote(value: string) {
  return value.replace(/^['"]|['"]$/g, '');
}

function normalizeFenceLanguage(info: string) {
  return info.trim().split(/\s+/)[0]?.replace(/[{}]/g, '').toLowerCase() || 'text';
}

function fenceMarkerLine(fence: FenceState) {
  return `${fence.marker.repeat(fence.length)}${fence.language && fence.language !== 'text' ? fence.language : ''}`;
}

function isImageOnlyParagraph(raw: string) {
  return /^!\[[^\]]*]\([^)]+\)\s*$/.test(raw.trim());
}

function buildBlockId(type: MarkdownBlockType, startLine: number, text: string) {
  return `${type}-${startLine}-${hashText(text).slice(0, 8)}`;
}

function hashText(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function uniqueLinks(links: MarkdownLinkRef[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${link.kind}:${link.target}:${link.heading ?? ''}:${link.line}:${link.raw}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
