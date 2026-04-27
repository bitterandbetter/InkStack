import { AlertTriangle } from 'lucide-react';
import { useStore } from '../store';

export function UnsavedChangesDialog() {
  const { locale, unsavedChangePrompt, resolveUnsavedChangeChoice } = useStore();

  if (!unsavedChangePrompt) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 px-4">
      <div className="w-[28rem] max-w-full rounded-lg border border-border-subtle bg-bg-base shadow-2xl">
        <div className="flex gap-3 border-b border-border-subtle px-4 py-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-text-primary">{unsavedChangePrompt.title}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
              {unsavedChangePrompt.message}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 px-4 py-3">
          <button
            onClick={() => resolveUnsavedChangeChoice('cancel')}
            className="rounded-md border border-border-subtle bg-bg-panel px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            {locale === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button
            onClick={() => resolveUnsavedChangeChoice('discard')}
            className="rounded-md border border-border-subtle bg-bg-base px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            {locale === 'zh' ? '放弃更改' : 'Discard'}
          </button>
          <button
            onClick={() => resolveUnsavedChangeChoice('save')}
            className="rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent/90"
          >
            {locale === 'zh' ? '保存后继续' : 'Save and Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
