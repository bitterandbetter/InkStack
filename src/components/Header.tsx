import { FilePlus2, FileText, FolderOpen, Save, Languages, Moon, Sun, PanelLeft, Sparkles, LayoutList, BookOpen, PenLine, Search, SlidersHorizontal } from 'lucide-react';
import { useStore } from '../store';
import type { ReadingFont } from '../store';
import { openDirectory, openMarkdownFileDialog } from '../lib/fs';
import { cn } from '../lib/utils';
import { useCallback, useState } from 'react';
import { createUntitledMarkdownFile, openTextPath, openWorkspacePath, saveActiveFile } from '../lib/desktopActions';

export function Header() {
  const { 
    locale, setLocale, toggleSidebar, toggleAiPanel, toggleThemeMode, isDarkMode, openCommandPalette,
    activeFile, isDirty,
    viewMode, setViewMode,
    readingSettings, setReadingSettings, resetReadingSettings,
    autoSaveEnabled, setAutoSaveEnabled
  } = useStore();
  const [readingSettingsOpen, setReadingSettingsOpen] = useState(false);

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
        <button
          onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
          className={cn(
            "rounded px-2 py-1 text-xs transition-colors",
            autoSaveEnabled
              ? "bg-accent/10 text-accent hover:bg-accent/20"
              : "text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          )}
          title={locale === 'zh' ? '防抖自动保存已有 Markdown 文件' : 'Debounced autosave for existing Markdown files'}
        >
          {locale === 'zh' ? '自动保存' : 'Auto Save'}
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
        <div className="relative">
          <button
            onClick={() => setReadingSettingsOpen((open) => !open)}
            className={cn(
              "p-1 hover:bg-bg-hover rounded text-text-secondary",
              readingSettingsOpen && "bg-bg-base text-text-primary shadow-sm border border-border-subtle"
            )}
            title={locale === 'zh' ? '阅读设置' : 'Reading Settings'}
          >
            <SlidersHorizontal size={16} />
          </button>
          {readingSettingsOpen && (
            <div className="absolute right-0 top-8 z-50 w-72 rounded-md border border-border-subtle bg-bg-base p-3 text-text-secondary shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-text-primary">
                  {locale === 'zh' ? '阅读设置' : 'Reading Settings'}
                </span>
                <button
                  onClick={resetReadingSettings}
                  className="rounded px-2 py-1 text-[11px] text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
                >
                  {locale === 'zh' ? '重置' : 'Reset'}
                </button>
              </div>

              <ReadingSlider
                label={locale === 'zh' ? '内容宽度' : 'Content Width'}
                value={readingSettings.width}
                min={680}
                max={1280}
                step={20}
                suffix="px"
                onChange={(width) => setReadingSettings({ width })}
              />
              <ReadingSlider
                label={locale === 'zh' ? '字号' : 'Font Size'}
                value={readingSettings.fontSize}
                min={13}
                max={20}
                step={1}
                suffix="px"
                onChange={(fontSize) => setReadingSettings({ fontSize })}
              />
              <ReadingSlider
                label={locale === 'zh' ? '行高' : 'Line Height'}
                value={readingSettings.lineHeight}
                min={1.35}
                max={2.2}
                step={0.05}
                onChange={(lineHeight) => setReadingSettings({ lineHeight })}
              />
              <ReadingSlider
                label={locale === 'zh' ? '段间距' : 'Paragraph Gap'}
                value={readingSettings.paragraphSpacing}
                min={0.6}
                max={1.8}
                step={0.05}
                suffix="em"
                onChange={(paragraphSpacing) => setReadingSettings({ paragraphSpacing })}
              />

              <div className="mt-3 flex rounded-md bg-bg-active p-0.5">
                {(['sans', 'serif'] as ReadingFont[]).map((font) => (
                  <button
                    key={font}
                    onClick={() => setReadingSettings({ font })}
                    className={cn(
                      "flex-1 rounded px-2 py-1.5 text-[12px] transition-colors",
                      readingSettings.font === font ? "bg-bg-base text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-primary"
                    )}
                  >
                    {font === 'sans'
                      ? (locale === 'zh' ? '无衬线' : 'Sans')
                      : (locale === 'zh' ? '衬线' : 'Serif')}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-border-subtle mx-2" />

        <button onClick={toggleAiPanel} className="p-1 hover:bg-bg-hover rounded text-accent" title="AI Assistant">
          <Sparkles size={16} />
        </button>
        <button onClick={openCommandPalette} className="p-1 hover:bg-bg-hover rounded text-text-secondary" title="Command Palette">
          <Search size={16} />
        </button>
        <button onClick={toggleThemeMode} className="p-1 hover:bg-bg-hover rounded text-text-secondary" title="Toggle Theme">
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

function ReadingSlider({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="mb-2 block">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-text-tertiary">{label}</span>
        <span className="font-mono text-text-secondary">{Number(value.toFixed(2))}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--color-accent)]"
      />
    </label>
  );
}
