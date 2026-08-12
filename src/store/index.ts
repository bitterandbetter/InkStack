import { create } from 'zustand';
import { createDocumentSlice, type DocumentState } from './documents';
import { createAiSlice, type AiState } from './ai';
import { createSettingsSlice, type SettingsState } from './settings';
import { createUiSlice, type UiState } from './ui';

export type AppState = DocumentState & AiState & SettingsState & UiState;

export const useStore = create<AppState>((set: any, get: any) => ({
  ...createDocumentSlice(set, get),
  ...createAiSlice(set),
  ...createSettingsSlice(set, get),
  ...createUiSlice(set)
}));

export type {
  ViewMode,
  SaveState,
  SaveHistorySource,
  SaveFailureType,
  UnsavedChangeChoice,
  AiContextChoice,
  AiContextItem,
  AiContextResult,
  DocumentTab,
  SaveHistoryEntry
} from './documents';

export type {
  ReadingFont,
  ImageInsertMode,
  MarkdownToolbarRow,
  MarkdownToolbarItemPrefs,
  MarkdownToolbarPrefs,
  ReadingSettings,
  EditorSettings
} from './settings';
