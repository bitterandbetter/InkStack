import type { AiConfig } from '../lib/ai';
import type { EditorAiPrompts } from '../lib/aiPrompts';
import type { AiContextPreferences } from '../lib/aiContextPrefs';
import type { AiContextItem } from './documents';

export interface AiState {
  aiConfig: AiConfig;
  setAiConfig: (config: AiConfig) => void;
  editorAiPrompts: EditorAiPrompts;
  setEditorAiPrompts: (prompts: EditorAiPrompts) => void;
  aiContextPreferences: AiContextPreferences;
  setAiContextPreferences: (preferences: AiContextPreferences) => void;
  aiWorking: boolean;
  setAiWorking: (working: boolean) => void;
}

export function createAiSlice(set: any): AiState {
  return {
    aiConfig: {
      providerId: 'openai' as any,
      providerName: '',
      kind: 'openai' as any,
      model: '',
      temperature: 0.7
    },
    setAiConfig: (config) => set({ aiConfig: config }),
    editorAiPrompts: {
      rewrite: '',
      polish: '',
      expand: '',
      translate: '',
      ask: '',
      summarize: ''
    },
    setEditorAiPrompts: (prompts) => set({ editorAiPrompts: prompts }),
    aiContextPreferences: {
      includeActiveFileByDefault: false,
      maxWorkspaceContexts: 5
    },
    setAiContextPreferences: (preferences) => set({ aiContextPreferences: preferences }),
    aiWorking: false,
    setAiWorking: (working) => set({ aiWorking: working })
  };
}
