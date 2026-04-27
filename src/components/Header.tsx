import { FilePlus2, FileText, FolderOpen, Save, Languages, Moon, Sun, PanelLeft, Sparkles, LayoutList, BookOpen, PenLine, Search } from 'lucide-react';
import { useStore } from '../store';
import { openDirectory, openMarkdownFileDialog } from '../lib/fs';
import { cn } from '../lib/utils';
import { useCallback, useEffect } from 'react';
import { createUntitledMarkdownFile, openTextPath, openWorkspacePath, saveActiveFile } from '../lib/desktopActions';

export function Header() {
  const { 
    locale, setLocale, toggleSidebar, toggleAiPanel, toggleDarkMode, isDarkMode, openCommandPalette,
    activeFile, isDirty,
    viewMode, setViewMode
  } = useStore();

  const handleOpenFolder = useCallback(async () => {
    const path = await openDirectory();
    if (path) await openWorkspacePath(path);
  }, []);

  const handleOpenFile = useCallback(async () => {
    const path = await openMarkdownFileDialog();
    if (!path) return;

    try {
      await openTextPath(path);
    } catch (err) {
      console.error("Open file failed", err);
    }
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  return (
    <header className="h-11 border-b border-border-subtle bg-bg-panel flex items-center justify-between px-4 shrink-0 transition-colors select-none text-text-secondary text-xs font-medium">
      <div className="flex items-center gap-1">
        <button onClick={toggleSidebar} className="p-1 hover:bg-bg-hover rounded text-text-secondary" title="Toggle Sidebar">
          <PanelLeft size={16} />
        </button>
        
        <div className="h-4 w-px bg-border-subtle mx-2" />

        <button onClick={createUntitledMarkdownFile} className="flex items-center gap-1.5 px-2 py-1 hover:bg-bg-hover rounded text-text-secondary text-xs">
          <FilePlus2 size={14} />
          {locale === 'zh' ? '新建' : 'New'}
        </button>
        
        <button onClick={handleOpenFolder} className="flex items-center gap-1.5 px-2 py-1 hover:bg-bg-hover rounded text-text-secondary text-xs">
          <FolderOpen size={14} />
          {locale === 'zh' ? '打开本地目录' : 'Open Folder'}
        </button>
        <button onClick={handleOpenFile} className="flex items-center gap-1.5 px-2 py-1 hover:bg-bg-hover rounded text-text-secondary text-xs">
          <FileText size={14} />
          {locale === 'zh' ? '打开文件' : 'Open File'}
        </button>

        <button 
          onClick={saveActiveFile} 
          disabled={!isDirty || !activeFile || activeFile.readOnly || !activeFile.isMarkdown}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded transition-colors ml-1",
            isDirty && activeFile && !activeFile.readOnly && activeFile.isMarkdown
              ? "text-accent bg-accent/10 hover:bg-accent/20" 
              : "text-text-tertiary bg-transparent"
          )}
        >
          <Save size={14} />
          {locale === 'zh' ? '保存' : 'Save'} {isDirty && '*'}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex bg-bg-active rounded p-[2px] items-center text-text-secondary shadow-inner">
          <button 
            onClick={() => setViewMode('edit')} 
            className={cn("w-6 h-6 flex items-center justify-center rounded-[4px] transition-all", viewMode === 'edit' ? "bg-bg-base text-text-primary shadow-sm border border-border-subtle" : "hover:text-text-primary hover:bg-bg-hover border border-transparent")}
            title="Edit Mode"
          ><PenLine size={13}/></button>
          <button 
            onClick={() => setViewMode('split')}
            className={cn("w-6 h-6 flex items-center justify-center rounded-[4px] transition-all", viewMode === 'split' ? "bg-bg-base text-text-primary shadow-sm border border-border-subtle" : "hover:text-text-primary hover:bg-bg-hover border border-transparent")}
            title="Split Mode"
          ><LayoutList size={13}/></button>
          <button 
            onClick={() => setViewMode('read')}
            className={cn("w-6 h-6 flex items-center justify-center rounded-[4px] transition-all", viewMode === 'read' ? "bg-bg-base text-text-primary shadow-sm border border-border-subtle" : "hover:text-text-primary hover:bg-bg-hover border border-transparent")}
            title="Read Mode"
          ><BookOpen size={13}/></button>
        </div>

        <div className="h-4 w-px bg-border-subtle mx-2" />

        <button onClick={toggleAiPanel} className="p-1 hover:bg-bg-hover rounded text-accent" title="AI Assistant">
          <Sparkles size={16} />
        </button>
        <button onClick={openCommandPalette} className="p-1 hover:bg-bg-hover rounded text-text-secondary" title="Command Palette">
          <Search size={16} />
        </button>
        <button onClick={toggleDarkMode} className="p-1 hover:bg-bg-hover rounded text-text-secondary" title="Toggle Theme">
          {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')} className="p-1 hover:bg-bg-hover rounded text-text-secondary flex items-center gap-1 text-[11px]" title="Switch Language">
          <Languages size={16} />
          {locale === 'zh' ? 'EN' : 'ZH'}
        </button>
      </div>
    </header>
  );
}
