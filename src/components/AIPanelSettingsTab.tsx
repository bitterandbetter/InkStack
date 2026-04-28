import type { AiConfig, AiModelOption, AiProviderPreset } from '../lib/ai';
import type { AiContextPreferences } from '../lib/aiContextPrefs';
import type { EditorAiPrompts } from '../lib/aiPrompts';
import { AiSettingsPanel } from './AiSettingsPanel';

export function AIPanelSettingsTab({
  locale,
  ai
}: {
  locale: 'zh' | 'en';
  ai: {
    draftConfig: AiConfig;
    draftModels: AiModelOption[];
    draftPrompts: EditorAiPrompts;
    draftContextPreferences: AiContextPreferences;
    activePreset?: AiProviderPreset;
    settingsSaved: boolean;
    isTestingModel: boolean;
    modelTest: string;
    onPresetChange: (presetId: string) => void;
    onConfigChange: (patch: Partial<AiConfig>) => void;
    onModelChanged: () => void;
    onPromptsChange: (prompts: EditorAiPrompts) => void;
    onContextPreferencesChange: (preferences: AiContextPreferences) => void;
    onSave: () => void;
    onTestModel: () => void;
  };
}) {
  return (
    <div className="h-full min-h-0 overflow-y-auto bg-bg-panel/30 p-4">
      <AiSettingsPanel
        locale={locale}
        draftConfig={ai.draftConfig}
        draftModels={ai.draftModels}
        draftPrompts={ai.draftPrompts}
        draftContextPreferences={ai.draftContextPreferences}
        activePreset={ai.activePreset}
        settingsSaved={ai.settingsSaved}
        isTestingModel={ai.isTestingModel}
        modelTest={ai.modelTest}
        onPresetChange={ai.onPresetChange}
        onConfigChange={ai.onConfigChange}
        onModelChanged={ai.onModelChanged}
        onPromptsChange={ai.onPromptsChange}
        onContextPreferencesChange={ai.onContextPreferencesChange}
        onSave={ai.onSave}
        onTestModel={ai.onTestModel}
      />
    </div>
  );
}
