import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { ReactNode } from 'react';
import type { PluggableList } from 'unified';

export const TOC_PLACEHOLDER = 'INKSTACK_TOC_PLACEHOLDER';

const markdownSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...(defaultSchema.attributes?.code || []),
      ['className', /^language-[\w-]+$/, 'math-inline', 'math-display'],
      'dataMeta',
    ],
    span: [
      ...(defaultSchema.attributes?.span || []),
      ['className', /^hljs-[\w-]+$/, 'hljs'],
    ],
  },
};

export const remarkPlugins: PluggableList = [remarkGfm, remarkMath];

export const rehypePlugins: PluggableList = [
  // Raw HTML is parsed first so Markdown can still render supported inline HTML.
  rehypeRaw,
  // Sanitization must immediately follow raw HTML parsing; later render-only plugins
  // receive a cleaned tree. Keep this schema close to the plugin order when changing it.
  [rehypeSanitize, markdownSanitizeSchema],
  rehypeKatex,
];

export interface HeadingEntry {
  level: number;
  text: string;
  slug: string;
}

export function injectTocPlaceholder(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim().match(/^(\[toc\]|\[\[toc\]\])$/i) ? TOC_PLACEHOLDER : line)
    .join('\n');
}

export function buildHeadingIndex(content: string): HeadingEntry[] {
  const headings: HeadingEntry[] = [];
  const slugCounts = new Map<string, number>();
  let inFence = false;
  let fenceMarker: '`' | '~' | null = null;
  let fenceLength = 0;

  for (const line of content.split(/\r?\n/)) {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0] as '`' | '~';
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
        fenceLength = fenceMatch[1].length;
        continue;
      }

      if (marker === fenceMarker && fenceMatch[1].length >= fenceLength) {
        inFence = false;
        fenceMarker = null;
        fenceLength = 0;
      }
      continue;
    }

    if (inFence) continue;

    const heading = line.match(/^\s{0,3}(#{1,6})(?:[ \t]+|$)(.*)$/);
    if (!heading) continue;

    const text = heading[2]
      .replace(/[ \t]+#+[ \t]*$/, '')
      .replace(/[`*_~[\]()]/g, '')
      .trim();
    if (!text) continue;

    const baseSlug = slugifyHeading(text);
    const count = slugCounts.get(baseSlug) ?? 0;
    slugCounts.set(baseSlug, count + 1);
    headings.push({
      level: heading[1].length,
      text,
      slug: count === 0 ? baseSlug : `${baseSlug}-${count + 1}`
    });
  }

  return headings;
}

export function slugifyHeading(text: string) {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || 'heading';
}

export function childrenToPlainText(children: ReactNode): string {
  if (children === null || children === undefined || typeof children === 'boolean') return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(childrenToPlainText).join('');
  if (typeof children === 'object' && 'props' in children) {
    const child = children as { props?: { children?: ReactNode } };
    return childrenToPlainText(child.props?.children);
  }
  return '';
}

export function stripFrontMatter(content: string) {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return content;
  }

  const lines = content.split(/\r?\n/);
  for (let index = 1; index < Math.min(lines.length, 200); index += 1) {
    if (lines[index].trim() === '---') {
      return lines.slice(index + 1).join('\n').replace(/^\n+/, '');
    }
  }

  return content;
}
