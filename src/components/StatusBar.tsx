import { useStore } from '../store';

export function StatusBar() {
  const { activeFileContent, locale, saveState, saveMessage, activeFile } = useStore();

  const words = activeFileContent.trim().split(/\s+/).filter(w => w.length > 0).length;
  const lines = activeFileContent.split('\n').length || 1;
  const saveLabel = activeFile?.readOnly ? (locale === 'zh' ? '只读' : 'Read only') : {
    idle: locale === 'zh' ? '空闲' : 'Idle',
    dirty: locale === 'zh' ? '未保存' : 'Unsaved',
    saving: locale === 'zh' ? '保存中' : 'Saving',
    saved: locale === 'zh' ? '已保存' : 'Saved',
    error: locale === 'zh' ? '保存失败' : 'Save failed',
  }[saveState];

  return (
    <footer className="h-7 bg-bg-panel border-t border-border-subtle flex items-center px-4 justify-between text-[11px] text-text-tertiary select-none shrink-0">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-1.5">
          <span className={`w-2 h-2 rounded-full ${saveState === 'error' ? 'bg-red-500' : saveState === 'dirty' ? 'bg-amber-500' : activeFile?.readOnly ? 'bg-text-tertiary' : 'bg-[#28C840]'}`}></span>
          <span title={saveMessage || undefined}>{saveLabel}</span>
        </div>
        <div className="w-px h-3 bg-border-subtle"></div>
        <span className="max-w-[240px] truncate">
          {activeFile?.path || activeFile?.name || (locale === 'zh' ? '未打开文件' : 'No file open')}
        </span>
        <span>{locale === 'zh' ? '字数' : 'Words'}: {words}</span>
        <span>{locale === 'zh' ? '行数' : 'Lines'}: {lines}</span>
      </div>
      <div className="flex items-center space-x-4">
        <span className="hover:text-text-primary cursor-pointer">UTF-8</span>
        <span className="hover:text-text-primary cursor-pointer">{activeFile?.language || (activeFile?.isMarkdown ? 'Markdown' : 'Text')}</span>
        <span className="hover:text-text-primary cursor-pointer">{locale === 'zh' ? 'Chinese (ZH)' : 'English (US)'}</span>
      </div>
    </footer>
  );
}
