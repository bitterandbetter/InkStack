import type { ReactNode } from 'react';
import {
  AI_PROVIDER_PRESETS,
  type AiConfig,
  type AiProviderPreset,
  type AiModelOption
} from '../lib/ai';
import type { EditorAiPrompts } from '../lib/aiPrompts';
import type { AiContextPreferences } from '../lib/aiContextPrefs';

export function AiSettingsPanel({
  locale,
  draftConfig,
  draftModels,
  draftPrompts,
  draftContextPreferences,
  activePreset,
  settingsSaved,
  isTestingModel,
  modelTest,
  onPresetChange,
  onConfigChange,
  onModelChanged,
  onPromptsChange,
  onContextPreferencesChange,
  onSave,
  onTestModel
}: {
  locale: 'zh' | 'en';
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
}) {
  const updatePrompt = (key: keyof EditorAiPrompts, value: string) => {
    onPromptsChange({ ...draftPrompts, [key]: value });
  };

  return (
    <>
      <div className="space-y-1">
        <label className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
          {locale === 'zh' ? 'AI 提供商接入' : 'AI Provider API'}
        </label>
        <select
          value={draftConfig.providerId}
          onChange={(event) => onPresetChange(event.target.value)}
          className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:border-accent"
        >
          {AI_PROVIDER_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.name}</option>
          ))}
        </select>
      </div>

      <Field label={locale === 'zh' ? '模型名称' : 'Model'}>
        <select
          value={draftConfig.model}
          onChange={(event) => {
            onConfigChange({ model: event.target.value });
            onModelChanged();
          }}
          className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:border-accent"
        >
          {draftModels.map((model) => (
            <option key={model.id || 'env'} value={model.id}>
              {model.note ? `${model.name} · ${model.note}` : model.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label={locale === 'zh' ? '温度' : 'Temperature'}>
        <input
          value={draftConfig.temperature}
          onChange={(event) => onConfigChange({ temperature: Number(event.target.value) })}
          type="number"
          min={0}
          max={2}
          step={0.1}
          className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:border-accent"
        />
      </Field>

      <Field label={locale === 'zh' ? 'AI 上下文偏好' : 'AI Context Preferences'}>
        <div className="space-y-2 rounded-md border border-border-subtle bg-bg-base p-3">
          <label className="flex items-start gap-2 text-[12px] text-text-secondary">
            <input
              type="checkbox"
              checked={draftContextPreferences.includeActiveFileByDefault}
              onChange={(event) => onContextPreferencesChange({
                ...draftContextPreferences,
                includeActiveFileByDefault: event.target.checked
              })}
              className="mt-0.5 h-3.5 w-3.5 accent-[var(--color-accent)]"
            />
            <span>
              {locale === 'zh'
                ? 'AI 对话默认勾选当前文件上下文'
                : 'Select active file context by default for AI chat'}
            </span>
          </label>
          <label className="block text-[12px] text-text-secondary">
            <span className="mb-1 block">
              {locale === 'zh' ? '工作区上下文上限' : 'Workspace context limit'}
            </span>
            <input
              type="number"
              min={0}
              max={10}
              step={1}
              value={draftContextPreferences.maxWorkspaceContexts}
              onChange={(event) => {
                const value = Number(event.target.value);
                onContextPreferencesChange({
                  ...draftContextPreferences,
                  maxWorkspaceContexts: Number.isFinite(value)
                    ? Math.min(Math.max(Math.round(value), 0), 10)
                    : draftContextPreferences.maxWorkspaceContexts
                });
              }}
              className="w-full rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:border-accent"
            />
          </label>
          <div className="text-[11px] leading-relaxed text-text-tertiary">
            {locale === 'zh'
              ? '发送前仍会弹出可编辑确认框；这些偏好只决定默认勾选和可添加数量。'
              : 'A confirmation dialog still appears before sending; these preferences only control defaults and limits.'}
          </div>
        </div>
      </Field>

      <Field label={locale === 'zh' ? '编辑器 AI 指令' : 'Editor AI Prompts'}>
        <div className="space-y-2">
          <PromptTextarea
            label={locale === 'zh' ? '改写选区' : 'Rewrite Selection'}
            value={draftPrompts.rewrite}
            onChange={(value) => updatePrompt('rewrite', value)}
          />
          <PromptTextarea
            label={locale === 'zh' ? '润色选区' : 'Polish Selection'}
            value={draftPrompts.polish}
            onChange={(value) => updatePrompt('polish', value)}
          />
          <PromptTextarea
            label={locale === 'zh' ? '扩写选区' : 'Expand Selection'}
            value={draftPrompts.expand}
            onChange={(value) => updatePrompt('expand', value)}
          />
          <PromptTextarea
            label={locale === 'zh' ? '翻译选区' : 'Translate Selection'}
            value={draftPrompts.translate}
            onChange={(value) => updatePrompt('translate', value)}
          />
          <PromptTextarea
            label={locale === 'zh' ? '提问选区' : 'Ask About Selection'}
            value={draftPrompts.ask}
            onChange={(value) => updatePrompt('ask', value)}
          />
          <PromptTextarea
            label={locale === 'zh' ? '总结选区' : 'Summarize Selection'}
            value={draftPrompts.summarize}
            onChange={(value) => updatePrompt('summarize', value)}
          />
        </div>
      </Field>

      <button
        onClick={onSave}
        className="w-full rounded-md bg-accent px-3 py-2 text-[13px] font-medium text-white hover:bg-accent/90 transition-colors"
      >
        {settingsSaved ? (locale === 'zh' ? '已保存' : 'Saved') : (locale === 'zh' ? '保存 AI 设置' : 'Save AI Settings')}
      </button>

      <button
        onClick={onTestModel}
        disabled={isTestingModel}
        className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-[13px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors disabled:opacity-60"
      >
        {isTestingModel ? (locale === 'zh' ? '正在测试模型...' : 'Testing model...') : (locale === 'zh' ? '测试所选模型' : 'Test Selected Model')}
      </button>

      {modelTest && (
        <pre className="whitespace-pre-wrap rounded-md border border-border-subtle bg-bg-base p-3 text-[11px] leading-relaxed text-text-secondary">
          {modelTest}
        </pre>
      )}

      <div className="rounded-md border border-border-subtle bg-bg-base p-3 text-[12px] leading-relaxed text-text-tertiary">
        <p>
          {locale === 'zh'
            ? 'AI 请求由 Tauri/Rust 后端发出。Base URL 和 API Key 只从本机环境变量读取，不在前端保存或传输。'
            : 'AI requests are sent by the Tauri/Rust backend. Base URLs and API keys are read only from local environment variables.'}
        </p>
        <p className="mt-2">
          {locale === 'zh'
            ? '模型清单以官方 API 文档可确认的文本生成模型为主，随时间更新；若你的账号支持其他模型，可修改 DEEPSEEK_MODEL 等环境变量后手动输入。'
            : 'The list prioritizes text-generation models confirmed by official API docs and updates over time; if your account supports other models, set DEEPSEEK_MODEL etc. and type the model name manually.'}
        </p>
        <p className="mt-2">
          {locale === 'zh'
            ? '默认不会注入隐藏系统提示词；如需统一系统指令，请在本机配置 INKSTACK_AI_SYSTEM_PROMPT。'
            : 'No hidden system prompt is injected by default; set INKSTACK_AI_SYSTEM_PROMPT locally if you want a shared system instruction.'}
        </p>
        <div className="mt-2 rounded bg-bg-panel px-2 py-1.5 font-mono text-[11px] text-text-secondary">
          {activePreset?.baseUrlLabel ? `${activePreset.baseUrlLabel}: ` : ''}
          {activePreset?.apiKeyEnv}: {activePreset?.modelEnv}: INKSTACK_AI_SYSTEM_PROMPT
        </div>
        {activePreset?.baseUrlDefault && (
          <div className="mt-2 rounded bg-bg-panel px-2 py-1.5 font-mono text-[11px] text-text-secondary">
            Base URL: {activePreset.baseUrlDefault}
          </div>
        )}
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">{label}</label>
      {children}
    </div>
  );
}

function PromptTextarea({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-text-tertiary">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="w-full resize-none rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-[12px] leading-relaxed text-text-primary focus:outline-none focus:border-accent"
      />
    </label>
  );
}
