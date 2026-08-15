export type MarkdownVisualNodeType =
  | 'heading'
  | 'paragraph'
  | 'strong'
  | 'emphasis'
  | 'strikethrough'
  | 'inlineCode'
  | 'link'
  | 'image'
  | 'blockquote'
  | 'list'
  | 'listItem'
  | 'task'
  | 'codeBlock'
  | 'table'
  | 'mathInline'
  | 'mathBlock'
  | 'html'
  | 'thematicBreak'
  | 'frontmatter'
  | 'toc'
  | 'definitionList'
  | 'footnote'
  | 'fallback';

export type MarkdownSourceRange = {
  from: number;
  to: number;
  lineFrom: number;
  lineTo: number;
};

export type MarkdownVisualNode = {
  id: string;
  type: MarkdownVisualNodeType;
  range: MarkdownSourceRange;
  contentRange?: MarkdownSourceRange;
  metadata?: Record<string, unknown>;
  fallbackReason?: string;
};

export type MarkdownDocumentIndex = {
  nodes: MarkdownVisualNode[];
  byType: Map<MarkdownVisualNodeType, MarkdownVisualNode[]>;
};

export type WysiwygExtensionOptions = {
  documentPath: string;
  locale: 'zh' | 'en';
  imageInsertMode?: 'assets' | 'embed';
};
