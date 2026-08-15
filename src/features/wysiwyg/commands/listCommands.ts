import type { EditorView, KeyBinding } from '@codemirror/view';

const listPattern = /^(\s*)([-+*]|\d+[.)])(\s+)(?:\[([ xX])]\s+)?(.*)$/;

export const wysiwygListKeymap: KeyBinding[] = [
  { key: 'Enter', run: continueMarkdownList },
  { key: 'Tab', run: (view) => indentMarkdownList(view, false) },
  { key: 'Shift-Tab', run: (view) => indentMarkdownList(view, true) },
  { key: 'Backspace', run: removeEmptyMarkdownListPrefix }
];

export function continueMarkdownList(view: EditorView) {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;
  const line = view.state.doc.lineAt(selection.head);
  const match = line.text.match(listPattern);
  if (!match) return false;

  const content = match[5];
  const contentFrom = line.from + match[0].length - content.length;
  if (selection.head < contentFrom) return false;

  if (!content.trim()) {
    view.dispatch({
      changes: { from: line.from, to: contentFrom, insert: '' },
      selection: { anchor: line.from },
      scrollIntoView: true
    });
    return true;
  }

  const marker = nextListMarker(match[2]);
  const task = match[4] === undefined ? '' : '[ ] ';
  const prefix = `${match[1]}${marker}${match[3]}${task}`;
  view.dispatch({
    changes: { from: selection.head, insert: `\n${prefix}` },
    selection: { anchor: selection.head + prefix.length + 1 },
    scrollIntoView: true
  });
  return true;
}

export function indentMarkdownList(view: EditorView, outdent: boolean) {
  const selection = view.state.selection.main;
  const startLine = view.state.doc.lineAt(selection.from);
  const endLine = view.state.doc.lineAt(Math.max(selection.from, selection.to - 1));
  const changes: Array<{ from: number; to?: number; insert: string }> = [];

  for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    if (!listPattern.test(line.text)) continue;
    if (outdent) {
      const removable = line.text.startsWith('  ') ? 2 : line.text.startsWith('\t') ? 1 : 0;
      if (removable) changes.push({ from: line.from, to: line.from + removable, insert: '' });
    } else {
      changes.push({ from: line.from, insert: '  ' });
    }
  }

  if (!changes.length) return false;
  view.dispatch({ changes, scrollIntoView: true });
  return true;
}

export function removeEmptyMarkdownListPrefix(view: EditorView) {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;
  const line = view.state.doc.lineAt(selection.head);
  const match = line.text.match(listPattern);
  if (!match) return false;
  const contentFrom = line.from + match[0].length - match[5].length;
  if (selection.head !== contentFrom) return false;

  view.dispatch({
    changes: { from: line.from, to: contentFrom, insert: match[1] },
    selection: { anchor: line.from + match[1].length },
    scrollIntoView: true
  });
  return true;
}

function nextListMarker(marker: string) {
  const ordered = marker.match(/^(\d+)([.)])$/);
  if (!ordered) return marker;
  return `${Number(ordered[1]) + 1}${ordered[2]}`;
}
