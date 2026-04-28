import { useMemo, useState } from 'react';
import {
  BUILT_IN_THEME_CSS,
  allThemeOptions,
  deleteImportedTheme,
  exportThemeCss,
  importCssTheme,
  isImportedTheme,
  loadImportedThemes,
  readImportedThemeCss,
  type BuiltInThemeId,
  type ThemeOption,
  type ThemeState
} from '../lib/themes';

export function useThemeSettings({
  locale,
  themeState,
  setActiveThemeId,
  setImportedThemes
}: {
  locale: 'zh' | 'en';
  themeState: ThemeState;
  setActiveThemeId: (themeId: string, importedThemeCss?: string) => void;
  setImportedThemes: (themes: ThemeOption[]) => void;
}) {
  const [themeMessage, setThemeMessage] = useState('');
  const themeOptions = useMemo(() => allThemeOptions(themeState.importedThemes), [themeState.importedThemes]);
  const activeTheme = themeOptions.find((theme) => theme.id === themeState.activeThemeId) ?? themeOptions[0];
  const activeThemeIsImported = isImportedTheme(themeState.activeThemeId, themeState.importedThemes);

  const handleThemeChange = async (themeId: string) => {
    try {
      setThemeMessage('');
      if (themeId.startsWith('imported:')) {
        const css = await readImportedThemeCss(themeId);
        setActiveThemeId(themeId, css);
      } else {
        setActiveThemeId(themeId, '');
      }
    } catch (error: any) {
      console.error('Theme change failed', error);
      setThemeMessage(error?.message ?? String(error));
    }
  };

  const handleImportTheme = async () => {
    try {
      setThemeMessage('');
      const imported = await importCssTheme();
      if (!imported) return;
      const importedThemes = await loadImportedThemes();
      setImportedThemes(importedThemes);
      setActiveThemeId(imported.state.activeThemeId, imported.state.importedThemeCss);
      setThemeMessage(locale === 'zh' ? '主题已导入并应用' : 'Theme imported and applied');
    } catch (error: any) {
      console.error('Theme import failed', error);
      setThemeMessage(error?.message ?? String(error));
    }
  };

  const handleExportTheme = async () => {
    if (!activeTheme) return;
    try {
      setThemeMessage('');
      const css = activeTheme.kind === 'imported'
        ? await readImportedThemeCss(activeTheme.id)
        : BUILT_IN_THEME_CSS[activeTheme.id as BuiltInThemeId];
      const savedPath = await exportThemeCss(activeTheme, css);
      if (savedPath) {
        setThemeMessage(locale === 'zh' ? `主题已导出：${savedPath}` : `Theme exported: ${savedPath}`);
      }
    } catch (error: any) {
      console.error('Theme export failed', error);
      setThemeMessage(error?.message ?? String(error));
    }
  };

  const handleDeleteTheme = async () => {
    if (!activeThemeIsImported) return;
    const confirmed = window.confirm(
      locale === 'zh'
        ? '删除当前导入主题？此操作只会删除本机主题 CSS 文件，不会影响文档。'
        : 'Delete the current imported theme? This only removes the local theme CSS file.'
    );
    if (!confirmed) return;

    try {
      setThemeMessage('');
      await deleteImportedTheme(themeState.activeThemeId);
      const importedThemes = await loadImportedThemes();
      setImportedThemes(importedThemes);
      setActiveThemeId('light', '');
      setThemeMessage(locale === 'zh' ? '导入主题已删除，已回到默认浅色主题' : 'Imported theme deleted. Reverted to InkStack Light.');
    } catch (error: any) {
      console.error('Theme delete failed', error);
      setThemeMessage(error?.message ?? String(error));
    }
  };

  return {
    themeOptions,
    activeThemeIsImported,
    themeMessage,
    handleThemeChange,
    handleImportTheme,
    handleExportTheme,
    handleDeleteTheme
  };
}
