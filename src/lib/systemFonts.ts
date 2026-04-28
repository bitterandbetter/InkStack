import { invoke, isTauriRuntime } from './tauriRuntime';

const FALLBACK_ZH_FONT_FAMILIES = [
  'PingFang SC',
  'Songti SC',
  'STSong',
  'FangSong',
  'STFangsong',
  'Kaiti SC',
  'STKaiti',
  'Heiti SC',
  'Hiragino Sans GB',
  'Source Han Serif SC',
  'Source Han Sans SC',
  'Noto Serif CJK SC',
  'Noto Sans CJK SC',
  'Times New Roman'
];

export async function loadSystemFontFamilies(): Promise<string[]> {
  try {
    if (isTauriRuntime()) {
      const families = await invoke<string[]>('list_system_font_families');
      return sanitizeFamilies(families);
    }
  } catch (error) {
    console.error('Failed to load fonts from desktop runtime', error);
  }
  return FALLBACK_ZH_FONT_FAMILIES;
}

function sanitizeFamilies(families: string[]) {
  const values = Array.isArray(families)
    ? families
      .filter((family): family is string => typeof family === 'string')
      .map((family) => family.trim())
      .filter(Boolean)
    : [];
  const unique = Array.from(new Set(values));
  return unique.length > 0 ? unique : FALLBACK_ZH_FONT_FAMILIES;
}
