import type { EditorSelection, EditorState } from '@codemirror/state';
import type { MarkdownVisualNode } from './types';

export function nodeIsActive(node: MarkdownVisualNode, selection: EditorSelection) {
  return selection.ranges.some((range) => {
    if (range.empty) return range.head >= node.range.from && range.head <= node.range.to;
    return range.from < node.range.to && range.to > node.range.from;
  });
}

export function activeMarkdownNodes(state: EditorState, nodes: MarkdownVisualNode[]) {
  return nodes.filter((node) => nodeIsActive(node, state.selection));
}
