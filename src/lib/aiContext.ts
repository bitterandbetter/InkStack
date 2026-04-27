import { AiContextItem, useStore } from '../store';

export async function confirmAiContext(
  title: string,
  message: string,
  items: AiContextItem[]
): Promise<boolean> {
  const choice = await useStore.getState().requestAiContextChoice(title, message, items);
  return choice === 'confirm';
}

export function contextDetail(content: string) {
  const chars = content.length;
  const lines = content.split('\n').length;
  return `${lines} lines · ${chars} chars`;
}
