import { AlertTriangle, FileDown, RefreshCw, X } from 'lucide-react';
import { reloadActiveFileFromDisk, saveActiveFileAs } from '../lib/desktopActions';
import { useStore } from '../store';

export function SaveConflictDialog() {
  const { locale, saveConflict, closeSaveConflict } = useStore();

  if (!saveConflict) return null;

  const handleReload = async () => {
    await reloadActiveFileFromDisk();
  };

  const handleSaveAs = async () => {
    const saved = await saveActiveFileAs();
    if (saved) closeSaveConflict();
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/35 px-4">
      <div className="w-[30rem] max-w-full overflow-hidden rounded-lg border border-border-subtle bg-bg-base shadow-2xl">
        <div className="flex gap-3 border-b border-border-subtle px-4 py-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-500/10 text-red-500">
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-text-primary">
              {locale === 'zh' ? '文件已在外部修改' : 'File Changed on Disk'}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
              {locale === 'zh'
                ? `“${saveConflict.fileName}”在其他应用中发生了变化。为避免覆盖外部修改，InkStack 已阻止本次保存。`
                : `"${saveConflict.fileName}" changed in another app. InkStack blocked this save to avoid overwriting those edits.`}
            </p>
            <p className="mt-2 truncate text-[11px] text-text-tertiary" title={saveConflict.path}>
              {saveConflict.path}
            </p>
          </div>
        </div>

        <div className="space-y-2 px-4 py-3">
          <button
            onClick={() => void handleReload()}
            className="flex w-full items-center gap-3 rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-left text-[13px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            <RefreshCw size={15} className="text-accent" />
            <span>
              <span className="block font-medium text-text-primary">{locale === 'zh' ? '重新加载磁盘版本' : 'Reload Disk Version'}</span>
              <span className="block text-[11px] text-text-tertiary">
                {locale === 'zh' ? '放弃当前未保存内容，载入外部修改后的文件。' : 'Discard local unsaved edits and load the changed file.'}
              </span>
            </span>
          </button>

          <button
            onClick={() => void handleSaveAs()}
            className="flex w-full items-center gap-3 rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-left text-[13px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            <FileDown size={15} className="text-accent" />
            <span>
              <span className="block font-medium text-text-primary">{locale === 'zh' ? '另存为副本' : 'Save a Copy'}</span>
              <span className="block text-[11px] text-text-tertiary">
                {locale === 'zh' ? '保留当前编辑，把内容保存到新文件。' : 'Keep your current edits by saving them to a new file.'}
              </span>
            </span>
          </button>
        </div>

        <div className="flex justify-end border-t border-border-subtle px-4 py-3">
          <button
            onClick={closeSaveConflict}
            className="flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg-base px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={13} />
            {locale === 'zh' ? '继续编辑' : 'Keep Editing'}
          </button>
        </div>
      </div>
    </div>
  );
}
