import { AiContextItem, useStore } from '../store';

export async function confirmAiContext(
  title: string,
  message: string,
  items: AiContextItem[]
): Promise<boolean> {
  const result = await requestEditableAiContext(title, message, items);
  return result.confirmed;
}

export async function requestEditableAiContext(
  title: string,
  message: string,
  items: AiContextItem[]
): Promise<{ confirmed: boolean; items: AiContextItem[] }> {
  const result = await useStore.getState().requestAiContextChoice(title, message, items);
  return {
    confirmed: result.choice === 'confirm',
    items: result.items
  };
}

export function contextDetail(content: string) {
  const chars = content.length;
  const lines = content.split('\n').length;
  return `${lines} lines · ${chars} chars · ~${estimateTokens(content)} tokens`;
}

export function estimateTokens(content: string) {
  if (!content.trim()) return 0;
  const cjkChars = (content.match(/[\u3400-\u9fff]/g) ?? []).length;
  const asciiWords = (content.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9_]+/g) ?? []).length;
  const otherChars = Math.max(content.length - cjkChars, 0);
  return Math.max(1, Math.ceil(cjkChars * 0.75 + asciiWords * 1.3 + otherChars / 6));
}
