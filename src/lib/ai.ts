import type { UnlistenFn } from '@tauri-apps/api/event';
import { invoke, listen } from './tauriRuntime';

export type AiProviderKind = 'openai' | 'anthropic' | 'gemini' | 'nvidia';

export interface AiProviderPreset {
  id: AiProviderKind;
  name: string;
  model: string;
  baseUrlLabel?: string;
  fixedBaseUrl?: string;
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
  signal?: AbortSignal;
};

type TauriAiGenerateResult = {
  text: string;
};

type AiStreamPayload = {
  requestId: string;
  provider?: string;
  model?: string | null;
  text?: string;
  error?: string;
};

type StreamOptions = GenerateOptions & {
  onStart?: () => void;
  onDelta: (delta: string, fullText: string) => void;
  onEnd?: (fullText: string) => void;
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
    fixedBaseUrl: 'https://api.aicodemirror.com/api/gemini',
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
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    model: 'meta/llama-3.1-8b-instruct',
    baseUrlLabel: 'NVIDIA_BASE_URL',
    apiKeyEnv: 'NVIDIA_API_KEY',
    modelEnv: 'NVIDIA_MODEL',
    models: [
      { id: '', name: '读取 NVIDIA_MODEL' },
      { id: 'meta/llama-3.1-8b-instruct', name: 'Meta Llama 3.1 8B Instruct', note: '已验证可用' },
      { id: 'nvidia/llama-3.1-nemotron-ultra-253b-v1', name: 'Llama 3.1 Nemotron Ultra 253B' },
      { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Llama 3.1 Nemotron 70B Instruct' },
      { id: 'nvidia/llama-3.1-nemotron-51b-instruct', name: 'Llama 3.1 Nemotron 51B Instruct' },
      { id: 'nvidia/llama-3.1-nemotron-nano-8b-v1', name: 'Llama 3.1 Nemotron Nano 8B' },
      { id: 'meta/llama-3.1-405b-instruct', name: 'Meta Llama 3.1 405B Instruct' },
      { id: 'meta/llama-3.1-70b-instruct', name: 'Meta Llama 3.1 70B Instruct' },
      { id: 'openai/gpt-oss-120b', name: 'OpenAI GPT-OSS 120B' },
      { id: 'z-ai/glm-5.1', name: 'Z.ai GLM-5.1' },
      { id: 'moonshotai/kimi-k2.5', name: 'MoonshotAI Kimi K2.5' },
      { id: 'qwen/qwen3-next-80b-a3b-instruct', name: 'Qwen3 Next 80B A3B Instruct' },
      { id: 'deepseek-ai/deepseek-r1', name: 'DeepSeek R1' }
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

export async function askAI(config: AiConfig, prompt: string, context?: string, signal?: AbortSignal): Promise<string> {
  return generateText(config, { prompt, context, mode: 'chat', signal });
}

export async function streamAI(
  config: AiConfig,
  prompt: string,
  context: string | undefined,
  onDelta: (delta: string, fullText: string) => void,
  signal?: AbortSignal
): Promise<string> {
  return generateTextStream(config, { prompt, context, mode: 'chat', signal, onDelta });
}

export async function modifyTextWithAI(
  config: AiConfig,
  text: string,
  instruction: string,
  signal?: AbortSignal
): Promise<string> {
  return generateText(config, {
    prompt: instruction,
    context: text,
    mode: 'rewrite',
    signal
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
  throwIfAborted(options.signal);

  const result = await withTimeout(invoke<TauriAiGenerateResult>('generate_ai_text', {
    request: {
      kind: normalized.kind,
      model: normalized.model,
      temperature: normalized.temperature,
      prompt: options.prompt,
      context: options.context ?? null,
      mode: options.mode ?? 'chat'
    }
  }), 65_000, options.signal);

  throwIfAborted(options.signal);
  return result.text.trim();
}

async function generateTextStream(config: AiConfig, options: StreamOptions): Promise<string> {
  const normalized = normalizeAiConfig(config);
  validateAiConfig(normalized);
  throwIfAborted(options.signal);

  const requestId = `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const unlisteners: UnlistenFn[] = [];
  let fullText = '';
  let settled = false;
  let timer: number | undefined;
  let abortHandler: (() => void) | null = null;

  const cleanup = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    for (const unlisten of unlisteners) unlisten();
    if (abortHandler) options.signal?.removeEventListener('abort', abortHandler);
  };

  const cancelBackend = () => {
    void invoke('cancel_ai_stream', { requestId }).catch(() => undefined);
  };

  const promise = new Promise<string>((resolve, reject) => {
    const finish = (result: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result.trim());
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const resetTimeout = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        cancelBackend();
        fail(new Error('AI stream timed out. Check local environment variables, network, or model name.'));
      }, 130_000);
    };

    void (async () => {
      try {
        unlisteners.push(
          await listen<AiStreamPayload>('inkstack://ai-stream-start', (event) => {
            if (event.payload.requestId !== requestId || settled) return;
            options.onStart?.();
            resetTimeout();
          }),
          await listen<AiStreamPayload>('inkstack://ai-stream-delta', (event) => {
            if (event.payload.requestId !== requestId || settled) return;
            const delta = event.payload.text ?? '';
            if (!delta) return;
            fullText += delta;
            options.onDelta(delta, fullText);
            resetTimeout();
          }),
          await listen<AiStreamPayload>('inkstack://ai-stream-end', (event) => {
            if (event.payload.requestId !== requestId || settled) return;
            options.onEnd?.(fullText);
            finish(fullText);
          }),
          await listen<AiStreamPayload>('inkstack://ai-stream-error', (event) => {
            if (event.payload.requestId !== requestId || settled) return;
            fail(new Error(event.payload.error || 'AI stream failed.'));
          })
        );

        abortHandler = () => {
          cancelBackend();
          fail(abortError());
        };
        options.signal?.addEventListener('abort', abortHandler, { once: true });
        if (options.signal?.aborted) {
          abortHandler();
          return;
        }
        resetTimeout();

        await invoke('generate_ai_text_stream', {
          requestId,
          request: {
            kind: normalized.kind,
            model: normalized.model,
            temperature: normalized.temperature,
            prompt: options.prompt,
            context: options.context ?? null,
            mode: options.mode ?? 'chat'
          }
        });
      } catch (error) {
        fail(error);
      }
    })();
  });

  if (options.signal?.aborted) {
    cancelBackend();
    throw abortError();
  }

  return promise;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const timer = window.setTimeout(() => {
      reject(new Error('AI request timed out. Check local environment variables, network, or model name.'));
    }, timeoutMs);
    const abort = () => {
      window.clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', abort, { once: true });

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        window.clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      });
  });
}

export function isAiAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function sanitizeAiError(error: unknown, locale: 'zh' | 'en' = 'zh') {
  if (isAiAbortError(error)) {
    return locale === 'zh' ? '已取消 AI 请求。' : 'AI request cancelled.';
  }

  const raw = error instanceof Error ? error.message : String(error ?? '');
  const withoutKeys = raw
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer ***')
    .replace(/(api[_-]?key["'\s:=]+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1***')
    .replace(/(x-api-key:\s*)[A-Za-z0-9._~+/=-]{8,}/gi, '$1***')
    .replace(/(x-goog-api-key:\s*)[A-Za-z0-9._~+/=-]{8,}/gi, '$1***');

  const compact = withoutKeys.trim() || (locale === 'zh' ? 'AI 请求失败。' : 'AI request failed.');
  return compact.length > 700 ? `${compact.slice(0, 700)}...` : compact;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function abortError() {
  return new DOMException('AI request cancelled', 'AbortError');
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
