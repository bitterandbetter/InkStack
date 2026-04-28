import type { EditorAiPromptKey } from '../lib/aiPrompts';

export type MarkdownAction = import('../lib/appEvents').MarkdownEditorCommand;
export type TransformAction = Extract<EditorAiPromptKey, 'rewrite' | 'polish' | 'expand' | 'translate'>;
export type InsightAction = Extract<EditorAiPromptKey, 'ask' | 'summarize'>;
export type FindMatch = { from: number; to: number };

