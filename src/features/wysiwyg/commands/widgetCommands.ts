import type { EditorView } from '@codemirror/view';
import { buildMarkdownDocumentIndex } from '../documentIndex';
import { nodeIsActive } from '../activeRanges';
import { setWysiwygSourceBlock, wysiwygSourceBlockField } from '../sourceBlockState';

const richTypes = new Set(['image', 'codeBlock', 'table', 'mathBlock', 'mathInline']);

export function exitActiveWysiwygBlock(view: EditorView) {
  const explicitSource = view.state.field(wysiwygSourceBlockField, false);
  const active = buildMarkdownDocumentIndex(view.state).nodes.find(
    (node) => richTypes.has(node.type)
      && (nodeIsActive(node, view.state.selection) || Boolean(
        explicitSource
        && explicitSource.from === node.range.from
        && explicitSource.to === node.range.to
      ))
  );
  if (!active) return false;

  const anchor = active.range.to < view.state.doc.length
    ? active.range.to + 1
    : Math.max(0, active.range.from - 1);
  view.dispatch({
    selection: { anchor },
    effects: setWysiwygSourceBlock.of(null),
    scrollIntoView: true
  });
  return true;
}
