import fs from 'node:fs';
import path from 'node:path';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { buildMarkdownDocumentIndex, createWysiwygExtension } from '../../../../src/features/wysiwyg';

const fixture = fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/wysiwyg/complete.md'), 'utf8');
const views: EditorView[] = [];

function createState(doc = fixture) {
  return EditorState.create({ doc, extensions: [markdown()] });
}

afterEach(() => {
  while (views.length) views.pop()?.destroy();
});

describe('WYSIWYG document index', () => {
  it('indexes standard and InkStack extended Markdown with source ranges', () => {
    const state = createState();
    const index = buildMarkdownDocumentIndex(state);

    for (const type of [
      'frontmatter',
      'heading',
      'strong',
      'emphasis',
      'strikethrough',
      'inlineCode',
      'link',
      'image',
      'blockquote',
      'listItem',
      'task',
      'codeBlock',
      'table',
      'mathInline',
      'mathBlock',
      'html',
      'thematicBreak',
      'toc',
      'definitionList',
      'footnote',
      'fallback'
    ] as const) {
      expect(index.byType.get(type)?.length, `missing ${type}`).toBeGreaterThan(0);
    }

    for (const node of index.nodes) {
      expect(node.range.from).toBeGreaterThanOrEqual(0);
      expect(node.range.to).toBeGreaterThan(node.range.from);
      expect(node.range.to).toBeLessThanOrEqual(state.doc.length);
      expect(state.sliceDoc(node.range.from, node.range.to).length).toBeGreaterThan(0);
    }
  });

  it('keeps incomplete extended syntax visible as a fallback range', () => {
    const state = createState('before\n\n$$\nunclosed');
    const index = buildMarkdownDocumentIndex(state);
    const fallback = index.byType.get('fallback')?.[0];

    expect(fallback?.fallbackReason).toBe('Unclosed math block');
    expect(state.sliceDoc(fallback!.range.from, fallback!.range.to)).toBe('$$\nunclosed');
  });

  it('does not mutate Markdown when the visual extension initializes or selections change', () => {
    const state = EditorState.create({
      doc: fixture,
      extensions: [markdown(), createWysiwygExtension()]
    });
    const view = new EditorView({ state });
    views.push(view);
    const original = view.state.doc.toString();

    view.dispatch({ selection: { anchor: original.indexOf('一级标题') } });
    view.dispatch({ selection: { anchor: original.indexOf('粗体'), head: original.indexOf('粗体') + 2 } });

    expect(view.state.doc.toString()).toBe(original);
    expect(view.state.doc.toString()).toBe(fixture);
  });

  it('hides Markdown delimiters outside the active source range', () => {
    const state = EditorState.create({
      doc: '# Heading\n\nParagraph with **bold** and *italic*.',
      selection: { anchor: 12 },
      extensions: [markdown(), createWysiwygExtension()]
    });
    const view = new EditorView({ state });
    views.push(view);

    expect(view.contentDOM.textContent).not.toContain('#');
    expect(view.contentDOM.textContent).not.toContain('**');
    expect(view.contentDOM.textContent).not.toContain('*italic*');
    expect(view.contentDOM.textContent).toContain('Heading');
    expect(view.contentDOM.textContent).toContain('bold');
  });
});
