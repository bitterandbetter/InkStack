import { describe, expect, it } from 'vitest';
import { GENERATED_THEMES } from '../../../src/lib/themes.generated';
import { pairedThemeIdForMode } from '../../../src/lib/themes';

const REQUIRED_VARIABLES = [
  '--font-reading',
  '--font-editor',
  '--color-bg-base',
  '--color-bg-panel',
  '--color-bg-hover',
  '--color-bg-active',
  '--color-border-subtle',
  '--color-text-primary',
  '--color-text-secondary',
  '--color-text-tertiary',
  '--color-accent',
  '--color-ai-user',
  '--color-ai-bot',
  '--color-code-bg',
  '--color-code-header-bg',
  '--color-code-text',
  '--color-code-muted',
  '--color-code-keyword',
  '--color-code-string',
  '--color-code-number',
  '--color-code-title',
  '--color-code-comment',
  '--color-code-attr',
  '--color-inline-code-bg',
  '--color-inline-code-text'
] as const;

describe('generated Typora themes', () => {
  it('contains the complete, uniquely identified adaptation set', () => {
    const ids = GENERATED_THEMES.map((theme) => theme.meta.id);

    expect(GENERATED_THEMES).toHaveLength(62);
    expect(new Set(ids).size).toBe(ids.length);
    expect(GENERATED_THEMES.filter((theme) => theme.meta.dark)).toHaveLength(29);
  });

  it('provides every InkStack color token for every theme', () => {
    for (const theme of GENERATED_THEMES) {
      for (const variable of REQUIRED_VARIABLES) {
        expect(theme.variables[variable], `${theme.meta.id}: ${variable}`).toBeTruthy();
      }
    }
  });

  it('includes scoped semantic Markdown styles instead of palette-only adaptation', () => {
    for (const theme of GENERATED_THEMES) {
      expect(theme.contentCss, `${theme.meta.id}: content CSS`).toContain('.inkstack-reading-surface');
      expect(theme.contentCss, `${theme.meta.id}: heading CSS`).toMatch(/\bh[1-6]\b/);
      expect(theme.contentCss, `${theme.meta.id}: leaked Typora root`).not.toContain('#write');
      expect(theme.contentCss, `${theme.meta.id}: leaked editor DOM`).not.toContain('CodeMirror');
      expect(theme.contentCss, `${theme.meta.id}: relative assets`).not.toMatch(/url\(["']?(?:\.\/|\.\.\/)/);
    }

    const animalIsland = GENERATED_THEMES.find((theme) => theme.meta.id === 'animal-island');
    expect(animalIsland?.contentCss).toContain('h1::after');
    expect(animalIsland?.contentCss).toContain('linear-gradient');

    const bloom = GENERATED_THEMES.find((theme) => theme.meta.id === 'bloom-amber');
    expect(bloom?.contentCss).toContain('blockquote');
    expect(bloom?.contentCss).toContain('li::marker');
    expect(bloom?.contentCss).toContain('table');
    expect(bloom?.contentCss).toContain('.inkstack-code-surface');
  });

  it('does not let print overrides replace Bloom dark palettes', () => {
    const dark = GENERATED_THEMES.find((theme) => theme.meta.id === 'bloom-amber-dark');
    const light = GENERATED_THEMES.find((theme) => theme.meta.id === 'bloom-amber');

    expect(dark?.variables['--color-bg-base']).toBe('#221811');
    expect(light?.variables['--color-bg-base']).toBe('#faf6f1');
    expect(dark?.variables['--color-bg-base']).not.toBe(light?.variables['--color-bg-base']);
  });

  it('links light and dark variants of the same theme family', () => {
    expect(pairedThemeIdForMode('bloom-amber', 'dark')).toBe('bloom-amber-dark');
    expect(pairedThemeIdForMode('bloom-amber-dark', 'light')).toBe('bloom-amber');
    expect(pairedThemeIdForMode('light', 'dark')).toBe('dark');
    expect(pairedThemeIdForMode('dark', 'light')).toBe('light');
  });

  it('falls back coherently when a built-in theme has no matching variant', () => {
    expect(pairedThemeIdForMode('pink-hsiao', 'dark')).toBe('dark');
    expect(pairedThemeIdForMode('nocturne-dark', 'light')).toBe('light');
    expect(pairedThemeIdForMode('imported:custom', 'dark')).toBe('imported:custom');
  });
});
