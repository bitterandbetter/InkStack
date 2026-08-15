import { StateEffect, StateField, type EditorState } from '@codemirror/state';
import type { MarkdownVisualNode } from './types';

export type WysiwygSourceBlockRange = { from: number; to: number };

export const setWysiwygSourceBlock = StateEffect.define<WysiwygSourceBlockRange | null>({
  map(value, changes) {
    if (!value) return null;
    return {
      from: changes.mapPos(value.from, 1),
      to: changes.mapPos(value.to, -1)
    };
  }
});

export const wysiwygSourceBlockField = StateField.define<WysiwygSourceBlockRange | null>({
  create: () => null,
  update(current, transaction) {
    let next = current
      ? {
          from: transaction.changes.mapPos(current.from, 1),
          to: transaction.changes.mapPos(current.to, -1)
        }
      : null;

    for (const effect of transaction.effects) {
      if (effect.is(setWysiwygSourceBlock)) next = effect.value;
    }

    if (next && transaction.selection && !transaction.selection.ranges.some((range) => (
      range.empty
        ? range.head >= next!.from && range.head <= next!.to
        : range.from < next!.to && range.to > next!.from
    ))) {
      return null;
    }
    return next;
  }
});

export function nodeUsesExplicitSource(state: EditorState, node: MarkdownVisualNode) {
  const range = state.field(wysiwygSourceBlockField, false);
  return Boolean(range && range.from === node.range.from && range.to === node.range.to);
}
