import { ChevronLeft, ChevronRight, FileCode2, FileText, X } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useStore, type DocumentTab } from '../store';
import { saveActiveFile } from '../lib/desktopActions';
import { cn } from '../lib/utils';

export function DocumentTabs() {
  const {
    documentTabs,
    activeTabId,
    locale,
    switchDocumentTab,
    closeDocumentTab,
    requestUnsavedChangeChoice,
    canGoBack,
    canGoForward,
    goBack,
    goForward
  } = useStore();

  if (!Array.isArray(documentTabs) || documentTabs.length === 0) return null;

  const handleClose = async (tab: DocumentTab, event: MouseEvent) => {
    event.stopPropagation();

    if (tab.isDirty) {
      const choice = await requestUnsavedChangeChoice(
        locale === 'zh' ? '关闭未保存标签页' : 'Close Unsaved Tab',
        locale === 'zh'
          ? `“${tab.file.name}”还有未保存的修改。关闭前要保存吗？`
          : `"${tab.file.name}" has unsaved changes. Save before closing?`
      );
      if (choice === 'cancel') return;
      if (choice === 'save') {
        switchDocumentTab(tab.id);
        const saved = await saveActiveFile();
        if (!saved || useStore.getState().isDirty) return;
      }
    }

    closeDocumentTab(tab.id);
  };

  return (
    <div className="flex h-9 shrink-0 items-center border-b border-border-subtle bg-bg-panel/80 text-[12px] text-text-secondary">
      <div className="flex h-full items-center border-r border-border-subtle px-1">
        <button
          onClick={goBack}
          disabled={!canGoBack}
          className="flex h-6 w-6 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-35"
          title={locale === 'zh' ? '后退' : 'Back'}
        >
          <ChevronLeft size={14} />
        </button>
        <button
          onClick={goForward}
          disabled={!canGoForward}
          className="flex h-6 w-6 items-center justify-center rounded text-text-tertiary hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-35"
          title={locale === 'zh' ? '前进' : 'Forward'}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="flex min-w-0 flex-1 overflow-x-auto">
        {documentTabs.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              onClick={() => switchDocumentTab(tab.id)}
              className={cn(
                'group flex h-9 max-w-56 shrink-0 items-center gap-2 border-r border-border-subtle px-3 transition-colors',
                active ? 'bg-bg-base text-text-primary' : 'bg-bg-panel/40 text-text-secondary hover:bg-bg-hover hover:text-text-primary'
              )}
              title={tab.file.isUntitled ? tab.file.name : (tab.file.path || tab.file.name)}
            >
              {tab.file.isMarkdown ? <FileText size={13} className="shrink-0" /> : <FileCode2 size={13} className="shrink-0" />}
              <span className="min-w-0 truncate">{tab.file.name}</span>
              {tab.isDirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />}
              <span
                role="button"
                tabIndex={-1}
                onClick={(event) => void handleClose(tab, event)}
                className="ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded text-text-tertiary opacity-60 hover:bg-bg-hover hover:text-text-primary group-hover:opacity-100"
                title={locale === 'zh' ? '关闭标签页' : 'Close tab'}
              >
                <X size={11} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
