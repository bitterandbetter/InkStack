export type EditorAiPromptKey = 'rewrite' | 'polish' | 'expand' | 'translate' | 'ask' | 'summarize';

export type EditorAiPrompts = Record<EditorAiPromptKey, string>;

const PROMPT_STORAGE_KEY = 'inkstack.editor.ai.prompts.v1';

export const DEFAULT_EDITOR_AI_PROMPTS: EditorAiPrompts = {
  rewrite: 'Rewrite the selected Markdown to be clearer and more structured. Preserve Markdown semantics and output only the rewritten selection.',
  polish: 'Polish the selected Markdown for fluency, tone, and readability. Preserve the original meaning and Markdown semantics. Output only the polished selection.',
  expand: 'Expand the selected Markdown with useful detail, examples, or missing context. Preserve the existing intent and Markdown semantics. Output only the expanded selection.',
  translate: 'Translate the selected Markdown between Chinese and English based on the source language. Preserve Markdown structure, code blocks, links, and terminology. Output only the translated selection.',
  ask: 'Explain the selected Markdown and point out anything important, unclear, or worth improving. Answer concisely.',
  summarize: 'Summarize the selected Markdown into a concise, structured note. Preserve key facts, decisions, and action items.'
};

export function loadEditorAiPrompts(): EditorAiPrompts {
  try {
    const saved = localStorage.getItem(PROMPT_STORAGE_KEY);
    if (!saved) return DEFAULT_EDITOR_AI_PROMPTS;

    return {
      ...DEFAULT_EDITOR_AI_PROMPTS,
      ...JSON.parse(saved)
    };
  } catch {
    return DEFAULT_EDITOR_AI_PROMPTS;
  }
}

export function saveEditorAiPrompts(prompts: EditorAiPrompts) {
  localStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify(prompts));
}
