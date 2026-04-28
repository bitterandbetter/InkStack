import type { MarkdownEditorCommand } from './appEvents';

export type MarkdownCommandDefinition = {
  action: MarkdownEditorCommand;
  title: {
    zh: string;
    en: string;
  };
  shortcut?: string;
};

export const MARKDOWN_COMMANDS: MarkdownCommandDefinition[] = [
  { action: 'heading1', title: { zh: '插入一级标题', en: 'Insert heading 1' }, shortcut: 'Cmd/Ctrl+1' },
  { action: 'heading2', title: { zh: '插入二级标题', en: 'Insert heading 2' }, shortcut: 'Cmd/Ctrl+2' },
  { action: 'heading3', title: { zh: '插入三级标题', en: 'Insert heading 3' }, shortcut: 'Cmd/Ctrl+3' },
  { action: 'bold', title: { zh: '加粗选区', en: 'Bold selection' }, shortcut: 'Cmd/Ctrl+B' },
  { action: 'italic', title: { zh: '斜体选区', en: 'Italic selection' }, shortcut: 'Cmd/Ctrl+I' },
  { action: 'strike', title: { zh: '删除线', en: 'Strikethrough' } },
  { action: 'inlineCode', title: { zh: '行内代码', en: 'Inline code' } },
  { action: 'codeBlock', title: { zh: '插入代码块', en: 'Insert code block' } },
  { action: 'quote', title: { zh: '引用块', en: 'Block quote' } },
  { action: 'bulletList', title: { zh: '无序列表', en: 'Bulleted list' } },
  { action: 'orderedList', title: { zh: '有序列表', en: 'Ordered list' } },
  { action: 'taskList', title: { zh: '任务列表', en: 'Task list' } },
  { action: 'link', title: { zh: '插入链接', en: 'Insert link' }, shortcut: 'Cmd/Ctrl+K' },
  { action: 'image', title: { zh: '选择并插入图片', en: 'Choose and insert image' } },
  { action: 'attachment', title: { zh: '选择并插入附件', en: 'Choose and insert attachment' } },
  { action: 'table', title: { zh: '插入 Markdown 表格', en: 'Insert Markdown table' } },
  { action: 'formatTable', title: { zh: '格式化当前表格', en: 'Format current table' } },
  { action: 'insertTableRow', title: { zh: '表格：在下方插入行', en: 'Table: insert row below' } },
  { action: 'insertTableColumn', title: { zh: '表格：在右侧插入列', en: 'Table: insert column right' } },
  { action: 'pasteCsvTable', title: { zh: '从剪贴板 CSV/TSV 插入表格', en: 'Insert table from clipboard CSV/TSV' } },
  { action: 'divider', title: { zh: '插入分割线', en: 'Insert divider' } }
];

export const MARKDOWN_COMMAND_SHORTCUTS: Partial<Record<MarkdownEditorCommand, string>> = Object.fromEntries(
  MARKDOWN_COMMANDS
    .filter((command) => command.shortcut)
    .map((command) => [command.action, command.shortcut])
) as Partial<Record<MarkdownEditorCommand, string>>;

export function getMarkdownCommandTitle(action: MarkdownEditorCommand, locale: 'zh' | 'en') {
  return MARKDOWN_COMMANDS.find((command) => command.action === action)?.title[locale] ?? action;
}
