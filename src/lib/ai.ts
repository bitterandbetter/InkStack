import { invoke } from '@tauri-apps/api/core';

export type AiProviderKind = 'openai' | 'anthropic' | 'gemini';

export interface AiProviderPreset {
  id: AiProviderKind;
  name: string;
  model: string;
  baseUrlLabel: string;
  apiKeyEnv: string;
  modelEnv: string;
  models: AiModelOption[];
}

export interface AiModelOption {
  id: string;
  name: string;
  note?: string;
}

export interface AiConfig {
  providerId: AiProviderKind;
  providerName: string;
  kind: AiProviderKind;
  model: string;
  temperature: number;
}

type GenerateOptions = {
  prompt: string;
  context?: string;
  mode?: 'chat' | 'rewrite';
};

type TauriAiGenerateResult = {
  text: string;
};

export type AiModelTestResult = {
  ok: boolean;
  provider: AiProviderKind;
  requestedModel: string;
  responseModel?: string | null;
  answer?: string | null;
  error?: string | null;
};

const SESSION_CONFIG_KEY = 'inkstack.ai.config.v2';

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: 'openai',
    name: 'AICodeMirror OpenAI',
    model: 'gpt-5.5',
    baseUrlLabel: 'OPENAI_BASE_URL',
    apiKeyEnv: 'OPENAI_API_KEY',
    modelEnv: 'OPENAI_MODEL',
    models: [
      { id: '', name: '读取 OPENAI_MODEL' },
      { id: 'gpt-5.5', name: 'GPT-5.5' },
      { id: 'gpt-5.4', name: 'GPT-5.4' },
      { id: 'gpt-5.4-pro', name: 'GPT-5.4 Pro', note: 'Responses API' },
      { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini' },
      { id: 'gpt-5.4-nano', name: 'GPT-5.4 nano' },
      { id: 'gpt-5.2', name: 'GPT-5.2' },
      { id: 'gpt-5.2-chat-latest', name: 'GPT-5.2 Chat latest' },
      { id: 'gpt-5.1', name: 'GPT-5.1' },
      { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex' },
      { id: 'gpt-5', name: 'GPT-5' },
      { id: 'gpt-5-mini', name: 'GPT-5 mini' },
      { id: 'gpt-5-nano', name: 'GPT-5 nano' },
      { id: 'gpt-4.1', name: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini' },
      { id: 'gpt-4.1-nano', name: 'GPT-4.1 nano' },
      { id: 'o3', name: 'OpenAI o3' },
      { id: 'o3-pro', name: 'OpenAI o3-pro' },
      { id: 'o4-mini', name: 'OpenAI o4-mini' },
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
      { id: 'chatgpt-4o-latest', name: 'ChatGPT-4o latest' },
      { id: 'gpt-4', name: 'GPT-4' }
    ]
  },
  {
    id: 'anthropic',
    name: 'AICodeMirror Claude',
    model: 'claude-opus-4-7',
    baseUrlLabel: 'ANTHROPIC_BASE_URL',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    modelEnv: 'ANTHROPIC_MODEL',
    models: [
      { id: '', name: '读取 ANTHROPIC_MODEL' },
      { id: 'claude-opus-4-7', name: 'Claude Opus 4.7' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 alias' },
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
      { id: 'claude-opus-4-1-20250805', name: 'Claude Opus 4.1' },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude Sonnet 3.7' },
      { id: 'claude-3-7-sonnet-latest', name: 'Claude Sonnet 3.7 latest' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude Sonnet 3.5 v2' },
      { id: 'claude-3-5-sonnet-latest', name: 'Claude Sonnet 3.5 latest' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude Haiku 3.5' },
      { id: 'claude-3-5-haiku-latest', name: 'Claude Haiku 3.5 latest' },
      { id: 'claude-3-haiku-20240307', name: 'Claude Haiku 3' }
    ]
  },
  {
    id: 'gemini',
    name: 'AICodeMirror Gemini',
    model: 'gemini-3.1-pro-preview',
    baseUrlLabel: 'GEMINI_BASE_URL',
    apiKeyEnv: 'GEMINI_API_KEY',
    modelEnv: 'GEMINI_MODEL',
    models: [
      { id: '', name: '读取 GEMINI_MODEL' },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' },
      { id: 'gemini-3.1-pro-preview-customtools', name: 'Gemini 3.1 Pro Preview custom tools' },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
      { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite Preview' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite' }
    ]
  }
];

export const DEFAULT_AI_CONFIG: AiConfig = {
  providerId: 'openai',
  providerName: 'AICodeMirror OpenAI',
  kind: 'openai',
  model: 'gpt-5.5',
  temperature: 0.4
};

export function getProviderPreset(id: string) {
  return AI_PROVIDER_PRESETS.find((preset) => preset.id === id);
}

export function getProviderModels(id: string) {
  return getProviderPreset(id)?.models ?? AI_PROVIDER_PRESETS[0].models;
}

export function applyProviderPreset(config: AiConfig, presetId: string): AiConfig {
  const preset = getProviderPreset(presetId);
  if (!preset) return config;

  return {
    ...config,
    providerId: preset.id,
    providerName: preset.name,
    kind: preset.id,
    model: preset.model
  };
}

export function loadAiConfig(): AiConfig {
  try {
    const saved = sessionStorage.getItem(SESSION_CONFIG_KEY);
    if (!saved) return normalizeAiConfig(DEFAULT_AI_CONFIG);

    return normalizeAiConfig({
      ...DEFAULT_AI_CONFIG,
      ...JSON.parse(saved)
    });
  } catch {
    return DEFAULT_AI_CONFIG;
  }
}

export function saveAiConfig(config: AiConfig) {
  sessionStorage.setItem(SESSION_CONFIG_KEY, JSON.stringify(normalizeAiConfig(config)));
}

export async function askAI(config: AiConfig, prompt: string, context?: string): Promise<string> {
  return generateText(config, { prompt, context, mode: 'chat' });
}

export async function modifyTextWithAI(
  config: AiConfig,
  text: string,
  instruction: string
): Promise<string> {
  return generateText(config, {
    prompt: instruction,
    context: text,
    mode: 'rewrite'
  });
}

export async function testAiModel(config: AiConfig): Promise<AiModelTestResult> {
  const normalized = normalizeAiConfig(config);
  return withTimeout(invoke<AiModelTestResult>('test_ai_model', {
    request: {
      kind: normalized.kind,
      model: normalized.model,
      temperature: 0,
      prompt: 'Reply with only the exact model identifier you are serving, if available.',
      context: null,
      mode: 'model_test'
    }
  }), 65_000);
}

async function generateText(config: AiConfig, options: GenerateOptions): Promise<string> {
  const normalized = normalizeAiConfig(config);
  validateAiConfig(normalized);

  const result = await withTimeout(invoke<TauriAiGenerateResult>('generate_ai_text', {
    request: {
      kind: normalized.kind,
      model: normalized.model,
      temperature: normalized.temperature,
      prompt: options.prompt,
      context: options.context ?? null,
      mode: options.mode ?? 'chat'
    }
  }), 65_000);

  return result.text.trim();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('AI 请求超时，请检查本机环境变量、网络或模型名称。'));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timer));
  });
}

function normalizeAiConfig(config: AiConfig): AiConfig {
  const preset = getProviderPreset(config.providerId) ?? AI_PROVIDER_PRESETS[0];
  return {
    ...config,
    providerId: preset.id,
    providerName: preset.name,
    kind: preset.id,
    model: config.model.trim(),
    temperature: Number.isFinite(config.temperature) ? config.temperature : DEFAULT_AI_CONFIG.temperature
  };
}

function validateAiConfig(_config: AiConfig) {}
