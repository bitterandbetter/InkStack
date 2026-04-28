export interface AiContextPreferences {
  includeActiveFileByDefault: boolean;
  maxWorkspaceContexts: number;
}

const AI_CONTEXT_PREFS_STORAGE_KEY = 'inkstack.ai.context.preferences.v1';

export const DEFAULT_AI_CONTEXT_PREFERENCES: AiContextPreferences = {
  includeActiveFileByDefault: false,
  maxWorkspaceContexts: 5
};

export function loadAiContextPreferences(): AiContextPreferences {
  try {
    const saved = localStorage.getItem(AI_CONTEXT_PREFS_STORAGE_KEY);
    if (!saved) return DEFAULT_AI_CONTEXT_PREFERENCES;
    return normalizeAiContextPreferences(JSON.parse(saved));
  } catch {
    return DEFAULT_AI_CONTEXT_PREFERENCES;
  }
}

export function saveAiContextPreferences(preferences: AiContextPreferences) {
  localStorage.setItem(AI_CONTEXT_PREFS_STORAGE_KEY, JSON.stringify(normalizeAiContextPreferences(preferences)));
}

export function normalizeAiContextPreferences(value: Partial<AiContextPreferences>): AiContextPreferences {
  const maxWorkspaceContexts = Number(value.maxWorkspaceContexts);
  return {
    includeActiveFileByDefault: Boolean(value.includeActiveFileByDefault),
    maxWorkspaceContexts: Number.isFinite(maxWorkspaceContexts)
      ? Math.min(Math.max(Math.round(maxWorkspaceContexts), 0), 10)
      : DEFAULT_AI_CONTEXT_PREFERENCES.maxWorkspaceContexts
  };
}
