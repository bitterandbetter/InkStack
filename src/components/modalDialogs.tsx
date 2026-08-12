import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

type InputDialogState = {
  title: string;
  message?: string;
  initialValue?: string;
  submitLabel?: string;
  locale: 'zh' | 'en';
  resolve: (value: string | null) => void;
};

type ConfirmDialogState = {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  locale: 'zh' | 'en';
  resolve: (confirmed: boolean) => void;
};

export function useModalDialogs(locale: 'zh' | 'en') {
  const [inputState, setInputState] = useState<InputDialogState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null);

  const prompt = (title: string, initialValue = '', message?: string) =>
    new Promise<string | null>((resolve) => {
      setInputState({ title, message, initialValue, locale, resolve });
    });

  const confirmDialog = (title: string, message = '', danger = false, confirmLabel?: string) =>
    new Promise<boolean>((resolve) => {
      setConfirmState({ title, message, danger, confirmLabel, locale, resolve });
    });

  const dialogElement = (
    <>
      {inputState && (
        <InputDialog
          state={inputState}
          onClose={(value) => {
            setInputState(null);
            inputState.resolve(value);
          }}
        />
      )}
      {confirmState && (
        <ConfirmDialog
          state={confirmState}
          onClose={(confirmed) => {
            setConfirmState(null);
            confirmState.resolve(confirmed);
          }}
        />
      )}
    </>
  );

  return { prompt, confirmDialog, dialogElement };
}

function InputDialog({
  state,
  onClose
}: {
  state: InputDialogState;
  onClose: (value: string | null) => void;
}) {
  const [value, setValue] = useState(state.initialValue ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelLabel = state.locale === 'zh' ? '取消' : 'Cancel';
  const submitLabel = state.submitLabel ?? (state.locale === 'zh' ? '确定' : 'OK');

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => onClose(value.trim());

  return (
    <ModalScrim onClose={() => onClose(null)}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="px-5 py-4">
          <h2 className="text-[15px] font-semibold text-text-primary">{state.title}</h2>
          {state.message && (
            <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">{state.message}</p>
          )}
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="mt-3 w-full rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-[13px] text-text-primary focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-border-subtle px-5 py-3">
          <button
            type="button"
            onClick={() => onClose(null)}
            className="rounded-md border border-border-subtle bg-bg-panel px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            disabled={!value.trim()}
            className="rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent/90 disabled:opacity-40"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </ModalScrim>
  );
}

function ConfirmDialog({
  state,
  onClose
}: {
  state: ConfirmDialogState;
  onClose: (confirmed: boolean) => void;
}) {
  const cancelLabel = state.locale === 'zh' ? '取消' : 'Cancel';
  const confirmLabel = state.confirmLabel ?? (state.locale === 'zh' ? '确定' : 'OK');

  return (
    <ModalScrim onClose={() => onClose(false)}>
      <div className="w-[28rem] max-w-full rounded-lg border border-border-subtle bg-bg-base shadow-2xl">
        <div className="flex gap-3 px-5 py-4">
          <span
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
              state.danger ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-500"
            )}
          >
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-text-primary">{state.title}</h2>
            {state.message && (
              <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">{state.message}</p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border-subtle px-5 py-3">
          <button
            onClick={() => onClose(false)}
            className="rounded-md border border-border-subtle bg-bg-panel px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => onClose(true)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[13px] font-medium text-white",
              state.danger ? "bg-red-500 hover:bg-red-600" : "bg-accent hover:bg-accent/90"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalScrim>
  );
}

function ModalScrim({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/35 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-[26rem] max-w-full rounded-lg border border-border-subtle bg-bg-base shadow-2xl">
        {children}
      </div>
    </div>
  );
}
