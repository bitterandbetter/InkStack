import type { EditorAiPromptKey } from './aiPrompts';

export type MarkdownEditorCommand =
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'inlineCode'
  | 'codeBlock'
  | 'quote'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'link'
  | 'image'
  | 'attachment'
  | 'table'
  | 'formatTable'
  | 'insertTableRow'
  | 'insertTableColumn'
  | 'pasteCsvTable'
  | 'divider';

export type EditorCommand =
  | { type: 'markdown'; action: MarkdownEditorCommand }
  | { type: 'find' }
  | { type: 'selection-ai'; action: EditorAiPromptKey };

export type AiPanelTab = 'ai' | 'outline' | 'code' | 'settings';
export interface AiSelectionPayload {
  text: string;
  source: 'editor' | 'preview';
}

const EDITOR_COMMAND_EVENT = 'inkstack:editor-command';
const AI_PANEL_TAB_EVENT = 'inkstack:ai-panel-tab';
const AI_SELECTION_EVENT = 'inkstack:ai-selection';

export function emitEditorCommand(command: EditorCommand) {
  window.dispatchEvent(new CustomEvent<EditorCommand>(EDITOR_COMMAND_EVENT, { detail: command }));
}

export function listenEditorCommand(listener: (command: EditorCommand) => void) {
  const handler = (event: Event) => {
    listener((event as CustomEvent<EditorCommand>).detail);
  };
  window.addEventListener(EDITOR_COMMAND_EVENT, handler);
  return () => window.removeEventListener(EDITOR_COMMAND_EVENT, handler);
}

export function emitAiPanelTab(tab: AiPanelTab) {
  window.dispatchEvent(new CustomEvent<AiPanelTab>(AI_PANEL_TAB_EVENT, { detail: tab }));
}

export function listenAiPanelTab(listener: (tab: AiPanelTab) => void) {
  const handler = (event: Event) => {
    listener((event as CustomEvent<AiPanelTab>).detail);
  };
  window.addEventListener(AI_PANEL_TAB_EVENT, handler);
  return () => window.removeEventListener(AI_PANEL_TAB_EVENT, handler);
}

export function emitAiSelection(payload: AiSelectionPayload) {
  window.dispatchEvent(new CustomEvent<AiSelectionPayload>(AI_SELECTION_EVENT, { detail: payload }));
}

export function listenAiSelection(listener: (payload: AiSelectionPayload) => void) {
  const handler = (event: Event) => {
    listener((event as CustomEvent<AiSelectionPayload>).detail);
  };
  window.addEventListener(AI_SELECTION_EVENT, handler);
  return () => window.removeEventListener(AI_SELECTION_EVENT, handler);
}
