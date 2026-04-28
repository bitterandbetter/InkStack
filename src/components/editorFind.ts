import type { FindMatch } from './editorPaneTypes';

export function findDocumentMatches(content: string, query: string, matchCase: boolean): FindMatch[] {
  if (!query) return [];
  const haystack = matchCase ? content : content.toLowerCase();
  const needle = matchCase ? query : query.toLowerCase();
  if (!needle) return [];

  const matches: FindMatch[] = [];
  let from = 0;
  while (from <= haystack.length) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) break;
    matches.push({ from: index, to: index + query.length });
    from = index + Math.max(needle.length, 1);
  }
  return matches;
}

export function normalizeMatchIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

