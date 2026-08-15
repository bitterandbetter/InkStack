import { FileCode2, FilePlus2, FileText, FolderOpen, Save, Languages, Moon, Sun, PanelLeft, Sparkles, LayoutList, BookOpen, PenLine, Search, SlidersHorizontal, Type, Folder, Link2, Settings2, Network } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { useStore } from '../store';
import { cn } from '../lib/utils';
import { useEffect, useMemo, useState } from 'react';
import { runAppCommand } from '../lib/appCommands';
import { loadSystemFontFamilies } from '../lib/systemFonts';
import { BUILT_IN_THEMES, loadImportedThemes, openImportedThemesDir, syncBuiltInThemesToThemeDir } from '../lib/themes';

export function Header() {
  const { 
    locale, setLocale, isDarkMode,
    activeFile, isDirty,
    viewMode,
    readingSettings, setReadingSettings, resetReadingSettings, editorSettings, setEditorSettings, resetEditorSettings, themeState, setThemeMode, setActiveThemeId,
    autoSaveEnabled, setAutoSaveEnabled, splitScrollSync, setSplitScrollSync, imageInsertMode, setImageInsertMode,
    wysiwygEnabled, setWysiwygEnabled
  } = useStore();
  const [readingSettingsOpen, setReadingSettingsOpen] = useState(false);
  const [settingsTarget, setSettingsTarget] = useState<'reading' | 'editor'>('reading');
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [fontMessage, setFontMessage] = useState('');
  const [themeFolderMessage, setThemeFolderMessage] = useState('');
  const currentCustomFont = readingSettings.font.startsWith('custom:') ? readingSettings.font.slice(7) : '';
  const activeBuiltInTheme = useMemo(
    () => BUILT_IN_THEMES.find((theme) => theme.id === themeState.activeThemeId),
    [themeState.activeThemeId]
  );
  const readingThemeOptions = useMemo(() => {
    const importedActive = themeState.importedThemes.find((theme) => theme.id === themeState.activeThemeId);
    if (!importedActive) return BUILT_IN_THEMES;
    return [
      ...BUILT_IN_THEMES,
      {
        ...importedActive,
        name: `${importedActive.name} · CSS`
      }
    ];
  }, [themeState.activeThemeId, themeState.importedThemes]);
  const readingThemeGroups = useMemo(() => {
    const groups = new Map<string, typeof readingThemeOptions>();
    for (const theme of readingThemeOptions) {
      const group = (locale === 'zh' ? theme.groupZh : theme.groupEn)
        || (locale === 'zh' ? '导入主题' : 'Imported');
      groups.set(group, [...(groups.get(group) || []), theme]);
    }
    return [...groups.entries()];
  }, [locale, readingThemeOptions]);

  useEffect(() => {
    if (!readingSettingsOpen) return;
    let cancelled = false;
    void loadSystemFontFamilies()
      .then((fonts) => {
        if (cancelled) return;
        setSystemFonts(fonts);
        setFontMessage('');
      })
      .catch((error) => {
        console.error('Failed to load system fonts', error);
        if (cancelled) return;
        setFontMessage(locale === 'zh' ? '系统字体读取失败，已使用兼容列表。' : 'System font query failed. Using fallback list.');
      });
    return () => {
      cancelled = true;
    };
  }, [readingSettingsOpen, locale]);

  useEffect(() => {
    if (!readingSettingsOpen) return;
    let cancelled = false;
    void loadImportedThemes()
      .then((themes) => {
        if (cancelled) return;
        useStore.getState().setImportedThemes(themes);
      })
      .catch((error) => {
        console.error('Failed to load imported themes', error);
      });
    return () => {
      cancelled = true;
    };
  }, [readingSettingsOpen]);

  return (
    <header className="relative h-11 border-b border-border-subtle bg-bg-panel flex items-center justify-between px-4 shrink-0 transition-colors select-none text-text-secondary text-xs font-medium">
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
        <button
          onClick={() => void runAppCommand('open-command-palette')}
          className="pointer-events-auto flex h-8 w-[min(26rem,48vw)] items-center gap-2 rounded-lg border border-border-subtle bg-bg-base/90 px-3 text-[12px] text-text-tertiary shadow-sm backdrop-blur transition-colors hover:bg-bg-hover hover:text-text-primary"
          title={locale === 'zh' ? '命令搜索' : 'Command Search'}
        >
          <Search size={14} />
          <span className="truncate text-left">
            {locale === 'zh' ? '命令搜索…' : 'Search commands…'}
          </span>
          <span className="ml-auto rounded border border-border-subtle px-1.5 py-[1px] text-[10px] text-text-tertiary">
            {locale === 'zh' ? '⌘K' : 'Ctrl+K'}
          </span>
        </button>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Tooltip content={locale === 'zh' ? '切换侧边栏 (⌘\\)' : 'Toggle Sidebar (⌘\\)'}>
          <button onClick={() => void runAppCommand('toggle-sidebar')} className="p-1 hover:bg-bg-hover rounded text-text-secondary">
            <PanelLeft size={16} />
          </button>
        </Tooltip>
        
        <div className="h-4 w-px bg-border-subtle mx-1" />

        <Tooltip content={locale === 'zh' ? '新建文件 (⌘N)' : 'New File (⌘N)'}>
          <button onClick={() => void runAppCommand('new-file')} className="flex items-center gap-1 px-1.5 py-1 hover:bg-bg-hover rounded text-text-secondary text-xs">
            <FilePlus2 size={14} />
            <span className="hidden sm:inline">{locale === 'zh' ? '新建' : 'New'}</span>
          </button>
        </Tooltip>

        <Tooltip content={locale === 'zh' ? '保存文件 (⌘S)' : 'Save File (⌘S)'}>
          <button 
            onClick={() => void runAppCommand('save')} 
            disabled={!isDirty || !activeFile || activeFile.readOnly || !activeFile.isMarkdown}
            className={cn(
              "flex items-center gap-1 px-1.5 py-1 rounded transition-colors",
              isDirty && activeFile && !activeFile.readOnly && activeFile.isMarkdown
                ? "text-accent bg-accent/10 hover:bg-accent/20" 
                : "text-text-tertiary bg-transparent"
            )}
          >
            <Save size={14} />
            <span className="hidden sm:inline">{locale === 'zh' ? '保存' : 'Save'}</span>
          </button>
        </Tooltip>
        <Tooltip content={locale === 'zh' ? '防抖自动保存已有 Markdown 文件' : 'Debounced autosave for existing Markdown files'}>
          <button
            onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
            className={cn(
              "rounded px-1.5 py-1 text-xs transition-colors",
              autoSaveEnabled
                ? "bg-accent/10 text-accent hover:bg-accent/20"
                : "text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
            )}
          >
            <span className="hidden sm:inline">{locale === 'zh' ? '自动保存' : 'Auto Save'}</span>
            <span className="sm:hidden">AS</span>
          </button>
        </Tooltip>
        {viewMode === 'split' && (
          <Tooltip content={splitScrollSync
            ? (locale === 'zh' ? '分屏联动滚动：已开启 (点击关闭)' : 'Split scroll sync: On (click to disable)')
            : (locale === 'zh' ? '分屏联动滚动：已关闭 (点击开启)' : 'Split scroll sync: Off (click to enable)')}>
            <button
              onClick={() => setSplitScrollSync(!splitScrollSync)}
              className={cn(
                "flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors",
                splitScrollSync
                  ? "bg-accent/10 text-accent hover:bg-accent/20"
                  : "text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
              )}
            >
              <Link2 size={14} />
            </button>
          </Tooltip>
        )}
        <Tooltip content={locale === 'zh' ? '切换图片插入方式' : 'Toggle image mode'}>
          <button
            onClick={() => setImageInsertMode(imageInsertMode === 'assets' ? 'embed' : 'assets')}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <FileText size={14} />
          </button>
        </Tooltip>
        <Tooltip content={locale === 'zh' ? '文档内搜索 (⌘F)' : 'Find in Document (⌘F)'}>
          <button
            onClick={() => void runAppCommand('find')}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <Search size={14} />
          </button>
        </Tooltip>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="flex bg-bg-active rounded p-[2px] items-center text-text-secondary shadow-inner">
          <button 
            onClick={() => void runAppCommand('view-edit')} 
            className={cn("w-6 h-6 flex items-center justify-center rounded-[4px] transition-all", viewMode === 'edit' ? "bg-bg-base text-text-primary shadow-sm border border-border-subtle" : "hover:text-text-primary hover:bg-bg-hover border border-transparent")}
            title="Edit Mode"
          ><PenLine size={13}/></button>
          {wysiwygEnabled && <button
            onClick={() => void runAppCommand('view-wysiwyg')}
            aria-disabled={!activeFile?.isMarkdown || Boolean(activeFile?.readOnly)}
            className={cn(
              "w-6 h-6 flex items-center justify-center rounded-[4px] border transition-all",
              viewMode === 'wysiwyg'
                ? "bg-bg-base text-text-primary shadow-sm border-border-subtle"
                : "hover:text-text-primary hover:bg-bg-hover border-transparent",
              (!activeFile?.isMarkdown || activeFile?.readOnly) && "opacity-45"
            )}
            title={locale === 'zh' ? '所见即所得模式' : 'WYSIWYG Mode'}
          ><Type size={13}/></button>}
          <button 
            onClick={() => void runAppCommand('view-split')}
            className={cn("w-6 h-6 flex items-center justify-center rounded-[4px] transition-all", viewMode === 'split' ? "bg-bg-base text-text-primary shadow-sm border border-border-subtle" : "hover:text-text-primary hover:bg-bg-hover border border-transparent")}
            title="Split Mode"
          ><LayoutList size={13}/></button>
          <button 
            onClick={() => void runAppCommand('view-read')}
            className={cn("w-6 h-6 flex items-center justify-center rounded-[4px] transition-all", viewMode === 'read' ? "bg-bg-base text-text-primary shadow-sm border border-border-subtle" : "hover:text-text-primary hover:bg-bg-hover border border-transparent")}
            title="Read Mode"
          ><BookOpen size={13}/></button>
          <button
            onClick={() => void runAppCommand('view-code')}
            className={cn("w-6 h-6 flex items-center justify-center rounded-[4px] transition-all", viewMode === 'code' ? "bg-bg-base text-text-primary shadow-sm border border-border-subtle" : "hover:text-text-primary hover:bg-bg-hover border border-transparent")}
            title="Code Mode"
          ><FileCode2 size={13}/></button>
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
            <div className="absolute right-0 top-8 z-50 w-[20rem] rounded-md border border-border-subtle bg-bg-base p-3 text-text-secondary shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-text-primary">
                  {locale === 'zh' ? '阅读设置' : 'Reading Settings'}
                </span>
                <button
                  onClick={() => {
                    if (settingsTarget === 'reading') resetReadingSettings();
                    else resetEditorSettings();
                  }}
                  className="rounded px-2 py-1 text-[11px] text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
                >
                  {locale === 'zh' ? '重置' : 'Reset'}
                </button>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-1 rounded-md bg-bg-active p-0.5">
                <button
                  onClick={() => setThemeMode('light')}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded px-2 py-1.5 text-[12px] transition-colors",
                    !isDarkMode ? "bg-bg-base text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-primary"
                  )}
                >
                  <Sun size={13} />
                  {locale === 'zh' ? 'Light' : 'Light'}
                </button>
                <button
                  onClick={() => setThemeMode('dark')}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded px-2 py-1.5 text-[12px] transition-colors",
                    isDarkMode ? "bg-bg-base text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-primary"
                  )}
                >
                  <Moon size={13} />
                  {locale === 'zh' ? 'Dark' : 'Dark'}
                </button>
              </div>
              <label className="mb-3 block">
                <div className="mb-1 flex items-center justify-between text-[11px] text-text-tertiary">
                  <span>{locale === 'zh' ? '主题' : 'Theme'}</span>
                  <span className="truncate text-[11px] text-text-secondary">
                    {activeBuiltInTheme?.name ?? themeState.activeThemeId}
                  </span>
                </div>
                <select
                  value={themeState.activeThemeId}
                  onChange={(event) => setActiveThemeId(event.target.value, '')}
                  className="w-full rounded-md border border-border-subtle bg-bg-panel px-2.5 py-1.5 text-[12px] text-text-primary focus:border-accent focus:outline-none"
                >
                  {readingThemeGroups.map(([group, themes]) => (
                    <optgroup key={group} label={group}>
                      {themes.map((theme) => (
                        <option key={theme.id} value={theme.id}>{theme.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <label className="mb-3 block">
                <div className="mb-1 flex items-center justify-between text-[11px] text-text-tertiary">
                  <span className="flex items-center gap-1">
                    <Type size={12} />
                    {locale === 'zh' ? '阅读字体（系统）' : 'Reading Font (System)'}
                  </span>
                  <span className="truncate text-[11px] text-text-secondary">
                    {currentCustomFont || (locale === 'zh' ? '跟随主题' : 'Follow theme')}
                  </span>
                </div>
                <select
                  value={currentCustomFont}
                  onChange={(event) => setReadingSettings({
                    font: event.target.value ? `custom:${event.target.value}` : 'theme'
                  })}
                  className="w-full rounded-md border border-border-subtle bg-bg-panel px-2.5 py-1.5 text-[12px] text-text-primary focus:border-accent focus:outline-none"
                >
                  <option value="">{locale === 'zh' ? '跟随主题字体' : 'Follow theme font'}</option>
                  {systemFonts.map((font) => (
                    <option key={font} value={font}>{font}</option>
                  ))}
                </select>
                {fontMessage && (
                  <p className="mt-1 text-[10px] text-text-tertiary">{fontMessage}</p>
                )}
              </label>
              <button
                onClick={() => {
                  void syncBuiltInThemesToThemeDir()
                    .then(() => openImportedThemesDir())
                    .then((path) => {
                      void loadImportedThemes()
                        .then((themes) => useStore.getState().setImportedThemes(themes))
                        .catch((error) => console.error('Failed to refresh imported themes', error));
                      setThemeFolderMessage(locale === 'zh' ? `已打开主题目录：${path}` : `Theme folder opened: ${path}`);
                    })
                    .catch((error) => {
                      console.error('Failed to open theme folder', error);
                      setThemeFolderMessage(error instanceof Error ? error.message : String(error));
                    });
                }}
                className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-[12px] text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <Folder size={13} />
                {locale === 'zh' ? '打开主题目录' : 'Open Theme Folder'}
              </button>
              {themeFolderMessage && (
                <p className="mb-2 text-[10px] leading-relaxed text-text-tertiary">{themeFolderMessage}</p>
              )}
              <div className="mb-3 grid grid-cols-2 gap-1 rounded-md bg-bg-active p-0.5">
                <button
                  onClick={() => setSettingsTarget('reading')}
                  className={cn(
                    "rounded px-2 py-1.5 text-[12px] transition-colors",
                    settingsTarget === 'reading' ? "bg-bg-base text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-primary"
                  )}
                >
                  {locale === 'zh' ? '阅读区' : 'Reading'}
                </button>
                <button
                  onClick={() => setSettingsTarget('editor')}
                  className={cn(
                    "rounded px-2 py-1.5 text-[12px] transition-colors",
                    settingsTarget === 'editor' ? "bg-bg-base text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-primary"
                  )}
                >
                  {locale === 'zh' ? '编辑区' : 'Editor'}
                </button>
              </div>

              {settingsTarget === 'reading' ? (
                <>
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
                </>
              ) : (
                <>
                  <ReadingSlider
                    label={locale === 'zh' ? '编辑宽度' : 'Editor Width'}
                    value={editorSettings.width}
                    min={720}
                    max={1560}
                    step={20}
                    suffix="px"
                    onChange={(width) => setEditorSettings({ width })}
                  />
                  <ReadingSlider
                    label={locale === 'zh' ? '编辑字号' : 'Editor Font Size'}
                    value={editorSettings.fontSize}
                    min={12}
                    max={22}
                    step={1}
                    suffix="px"
                    onChange={(fontSize) => setEditorSettings({ fontSize })}
                  />
                  <ReadingSlider
                    label={locale === 'zh' ? '编辑行高' : 'Editor Line Height'}
                    value={editorSettings.lineHeight}
                    min={1.25}
                    max={2.1}
                    step={0.05}
                    onChange={(lineHeight) => setEditorSettings({ lineHeight })}
                  />
                  <label className="mt-3 flex items-start gap-2 rounded-md border border-border-subtle bg-bg-panel px-2.5 py-2 text-[11px] text-text-secondary">
                    <input
                      type="checkbox"
                      checked={wysiwygEnabled}
                      onChange={(event) => {
                        const enabled = event.target.checked;
                        setWysiwygEnabled(enabled);
                        if (!enabled && viewMode === 'wysiwyg') void runAppCommand('view-edit');
                      }}
                      className="mt-0.5 accent-accent"
                    />
                    <span>
                      <span className="block font-medium text-text-primary">
                        {locale === 'zh' ? '显示所见即所得模式（实验）' : 'Show WYSIWYG mode (experimental)'}
                      </span>
                      <span className="mt-0.5 block text-text-tertiary">
                        {locale === 'zh' ? '关闭后自动返回编辑模式，文档内容不会改变。' : 'Turning it off returns to edit view without changing the document.'}
                      </span>
                    </span>
                  </label>
                </>
              )}
            </div>
          )}
        </div>
        <div className="h-4 w-px bg-border-subtle mx-2" />

        <button onClick={() => void runAppCommand('toggle-ai')} className="p-1 hover:bg-bg-hover rounded text-accent" title="AI Assistant">
          <Sparkles size={16} />
        </button>
        <Tooltip content={locale === 'zh' ? '知识图谱' : 'Knowledge Graph'}>
          <button onClick={() => useStore.getState().toggleKnowledgeGraph()} className="p-1 hover:bg-bg-hover rounded text-text-secondary">
            <Network size={16} />
          </button>
        </Tooltip>
        <Tooltip content={locale === 'zh' ? '切换语言' : 'Switch Language'}>
          <button onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')} className="p-1 hover:bg-bg-hover rounded text-text-secondary flex items-center gap-1 text-[11px] font-medium">
            <Languages size={16} />
            <span className="w-5 text-center">{locale === 'zh' ? 'EN' : '中'}</span>
          </button>
        </Tooltip>
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
  const progress = `${((value - min) / (max - min)) * 100}%`;
  return (
    <label className="mb-2.5 block">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-text-tertiary">{label}</span>
        <span className="font-mono text-text-secondary">{Number(value.toFixed(2))}{suffix}</span>
      </div>
      <div className="relative pt-1">
        <div className="pointer-events-none absolute left-0 right-0 top-[10px] h-1.5 rounded-full bg-bg-active">
          <div className="h-full rounded-full bg-accent" style={{ width: progress }} />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="inkstack-reading-slider relative z-10 w-full"
        />
      </div>
    </label>
  );
}
