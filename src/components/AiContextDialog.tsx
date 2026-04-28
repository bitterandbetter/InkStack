import { RotateCcw, ShieldCheck, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useStore, type AiContextItem } from '../store';
import { contextDetail, estimateTokens } from '../lib/aiContext';

export function AiContextDialog() {
  const { aiContextPrompt, locale, resolveAiContextChoice } = useStore();
  const [draftItems, setDraftItems] = useState<AiContextItem[]>([]);

  useEffect(() => {
    setDraftItems(aiContextPrompt?.items ?? []);
  }, [aiContextPrompt]);

  if (!aiContextPrompt) return null;

  const totalStats = contextStatsForItems(draftItems);
  const budgetWarning = totalStats.tokens > 12_000
    ? (locale === 'zh'
      ? '上下文较大，可能导致响应变慢或超过当前模型限制。'
      : 'This context is large and may slow down or exceed the selected model limit.')
    : '';
  const resetItems = () => setDraftItems(aiContextPrompt.items);
  const updateItemContent = (index: number, content: string) => {
    setDraftItems((items) => items.map((item, itemIndex) => (
      itemIndex === index
        ? { ...item, content, detail: contextDetail(content) }
        : item
    )));
  };
  const removeItem = (index: number) => {
    setDraftItems((items) => items.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/35 px-4">
      <div className="w-[42rem] max-w-full overflow-hidden rounded-lg border border-border-subtle bg-bg-base shadow-2xl">
        <div className="flex gap-3 border-b border-border-subtle px-4 py-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
            <ShieldCheck size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-text-primary">{aiContextPrompt.title}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
              {aiContextPrompt.message}
            </p>
            <p className="mt-2 text-[11px] text-text-tertiary">
              {locale === 'zh'
                ? `可编辑本次发送内容，不会修改原文档或默认提示词。${totalStats.label}`
                : `Edit this request only. Documents and default prompts will not change. ${totalStats.label}`}
            </p>
            {budgetWarning && (
              <p className="mt-1 rounded bg-yellow-500/10 px-2 py-1 text-[11px] text-yellow-700 dark:text-yellow-300">
                {budgetWarning}
              </p>
            )}
          </div>
          <button
            onClick={() => resolveAiContextChoice('cancel', draftItems)}
            className="ml-auto h-7 rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={15} />
          </button>
        </div>

        <div className="max-h-[28rem] overflow-y-auto px-4 py-3">
          <div className="space-y-2">
            {draftItems.length === 0 && (
              <div className="rounded-md border border-dashed border-border-subtle bg-bg-panel p-4 text-center text-[13px] text-text-tertiary">
                {locale === 'zh' ? '没有要发送的上下文。' : 'No context will be sent.'}
              </div>
            )}
            {draftItems.map((item, index) => (
              <div key={`${item.label}-${index}`} className="rounded-md border border-border-subtle bg-bg-panel p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 text-[13px] font-medium text-text-primary">{item.label}</div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-[11px] text-text-tertiary">{contextDetail(item.content)}</div>
                    {item.removable !== false && (
                      <button
                        onClick={() => removeItem(index)}
                        className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-red-500"
                        title={locale === 'zh' ? '移除此上下文' : 'Remove this context'}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
                {item.editable === false ? (
                  <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded border border-border-subtle bg-bg-base p-2 text-[11px] leading-relaxed text-text-secondary">
                    {item.content.trim() || '(empty)'}
                  </pre>
                ) : (
                  <textarea
                    value={item.content}
                    onChange={(event) => updateItemContent(index, event.target.value)}
                    rows={item.content.length > 1200 ? 8 : 4}
                    className="mt-2 w-full resize-y rounded border border-border-subtle bg-bg-base p-2 text-[11px] leading-relaxed text-text-primary outline-none focus:border-accent"
                    spellCheck={false}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle px-4 py-3">
          <button
            onClick={resetItems}
            className="flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg-panel px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            <RotateCcw size={13} />
            {locale === 'zh' ? '恢复原始内容' : 'Reset'}
          </button>
          <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={() => resolveAiContextChoice('cancel', draftItems)}
            className="rounded-md border border-border-subtle bg-bg-panel px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            {locale === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button
            onClick={() => resolveAiContextChoice('confirm', draftItems)}
            disabled={draftItems.length === 0 || draftItems.every((item) => !item.content.trim())}
            className="rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent/90"
          >
            {locale === 'zh' ? '确认发送' : 'Send to AI'}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function contextStatsForItems(items: AiContextItem[]) {
  const chars = items.reduce((total, item) => total + item.content.length, 0);
  const tokens = items.reduce((total, item) => total + estimateTokens(item.content), 0);
  return {
    chars,
    tokens,
    label: `${items.length} item${items.length === 1 ? '' : 's'} · ${chars} chars · ~${tokens} tokens`
  };
}
