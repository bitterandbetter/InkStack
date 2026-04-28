import { Check, Download, Trash2 } from 'lucide-react';
import type { ThemeOption } from '../lib/themes';
import { cn } from '../lib/utils';

export function ThemeSettingsPanel({
  locale,
  mode,
  onModeChange,
  activeThemeId,
  themeOptions,
  activeThemeIsImported,
  message,
  onThemeChange,
  onImportTheme,
  onExportTheme,
  onDeleteTheme
}: {
  locale: 'zh' | 'en';
  mode: 'light' | 'dark';
  onModeChange: (mode: 'light' | 'dark') => void;
  activeThemeId: string;
  themeOptions: ThemeOption[];
  activeThemeIsImported: boolean;
  message: string;
  onThemeChange: (themeId: string) => void;
  onImportTheme: () => void;
  onExportTheme: () => void;
  onDeleteTheme: () => void;
}) {
  return (
    <div className="space-y-3 rounded-md border border-border-subtle bg-bg-base p-3">
      <div className="grid grid-cols-2 gap-1 rounded-md bg-bg-active p-0.5">
        <button
          onClick={() => onModeChange('light')}
          className={cn(
            'rounded px-2 py-1.5 text-[12px] transition-colors',
            mode === 'light' ? 'bg-bg-base text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-primary'
          )}
        >
          Light
        </button>
        <button
          onClick={() => onModeChange('dark')}
          className={cn(
            'rounded px-2 py-1.5 text-[12px] transition-colors',
            mode === 'dark' ? 'bg-bg-base text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-primary'
          )}
        >
          Dark
        </button>
      </div>
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
          {locale === 'zh' ? '外观主题' : 'Theme'}
        </label>
        <select
          value={activeThemeId}
          onChange={(event) => onThemeChange(event.target.value)}
          className="mt-1 w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:border-accent"
        >
          {themeOptions.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.kind === 'imported' ? `${theme.name} · CSS` : theme.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid max-h-80 grid-cols-1 gap-2 overflow-auto pr-1">
        {themeOptions.map((theme) => {
          const active = theme.id === activeThemeId;
          return (
            <button
              key={theme.id}
              onClick={() => onThemeChange(theme.id)}
              className={cn(
                'w-full rounded-md border px-3 py-2 text-left transition-colors',
                active
                  ? 'border-accent bg-bg-hover'
                  : 'border-border-subtle bg-bg-panel hover:bg-bg-hover'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-text-primary">
                      {theme.kind === 'imported' ? `${theme.name} · CSS` : theme.name}
                    </span>
                    <span className="shrink-0 rounded border border-border-subtle px-1.5 py-0.5 text-[10px] text-text-tertiary">
                      {theme.kind === 'imported'
                        ? (locale === 'zh' ? '导入' : 'Imported')
                        : (locale === 'zh' ? theme.groupZh : theme.groupEn)}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed text-text-tertiary">
                    {theme.kind === 'imported'
                      ? (locale === 'zh' ? '本地导入 CSS 主题，可导出或删除。' : 'Locally imported CSS theme. It can be exported or deleted.')
                      : (locale === 'zh' ? theme.descriptionZh : theme.descriptionEn)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {(theme.swatches ?? ['#fff', '#f3f4f6', '#64748b', '#111827']).map((color, index) => (
                    <span
                      key={`${theme.id}-${color}-${index}`}
                      className="h-5 w-3 rounded-sm border border-black/10"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  {active && <Check size={14} className="ml-1 text-accent" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <button
        onClick={onImportTheme}
        className="w-full rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
      >
        {locale === 'zh' ? '导入 CSS 主题' : 'Import CSS Theme'}
      </button>
      <div className="rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-[11px] leading-relaxed text-text-tertiary">
        {locale === 'zh'
          ? '导入前会校验 .css 扩展、大小、远程资源和基础变量；导入后可立即切换预览，不会写入项目源码。'
          : 'Imported themes are checked for .css extension, size, remote resources and InkStack variables; they can be previewed immediately without writing to project source.'}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onExportTheme}
          className="flex items-center justify-center gap-1.5 rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <Download size={14} />
          {locale === 'zh' ? '导出当前主题' : 'Export Theme'}
        </button>
        <button
          onClick={onDeleteTheme}
          disabled={!activeThemeIsImported}
          className="flex items-center justify-center gap-1.5 rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Trash2 size={14} />
          {locale === 'zh' ? '删除导入主题' : 'Delete Theme'}
        </button>
      </div>
      {message && (
        <div className="rounded bg-bg-panel px-2 py-1.5 text-[11px] text-text-tertiary">
          {message}
        </div>
      )}
    </div>
  );
}
