import { ShieldCheck, X } from 'lucide-react';
import { useStore } from '../store';

export function AiContextDialog() {
  const { aiContextPrompt, locale, resolveAiContextChoice } = useStore();

  if (!aiContextPrompt) return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/35 px-4">
      <div className="w-[34rem] max-w-full overflow-hidden rounded-lg border border-border-subtle bg-bg-base shadow-2xl">
        <div className="flex gap-3 border-b border-border-subtle px-4 py-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
            <ShieldCheck size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-text-primary">{aiContextPrompt.title}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
              {aiContextPrompt.message}
            </p>
          </div>
          <button
            onClick={() => resolveAiContextChoice('cancel')}
            className="ml-auto h-7 rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={15} />
          </button>
        </div>

        <div className="max-h-[22rem] overflow-y-auto px-4 py-3">
          <div className="space-y-2">
            {aiContextPrompt.items.map((item, index) => (
              <div key={`${item.label}-${index}`} className="rounded-md border border-border-subtle bg-bg-panel p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 text-[13px] font-medium text-text-primary">{item.label}</div>
                  <div className="shrink-0 text-[11px] text-text-tertiary">{item.detail}</div>
                </div>
                <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded border border-border-subtle bg-bg-base p-2 text-[11px] leading-relaxed text-text-secondary">
                  {previewContext(item.content)}
                </pre>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle px-4 py-3">
          <button
            onClick={() => resolveAiContextChoice('cancel')}
            className="rounded-md border border-border-subtle bg-bg-panel px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            {locale === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button
            onClick={() => resolveAiContextChoice('confirm')}
            className="rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent/90"
          >
            {locale === 'zh' ? '确认发送' : 'Send to AI'}
          </button>
        </div>
      </div>
    </div>
  );
}

function previewContext(content: string) {
  const trimmed = content.trim();
  if (trimmed.length <= 900) return trimmed || '(empty)';
  return `${trimmed.slice(0, 900)}\n...`;
}
