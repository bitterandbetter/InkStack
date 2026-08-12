import type { AiProviderKind } from '../lib/ai';

export const AI_ACTIVE_CONTEXT_CHARS = 12000;
export const AI_CONTEXT_DOCUMENT_CHARS = 8000;

export const providerKindLabels: Record<AiProviderKind, string> = {
  openai: 'OpenAI',
  'openai-compatible': 'OpenAI 兼容',
  anthropic: 'Claude',
  gemini: 'Gemini',
  nvidia: 'NVIDIA'
};

export function truncateContext(content: string, limit: number) {
  if (content.length <= limit) return content;
  return `${content.slice(0, limit)}\n\n[InkStack: context truncated]`;
}

