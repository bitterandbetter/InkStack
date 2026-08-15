import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { applyMarkdownEdit } from '../../../src/components/markdownEditorActions';
import type { MarkdownEditorCommand } from '../../../src/lib/appEvents';

const views: EditorView[] = [];

function createView(doc: string, anchor = 0, head = anchor) {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor, head }
    })
  });
  views.push(view);
  return view;
}

function apply(doc: string, action: MarkdownEditorCommand, anchor = 0, head = anchor) {
  const view = createView(doc, anchor, head);
  applyMarkdownEdit(view, action);
  return {
    doc: view.state.doc.toString(),
    selection: view.state.selection.main
  };
}

afterEach(() => {
  while (views.length) views.pop()?.destroy();
});

describe('Markdown editor actions', () => {
  it('wraps the selected text without losing the source selection', () => {
    const result = apply('alpha beta', 'bold', 6, 10);

    expect(result.doc).toBe('alpha **beta**');
    expect(result.doc.slice(result.selection.from, result.selection.to)).toBe('beta');
  });

  it('replaces an existing heading prefix instead of stacking prefixes', () => {
    const result = apply('## Existing heading', 'heading1', 5);

    expect(result.doc).toBe('# Existing heading');
  });

  it('numbers every selected line in a single transaction', () => {
    const result = apply('first\nsecond', 'orderedList', 0, 12);

    expect(result.doc).toBe('1. first\n2. second');
  });

  it('selects the link destination after inserting a link', () => {
    const result = apply('InkStack', 'link', 0, 8);

    expect(result.doc).toBe('[InkStack](https://)');
    expect(result.doc.slice(result.selection.from, result.selection.to)).toBe('https://');
  });

  it('wraps selected source in a fenced code block', () => {
    const result = apply('const value = 1;', 'codeBlock', 0, 16);

    expect(result.doc).toBe('```text\nconst value = 1;\n```');
    expect(result.doc.slice(result.selection.from, result.selection.to)).toBe('const value = 1;');
  });

  it('formats only the active Markdown table', () => {
    const source = 'before\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nafter';
    const result = apply(source, 'formatTable', source.indexOf('| 1'));

    expect(result.doc).toContain('| A   | B   |\n| --- | --- |\n| 1   | 2   |');
    expect(result.doc.startsWith('before\n\n')).toBe(true);
    expect(result.doc.endsWith('\n\nafter')).toBe(true);
  });
});
