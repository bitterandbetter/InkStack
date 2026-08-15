import type { EditorState, Range } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { createElement } from 'react';
import { nodeIsActive } from '../activeRanges';
import { buildMarkdownDocumentIndex } from '../documentIndex';
import type { MarkdownVisualNode } from '../types';
import { ListMarkerWidget, TaskCheckboxWidget } from '../widgets/ListMarkerWidget';
import { ReactWidget } from '../widgets/ReactWidget';
import { LinkWidget } from '../widgets/LinkWidget';
import {
  CodeBlockPreview,
  DefinitionListBlockPreview,
  FrontmatterBlockPreview,
  HtmlBlockPreview,
  ImageBlockPreview,
  LazyWidgetContent,
  MathBlockPreview,
  SourceFallbackPreview,
  TableBlockPreview,
  TocBlockPreview,
  WysiwygBlockFrame
} from '../widgets/WysiwygBlockWidget';
import type { WysiwygExtensionOptions } from '../types';

type OffsetRange = { from: number; to: number };

export function buildWysiwygDecorations(state: EditorState, options: WysiwygExtensionOptions): DecorationSet {
  const index = buildMarkdownDocumentIndex(state);
  const ranges: Range<Decoration>[] = [];
  const hidden: OffsetRange[] = [];
  const lineClasses = new Map<number, Set<string>>();

  const addLineClass = (lineNumber: number, className: string) => {
    const classes = lineClasses.get(lineNumber) ?? new Set<string>();
    classes.add(className);
    lineClasses.set(lineNumber, classes);
  };

  const replacementNodes = index.nodes.filter((node) => shouldRenderWidget(state, node));
  for (const node of index.nodes) {
    if (replacementNodes.some((replacement) => replacement !== node && containsNode(replacement, node))) continue;
    const active = nodeIsActive(node, state.selection);
    addNodeDecorations(state, options, node, active, ranges, hidden, addLineClass);
  }

  for (const [lineNumber, classes] of lineClasses) {
    if (lineNumber < 1 || lineNumber > state.doc.lines) continue;
    const line = state.doc.line(lineNumber);
    ranges.push(Decoration.line({ class: Array.from(classes).join(' ') }).range(line.from));
  }

  for (const range of mergeRanges(hidden)) {
    ranges.push(Decoration.replace({}).range(range.from, range.to));
  }

  return Decoration.set(ranges, true);
}

function addNodeDecorations(
  state: EditorState,
  options: WysiwygExtensionOptions,
  node: MarkdownVisualNode,
  active: boolean,
  ranges: Range<Decoration>[],
  hidden: OffsetRange[],
  addLineClass: (line: number, className: string) => void
) {
  const content = node.contentRange;
  if (!active && shouldRenderWidget(state, node)) {
    const widget = createBlockWidget(state, options, node);
    if (widget) {
      ranges.push(Decoration.replace({ widget, block: isBlockWidget(state, node) }).range(node.range.from, node.range.to));
      return;
    }
  }

  if (node.type === 'heading') {
    const level = Number(node.metadata?.level ?? 1);
    forEachLine(node, (line) => addLineClass(line, `inkstack-wysiwyg-heading inkstack-wysiwyg-h${level}`));
    if (!active && content) hideDelimiters(node, content, hidden);
    return;
  }

  if (node.type === 'strong' || node.type === 'emphasis' || node.type === 'strikethrough' || node.type === 'inlineCode') {
    if (content) {
      const className = {
        strong: 'inkstack-wysiwyg-strong',
        emphasis: 'inkstack-wysiwyg-emphasis',
        strikethrough: 'inkstack-wysiwyg-strike',
        inlineCode: 'inkstack-wysiwyg-inline-code'
      }[node.type];
      ranges.push(Decoration.mark({ class: className }).range(content.from, content.to));
      if (!active) hideDelimiters(node, content, hidden);
    }
    return;
  }

  if (node.type === 'link') {
    if (content) {
      if (!active) {
        ranges.push(Decoration.replace({
          widget: new LinkWidget(
            node.range.from,
            node.range.to,
            String(node.metadata?.label ?? state.sliceDoc(content.from, content.to)),
            String(node.metadata?.target ?? ''),
            String(node.metadata?.title ?? ''),
            options.locale
          )
        }).range(node.range.from, node.range.to));
      } else {
        ranges.push(Decoration.mark({ class: 'inkstack-wysiwyg-link' }).range(content.from, content.to));
      }
    }
    return;
  }

  if (node.type === 'image') {
    forEachLine(node, (line) => addLineClass(line, 'inkstack-wysiwyg-image-source'));
    return;
  }

  if (node.type === 'blockquote') {
    forEachLine(node, (line) => addLineClass(line, 'inkstack-wysiwyg-blockquote'));
    if (!active) hideBlockquoteMarkers(state, node, hidden);
    return;
  }

  if (node.type === 'listItem' && !active) {
    const markerFrom = numberMetadata(node, 'markerFrom');
    const markerTo = numberMetadata(node, 'markerTo');
    if (markerFrom !== null && markerTo !== null && markerTo > markerFrom) {
      ranges.push(Decoration.replace({
        widget: new ListMarkerWidget(String(node.metadata?.marker ?? '•'), Boolean(node.metadata?.ordered))
      }).range(markerFrom, markerTo));
    }
    addLineClass(node.range.lineFrom, 'inkstack-wysiwyg-list-item');
    return;
  }

  if (node.type === 'task' && !active) {
    const markerFrom = numberMetadata(node, 'markerFrom');
    const markerTo = numberMetadata(node, 'markerTo');
    const checkFrom = numberMetadata(node, 'checkFrom');
    if (markerFrom !== null && markerTo !== null && checkFrom !== null && markerTo > markerFrom) {
      ranges.push(Decoration.replace({
        widget: new TaskCheckboxWidget(Boolean(node.metadata?.checked), checkFrom, options.locale)
      }).range(markerFrom, markerTo));
    }
    addLineClass(node.range.lineFrom, 'inkstack-wysiwyg-list-item inkstack-wysiwyg-task-item');
    return;
  }

  if (node.type === 'thematicBreak') {
    addLineClass(node.range.lineFrom, active ? 'inkstack-wysiwyg-hr-active' : 'inkstack-wysiwyg-hr');
    if (!active) hidden.push({ from: node.range.from, to: node.range.to });
    return;
  }

  if (node.type === 'codeBlock') {
    forEachLine(node, (line) => addLineClass(line, 'inkstack-wysiwyg-code-block'));
    if (node.range.lineFrom !== node.range.lineTo) {
      addLineClass(node.range.lineFrom, 'inkstack-wysiwyg-code-fence');
      addLineClass(node.range.lineTo, 'inkstack-wysiwyg-code-fence');
    }
    return;
  }

  if (node.type === 'table') {
    forEachLine(node, (line) => addLineClass(line, 'inkstack-wysiwyg-table-source'));
    return;
  }

  if (node.type === 'mathInline' && content) {
    ranges.push(Decoration.mark({ class: 'inkstack-wysiwyg-math-inline' }).range(content.from, content.to));
    return;
  }

  if (node.type === 'mathBlock') {
    forEachLine(node, (line) => addLineClass(line, 'inkstack-wysiwyg-math-block'));
    return;
  }

  if (node.type === 'frontmatter') {
    forEachLine(node, (line) => addLineClass(line, 'inkstack-wysiwyg-frontmatter'));
    return;
  }

  if (node.type === 'html' || node.type === 'definitionList' || node.type === 'footnote' || node.type === 'toc') {
    forEachLine(node, (line) => addLineClass(line, `inkstack-wysiwyg-${node.type}`));
    return;
  }

  if (node.type === 'fallback') {
    forEachLine(node, (line) => addLineClass(line, 'inkstack-wysiwyg-fallback'));
  }
}

function createBlockWidget(state: EditorState, options: WysiwygExtensionOptions, node: MarkdownVisualNode) {
  const source = state.sliceDoc(node.range.from, node.range.to);
  const editSource = (view: EditorView) => {
    const anchor = node.contentRange?.from ?? node.range.from;
    view.dispatch({
      selection: { anchor },
      effects: EditorView.scrollIntoView(anchor, { y: 'center' })
    });
    view.focus();
  };

  if (node.type === 'image') {
    const src = String(node.metadata?.src ?? '');
    const alt = String(node.metadata?.alt ?? '');
    return new ReactWidget(
      `image:${node.range.from}:${source}:${options.documentPath}:${options.locale}`,
      (view) => createElement(WysiwygBlockFrame, {
        label: options.locale === 'zh' ? '图片' : 'Image',
        source,
        locale: options.locale,
        onEditSource: () => editSource(view)
      }, createElement(LazyWidgetContent, { label: options.locale === 'zh' ? '图片稍后加载' : 'Image loads when nearby' }, createElement(ImageBlockPreview, {
        src,
        alt,
        documentPath: options.documentPath,
        locale: options.locale,
        imageInsertMode: options.imageInsertMode ?? 'assets',
        onSourceChange: (nextSource: string) => {
          view.dispatch({ changes: { from: node.range.from, to: node.range.to, insert: nextSource } });
          view.focus();
        }
      }))),
      'inkstack-wysiwyg-react-widget'
    );
  }

  if (node.type === 'codeBlock') {
    const language = String(node.metadata?.language ?? 'text');
    const code = node.contentRange ? state.sliceDoc(node.contentRange.from, node.contentRange.to) : source;
    return new ReactWidget(
      `code:${node.range.from}:${source}:${options.locale}`,
      (view) => createElement(WysiwygBlockFrame, {
        label: language === 'mermaid' ? 'Mermaid' : `${options.locale === 'zh' ? '代码块' : 'Code block'} · ${language}`,
        source,
        locale: options.locale,
        onEditSource: () => editSource(view)
      }, createElement(LazyWidgetContent, { label: options.locale === 'zh' ? '代码块稍后加载' : 'Code block loads when nearby' }, createElement(CodeBlockPreview, { source: code, language }))),
      'inkstack-wysiwyg-react-widget'
    );
  }

  if (node.type === 'mathBlock') {
    const formula = node.contentRange ? state.sliceDoc(node.contentRange.from, node.contentRange.to).trim() : source;
    return new ReactWidget(
      `math-block:${node.range.from}:${source}:${options.locale}`,
      (view) => createElement(WysiwygBlockFrame, {
        label: options.locale === 'zh' ? '公式' : 'Formula',
        source,
        locale: options.locale,
        onEditSource: () => editSource(view)
      }, createElement(LazyWidgetContent, { label: options.locale === 'zh' ? '公式稍后加载' : 'Formula loads when nearby' }, createElement(MathBlockPreview, { source: formula, display: true }))),
      'inkstack-wysiwyg-react-widget'
    );
  }

  if (node.type === 'mathInline') {
    const formula = node.contentRange ? state.sliceDoc(node.contentRange.from, node.contentRange.to) : source;
    return new ReactWidget(
      `math-inline:${node.range.from}:${source}`,
      (view) => createElement('span', {
        onDoubleClick: () => editSource(view),
        title: options.locale === 'zh' ? '双击编辑公式源码' : 'Double-click to edit formula source'
      }, createElement(MathBlockPreview, { source: formula, display: false })),
      'inkstack-wysiwyg-inline-widget',
      'span'
    );
  }

  if (node.type === 'table') {
    return new ReactWidget(
      `table-editor-v1:${node.range.from}:${source}:${options.locale}`,
      (view) => createElement(WysiwygBlockFrame, {
        label: options.locale === 'zh' ? '表格' : 'Table',
        source,
        locale: options.locale,
        onEditSource: () => editSource(view)
      }, createElement(LazyWidgetContent, { label: options.locale === 'zh' ? '表格稍后加载' : 'Table loads when nearby' }, createElement(TableBlockPreview, {
        source,
        locale: options.locale,
        onSourceChange: (nextSource: string) => {
          view.dispatch({
            changes: { from: node.range.from, to: node.range.to, insert: nextSource },
            selection: { anchor: Math.min(node.range.from, view.state.doc.length) }
          });
          view.focus();
        }
      }))),
      'inkstack-wysiwyg-react-widget'
    );
  }

  if (node.type === 'frontmatter') {
    return new ReactWidget(
      `frontmatter:${source}:${options.locale}`,
      (view) => createElement(WysiwygBlockFrame, {
        label: options.locale === 'zh' ? '元数据' : 'Metadata', source, locale: options.locale,
        onEditSource: () => editSource(view)
      }, createElement(FrontmatterBlockPreview, { source, locale: options.locale })),
      'inkstack-wysiwyg-react-widget'
    );
  }

  if (node.type === 'toc') {
    const headings = buildMarkdownDocumentIndex(state).nodes
      .filter((candidate) => candidate.type === 'heading')
      .map((candidate) => ({
        level: Number(candidate.metadata?.level ?? 1),
        text: candidate.contentRange ? state.sliceDoc(candidate.contentRange.from, candidate.contentRange.to) : state.sliceDoc(candidate.range.from, candidate.range.to),
        from: candidate.range.from
      }));
    return new ReactWidget(
      `toc:${node.range.from}:${headings.map((heading) => `${heading.level}:${heading.text}`).join('|')}:${options.locale}`,
      (view) => createElement(WysiwygBlockFrame, {
        label: options.locale === 'zh' ? '目录' : 'Table of contents', source, locale: options.locale,
        onEditSource: () => editSource(view)
      }, createElement(TocBlockPreview, {
        headings,
        locale: options.locale,
        onNavigate: (from: number) => {
          view.dispatch({ selection: { anchor: from }, effects: EditorView.scrollIntoView(from, { y: 'center' }) });
          view.focus();
        }
      })),
      'inkstack-wysiwyg-react-widget'
    );
  }

  if (node.type === 'definitionList') {
    return new ReactWidget(
      `definition:${node.range.from}:${source}:${options.locale}`,
      (view) => createElement(WysiwygBlockFrame, {
        label: options.locale === 'zh' ? '定义列表' : 'Definition list', source, locale: options.locale,
        onEditSource: () => editSource(view)
      }, createElement(DefinitionListBlockPreview, { source })),
      'inkstack-wysiwyg-react-widget'
    );
  }

  if (node.type === 'html') {
    return new ReactWidget(
      `html:${node.range.from}:${source}:${options.locale}`,
      (view) => createElement(WysiwygBlockFrame, {
        label: 'HTML', source, locale: options.locale, onEditSource: () => editSource(view)
      }, createElement(HtmlBlockPreview, { source, locale: options.locale })),
      'inkstack-wysiwyg-react-widget'
    );
  }

  if (node.type === 'footnote' || node.type === 'fallback') {
    const label = node.type === 'footnote'
      ? (options.locale === 'zh' ? '脚注源码' : 'Footnote source')
      : (options.locale === 'zh' ? '不支持的可视语法' : 'Unsupported visual syntax');
    return new ReactWidget(
      `fallback:${node.type}:${node.range.from}:${source}:${options.locale}`,
      (view) => createElement(WysiwygBlockFrame, {
        label, source, locale: options.locale, onEditSource: () => editSource(view)
      }, createElement(SourceFallbackPreview, { source, locale: options.locale, reason: node.fallbackReason })),
      'inkstack-wysiwyg-react-widget'
    );
  }

  return null;
}

function shouldRenderWidget(state: EditorState, node: MarkdownVisualNode) {
  if (nodeIsActive(node, state.selection)) return false;
  if (!['image', 'codeBlock', 'mathInline', 'mathBlock', 'table', 'frontmatter', 'toc', 'definitionList', 'html', 'footnote', 'fallback'].includes(node.type)) return false;
  if (['frontmatter', 'toc', 'definitionList', 'html', 'footnote', 'fallback'].includes(node.type) && !isBlockWidget(state, node)) return false;
  if (node.type === 'image') return isBlockWidget(state, node);
  return true;
}

function isBlockWidget(state: EditorState, node: MarkdownVisualNode) {
  if (node.type !== 'mathInline') {
    const start = state.doc.lineAt(node.range.from);
    const end = state.doc.lineAt(Math.max(node.range.from, node.range.to - 1));
    if (node.range.from === start.from && node.range.to === end.to) return true;
  }
  return false;
}

function containsNode(container: MarkdownVisualNode, candidate: MarkdownVisualNode) {
  return candidate.range.from >= container.range.from && candidate.range.to <= container.range.to;
}

function hideDelimiters(node: MarkdownVisualNode, content: NonNullable<MarkdownVisualNode['contentRange']>, hidden: OffsetRange[]) {
  if (content.from > node.range.from) hidden.push({ from: node.range.from, to: content.from });
  if (content.to < node.range.to) hidden.push({ from: content.to, to: node.range.to });
}

function mergeRanges(ranges: OffsetRange[]) {
  const sorted = ranges
    .filter((range) => range.to > range.from)
    .sort((left, right) => left.from - right.from || left.to - right.to);
  const merged: OffsetRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || range.from > previous.to) {
      merged.push({ ...range });
    } else {
      previous.to = Math.max(previous.to, range.to);
    }
  }
  return merged;
}

function forEachLine(node: MarkdownVisualNode, callback: (line: number) => void) {
  for (let line = node.range.lineFrom; line <= node.range.lineTo; line += 1) callback(line);
}

function numberMetadata(node: MarkdownVisualNode, key: string) {
  const value = node.metadata?.[key];
  return typeof value === 'number' ? value : null;
}

function hideBlockquoteMarkers(state: EditorState, node: MarkdownVisualNode, hidden: OffsetRange[]) {
  for (let lineNumber = node.range.lineFrom; lineNumber <= node.range.lineTo; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const match = line.text.match(/^\s{0,3}>[ \t]?/);
    if (match) hidden.push({ from: line.from, to: line.from + match[0].length });
  }
}
