import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import {
  continueMarkdownList,
  indentMarkdownList,
  removeEmptyMarkdownListPrefix
} from '../../../../src/features/wysiwyg/commands/listCommands';

const views: EditorView[] = [];

function viewWithCursor(doc: string, anchor = doc.length) {
  const view = new EditorView({ state: EditorState.create({ doc, selection: { anchor } }) });
  views.push(view);
  return view;
}

afterEach(() => {
  while (views.length) views.pop()?.destroy();
});

describe('WYSIWYG list editing commands', () => {
  it('continues bullet lists', () => {
    const view = viewWithCursor('- first');

    expect(continueMarkdownList(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('- first\n- ');
  });

  it('increments ordered list markers', () => {
    const view = viewWithCursor('8. item');

    expect(continueMarkdownList(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('8. item\n9. ');
  });

  it('starts new tasks unchecked', () => {
    const view = viewWithCursor('- [x] done');

    expect(continueMarkdownList(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('- [x] done\n- [ ] ');
  });

  it('exits an empty list item', () => {
    const view = viewWithCursor('- ');

    expect(continueMarkdownList(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('');
  });

  it('indents and outdents list items', () => {
    const view = viewWithCursor('- item', 3);

    expect(indentMarkdownList(view, false)).toBe(true);
    expect(view.state.doc.toString()).toBe('  - item');
    expect(indentMarkdownList(view, true)).toBe(true);
    expect(view.state.doc.toString()).toBe('- item');
  });

  it('removes the list prefix at the content boundary', () => {
    const view = viewWithCursor('- item', 2);

    expect(removeEmptyMarkdownListPrefix(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('item');
  });
});
