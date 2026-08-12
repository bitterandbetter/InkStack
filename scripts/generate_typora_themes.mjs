#!/usr/bin/env node
// Generates src/lib/themes.generated.ts from the Typora themes folder.
// Run: node scripts/generate_typora_themes.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildScopedContentCss } from './typora_content_css.mjs';

const ROOT = process.cwd();
const THEMES_DIR = join(ROOT, 'Typora主题');
const OUT = join(ROOT, 'src', 'lib', 'themes.generated.ts');

const allTokens = JSON.parse(readFileSync(join(ROOT, 'tmp', 'typora-dump', 'all-tokens.json'), 'utf8'));

// ---------- small color / var helpers ----------
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function normalizeHex(value) {
  const m = value.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const c = m[1];
    return `#${c[0]}${c[0]}${c[1]}${c[1]}${c[2]}${c[2]}`;
  }
  return value;
}

function isColor(value) {
  const v = String(value).trim();
  return HEX.test(v) || /^rgba?\(/i.test(v) || /^hsla?\(/i.test(v);
}

function hexToRgb(hex) {
  const h = normalizeHex(hex).slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

function mix(hex1, hex2, weight) {
  const a = hexToRgb(hex1);
  const b = hexToRgb(hex2);
  const w = Math.min(1, Math.max(0, weight));
  const r = Math.round(a.r + (b.r - a.r) * w);
  const g = Math.round(a.g + (b.g - a.g) * w);
  const bl = Math.round(a.b + (b.b - a.b) * w);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------- var() resolution ----------
function resolveVar(value, tokens, depth = 0) {
  if (depth > 12) return value.trim();
  let v = String(value).trim().replace(/!important$/, '').trim();
  const varMatch = v.match(/^var\(--([\w-]+)(?:,\s*([^)]+))?\)$/);
  if (varMatch) {
    const name = `--${varMatch[1]}`;
    if (name in tokens) {
      const inner = resolveVar(tokens[name], tokens, depth + 1);
      if (!inner.startsWith('var(')) return inner;
    }
    if (varMatch[2]) return resolveVar(varMatch[2], tokens, depth + 1);
    return v;
  }
  return v;
}

// Resolve rgba(var(--r),...) channel references.
function resolveChannels(value, tokens) {
  let v = String(value).trim();
  const refs = v.matchAll(/var\((--[\w-]+)\)/g);
  for (const m of refs) {
    const name = m[1];
    const raw = name in tokens ? resolveVar(tokens[name], tokens) : '';
    if (isColor(raw)) {
      const rgb = hexToRgb(normalizeHex(raw));
      v = v.replace(m[0], String(rgb.r));
      v = v.replace(m[0], String(rgb.g));
      v = v.replace(m[0], String(rgb.b));
    } else if (/^[+\-.\d]+$/.test(raw.trim())) {
      v = v.replace(m[0], raw.trim());
    }
  }
  return v;
}

// ---------- cm-* selector extraction ----------
function extractCmColors(css) {
  const out = {};
  const re = /([^{}]+)\{([^}]*)\}/g;
  const LEAF = /\.cm-(s-inner|s-typora-default)\b/;
  let m;
  while ((m = re.exec(css))) {
    const selector = m[1];
    const body = m[2];
    const leafMatch = selector.match(/\.cm-([a-z0-9-]+)/g);
    if (!leafMatch) continue;
    if (!LEAF.test(selector) && !/\.cm-(keyword|builtin|string|string-2|number|atom|comment|def|type|variable-2|variable-3|attribute|property|tag)\b/.test(selector)) continue;
    const leaf = leafMatch[leafMatch.length - 1].replace('.cm-', '');
    const colorMatch = body.match(/color\s*:\s*([^;]+);/);
    if (!colorMatch) continue;
    const color = colorMatch[1].trim().replace(/!important$/, '').trim();
    if (isColor(color) && !color.includes('var(')) {
      if (!out[leaf]) out[leaf] = normalizeHex(color);
    }
  }
  return out;
}

function codeColor(tokens, cm, names, fallback) {
  for (const n of names) {
    if (n in tokens) {
      const v = resolveVar(tokens[n], tokens);
      if (isColor(v)) return normalizeHex(v);
    }
  }
  if (cm) {
    for (const n of ['keyword', 'string', 'number', 'comment', 'def', 'variable-2', 'attribute', 'atom', 'type', 'builtin', 'property', 'operator']) {
      if (cm[n]) return cm[n];
    }
  }
  return fallback;
}

// ---------- family config ----------
// Each family: { files: {light: rel, dark?: rel}, group, name(id), map: { inkVar: [tokens...], derive? } }
const FAMILIES = [];

function family(id, group, files, map) {
  const cssCache = {};
  const tokensCache = {};
  for (const [mode, rel] of Object.entries(files)) {
    if (!rel) continue;
    const css = readFileSync(join(THEMES_DIR, rel), 'utf8');
    cssCache[mode] = css;
    tokensCache[mode] = allTokens[rel] || {};
  }
  FAMILIES.push({ id, group, files, map, cssCache, tokensCache });
}

// Bloom tokens use --bg, --surface, --text, --accent, --border, --code-token-*
family('bloom', 'Bloom', {}, {
  '--color-bg-base': ['--bg'],
  '--color-bg-panel': ['--surface'],
  '--color-bg-hover': ['--surface-2'],
  '--color-bg-active': ['--surface-2'],
  '--color-border-subtle': ['--border'],
  '--color-text-primary': ['--text'],
  '--color-text-secondary': ['--text-semi'],
  '--color-text-tertiary': ['--muted'],
  '--color-accent': ['--accent'],
  '--color-ai-user': ['--accent'],
  '--color-ai-bot': ['--surface'],
  '--color-code-bg': ['--surface-2'],
  '--color-code-header-bg': ['--surface'],
  '--color-code-text': ['--text'],
  '--color-code-muted': ['--code-muted-rgb'],
  '--color-code-keyword': ['--code-token-keyword'],
  '--color-code-string': ['--code-token-string'],
  '--color-code-number': ['--code-token-number'],
  '--color-code-title': ['--code-token-blue'],
  '--color-code-comment': ['--muted'],
  '--color-code-attr': ['--code-token-blue'],
  '--color-inline-code-bg': ['--accent-soft'],
  '--color-inline-code-text': ['--accent']
});

// blue-topaz-typora
family('blue-topaz', 'Blue Topaz', {}, {
  '--color-bg-base': ['--bg-color'],
  '--color-bg-panel': ['--side-bar-bg-color'],
  '--color-bg-hover': ['--item-hover-bg-color'],
  '--color-bg-active': ['--active-file-bg-color'],
  '--color-border-subtle': ['--ui-border-color'],
  '--color-text-primary': ['--text-color'],
  '--color-text-secondary': ['--control-text-color'],
  '--color-text-tertiary': ['--meta-content-color'],
  '--color-accent': ['--primary-color'],
  '--color-ai-user': ['--primary-color'],
  '--color-ai-bot': ['--side-bar-bg-color'],
  '--color-code-bg': ['--rawblock-edit-panel-bd'],
  '--color-code-header-bg': ['--rawblock-edit-panel-bd'],
  '--color-code-text': ['--text-color'],
  '--color-code-muted': ['--meta-content-color'],
  '--color-code-keyword': ['--cm-keyword'],
  '--color-code-string': ['--cm-string'],
  '--color-code-number': ['--cm-number'],
  '--color-code-title': ['--cm-def'],
  '--color-code-comment': ['--cm-comment'],
  '--color-code-attr': ['--cm-attribute'],
  '--color-inline-code-bg': ['--rawblock-edit-panel-bd'],
  '--color-inline-code-text': ['--link-color']
});

// claude-typora-theme
family('claude', 'Claude', {}, {
  '--color-bg-base': ['--bg-color'],
  '--color-bg-panel': ['--claude-mega-bg', '--sidebar-gradient-to'],
  '--color-bg-hover': ['--hover-color'],
  '--color-bg-active': ['--hover-color'],
  '--color-border-subtle': ['--border-color-15', '--border-color'],
  '--color-text-primary': ['--font-color'],
  '--color-text-secondary': ['--sidebar-font-color'],
  '--color-text-tertiary': ['--pre-inputfont-color'],
  '--color-accent': ['--LOGO-color'],
  '--color-ai-user': ['--LOGO-color'],
  '--color-ai-bot': ['--claude-mega-panel', '--bg-color'],
  '--color-code-bg': ['--pre-bg-color', '--code-bg-color'],
  '--color-code-header-bg': ['--claude-mega-bg', '--bg-color'],
  '--color-code-text': ['--font-color'],
  '--color-code-muted': ['--pre-inputfont-color'],
  '--color-code-keyword': ['--cm-keyword'],
  '--color-code-string': ['--cm-string'],
  '--color-code-number': ['--cm-number'],
  '--color-code-title': ['--cm-def'],
  '--color-code-comment': ['--cm-comment'],
  '--color-code-attr': ['--cm-attribute'],
  '--color-inline-code-bg': ['--code-bg-color'],
  '--color-inline-code-text': ['--LOGO-color']
});

// Konayuki
family('konayuki', 'Konayuki', {}, {
  '--color-bg-base': ['--bg-color'],
  '--color-bg-panel': ['--sidebar-bg-2', '--active-file-bg-color'],
  '--color-bg-hover': ['--item-hover-bg-color', '--sidebar-hover'],
  '--color-bg-active': ['--sidebar-active', '--active-file-bg-color'],
  '--color-border-subtle': ['--border-color'],
  '--color-text-primary': ['--text-color'],
  '--color-text-secondary': ['--text-muted'],
  '--color-text-tertiary': ['--text-faint'],
  '--color-accent': ['--primary-color'],
  '--color-ai-user': ['--primary-color'],
  '--color-ai-bot': ['--sidebar-bg-2'],
  '--color-code-bg': ['--code-bg-color'],
  '--color-code-header-bg': ['--code-bg-color'],
  '--color-code-text': ['--code-text-color'],
  '--color-code-muted': ['--syntax-comment'],
  '--color-code-keyword': ['--syntax-keyword'],
  '--color-code-string': ['--syntax-string'],
  '--color-code-number': ['--syntax-number'],
  '--color-code-title': ['--syntax-variable-2'],
  '--color-code-comment': ['--syntax-comment'],
  '--color-code-attr': ['--syntax-tag'],
  '--color-inline-code-bg': ['--code-bg-color'],
  '--color-inline-code-text': ['--primary-color']
});

// LatexTypora
family('latex', 'LaTeX Typora', {}, {
  '--color-bg-base': ['--bg-color'],
  '--color-bg-panel': ['--panel-bg-color', '--surface-color'],
  '--color-bg-hover': ['--bg-color'],
  '--color-bg-active': ['--bg-color'],
  '--color-border-subtle': ['--line-color'],
  '--color-text-primary': ['--text-color'],
  '--color-text-secondary': ['--muted-text-color'],
  '--color-text-tertiary': ['--meta-text-color'],
  '--color-accent': ['--link-color'],
  '--color-ai-user': ['--link-color'],
  '--color-ai-bot': ['--panel-bg-color'],
  '--color-code-bg': ['--code-bg-color'],
  '--color-code-header-bg': ['--code-bg-color'],
  '--color-code-text': ['--text-color'],
  '--color-code-muted': ['--syntax-comment-color'],
  '--color-code-keyword': ['--syntax-keyword-color'],
  '--color-code-string': ['--syntax-string-color'],
  '--color-code-number': ['--syntax-number-color'],
  '--color-code-title': ['--syntax-type-color'],
  '--color-code-comment': ['--syntax-comment-color'],
  '--color-code-attr': ['--syntax-type-color'],
  '--color-inline-code-bg': ['--inline-code-bg-color'],
  '--color-inline-code-text': ['--link-color']
});

// LightMind
family('lightmind', 'LightMind', {}, {
  '--color-bg-base': ['--bg-write'],
  '--color-bg-panel': ['--bg-soft'],
  '--color-bg-hover': ['--bg-soft', '--accent-soft'],
  '--color-bg-active': ['--accent-soft'],
  '--color-border-subtle': ['--bg-soft'],
  '--color-text-primary': ['--fg-main'],
  '--color-text-secondary': ['--fg-muted'],
  '--color-text-tertiary': ['--fg-faint'],
  '--color-accent': ['--accent'],
  '--color-ai-user': ['--accent'],
  '--color-ai-bot': ['--bg-soft'],
  '--color-code-bg': ['--code-bg'],
  '--color-code-header-bg': ['--code-bg-soft'],
  '--color-code-text': ['--code-fg'],
  '--color-code-muted': ['--code-gutter'],
  '--color-code-keyword': ['--cm-keyword'],
  '--color-code-string': ['--cm-string'],
  '--color-code-number': ['--cm-number'],
  '--color-code-title': ['--cm-def'],
  '--color-code-comment': ['--cm-comment'],
  '--color-code-attr': ['--cm-property'],
  '--color-inline-code-bg': ['--bg-inline-code'],
  '--color-inline-code-text': ['--cm-string']
});

// MorandiGarden
family('morandi', 'Morandi Garden', {}, {
  '--color-bg-base': ['--bg-color'],
  '--color-bg-panel': ['--th-bg-color', '--code-bg-color'],
  '--color-bg-hover': ['--th-bg-color'],
  '--color-bg-active': ['--th-bg-color'],
  '--color-border-subtle': ['--table-border-color', '--md-char-color'],
  '--color-text-primary': ['--text-color'],
  '--color-text-secondary': ['--md-char-color'],
  '--color-text-tertiary': ['--md-char-color'],
  '--color-accent': ['--link-color'],
  '--color-ai-user': ['--link-color'],
  '--color-ai-bot': ['--code-bg-color'],
  '--color-code-bg': ['--code-bg-color'],
  '--color-code-header-bg': ['--code-bg-color'],
  '--color-code-text': ['--code-text-color'],
  '--color-code-muted': ['--md-char-color'],
  '--color-code-keyword': ['--link-color'],
  '--color-code-string': ['--link-color'],
  '--color-code-number': ['--link-color'],
  '--color-code-title': ['--link-color'],
  '--color-code-comment': ['--md-char-color'],
  '--color-code-attr': ['--link-color'],
  '--color-inline-code-bg': ['--code-bg-color'],
  '--color-inline-code-text': ['--link-color']
});

// rose.css (Material)
family('rose', 'Rose', {}, {
  '--color-bg-base': ['--color-white'],
  '--color-bg-panel': ['--active-file-bg-color', '--sidebar-hover-bg-color'],
  '--color-bg-hover': ['--sidebar-hover-bg-color', '--active-file-bg-color'],
  '--color-bg-active': ['--sidebar-active-bg-color', '--active-file-bg-color'],
  '--color-border-subtle': ['--window-border', '--table-border-color'],
  '--color-text-primary': ['--text-color'],
  '--color-text-secondary': ['--control-text-color', '--blockquote-font-color'],
  '--color-text-tertiary': ['--blockquote-font-color'],
  '--color-accent': ['--color-primary'],
  '--color-ai-user': ['--link-color', '--color-primary'],
  '--color-ai-bot': ['--sidebar-hover-bg-color'],
  '--color-code-bg': ['--code-block-bg-color'],
  '--color-code-header-bg': ['--meta-block-bg-color', '--code-block-bg-color'],
  '--color-code-text': ['--text-color'],
  '--color-code-muted': ['--blockquote-font-color'],
  '--color-code-keyword': ['--color-primary'],
  '--color-code-string': ['--color-tertiary'],
  '--color-code-number': ['--color-tertiary'],
  '--color-code-title': ['--color-secondary'],
  '--color-code-comment': ['--blockquote-font-color'],
  '--color-code-attr': ['--color-secondary'],
  '--color-inline-code-bg': ['--code-block-bg-color'],
  '--color-inline-code-text': ['--inline-code-color']
});

// Typora_Claude-Like
family('claude-like', 'Claude Like', {}, {
  '--color-bg-base': ['--bg-color'],
  '--color-bg-panel': ['--side-bar-bg-color', '--window-bg-color'],
  '--color-bg-hover': ['--item-hover-bg-color'],
  '--color-bg-active': ['--item-hover-bg-color'],
  '--color-border-subtle': ['--border-color'],
  '--color-text-primary': ['--text-color'],
  '--color-text-secondary': ['--control-text-color'],
  '--color-text-tertiary': ['--code-muted-color'],
  '--color-accent': ['--accent-color'],
  '--color-ai-user': ['--accent-color'],
  '--color-ai-bot': ['--side-bar-bg-color'],
  '--color-code-bg': ['--code-bg-color'],
  '--color-code-header-bg': ['--side-bar-bg-color'],
  '--color-code-text': ['--code-text-color'],
  '--color-code-muted': ['--code-muted-color'],
  '--color-code-keyword': ['--code-keyword-color'],
  '--color-code-string': ['--code-string-color'],
  '--color-code-number': ['--code-number-color'],
  '--color-code-title': ['--code-symbol-color'],
  '--color-code-comment': ['--code-muted-color'],
  '--color-code-attr': ['--code-symbol-color'],
  '--color-inline-code-bg': ['--inline-code-bg-color'],
  '--color-inline-code-text': ['--inline-code-color']
});

// nocturne (dark)
family('nocturne', 'Nocturne', {}, {
  '--color-bg-base': ['--bg-color'],
  '--color-bg-panel': ['--bg-color-panel'],
  '--color-bg-hover': ['--bg-color-panel-strong'],
  '--color-bg-active': ['--bg-color-panel-strong'],
  '--color-border-subtle': ['--border-color'],
  '--color-text-primary': ['--text-color'],
  '--color-text-secondary': ['--text-color-secondary'],
  '--color-text-tertiary': ['--text-color-muted'],
  '--color-accent': ['--primary-color'],
  '--color-ai-user': ['--primary-color'],
  '--color-ai-bot': ['--bg-color-panel'],
  '--color-code-bg': ['--bg-color-deep'],
  '--color-code-header-bg': ['--bg-color-panel'],
  '--color-code-text': ['--text-color'],
  '--color-code-muted': ['--text-color-muted'],
  '--color-code-keyword': ['--cm-keyword'],
  '--color-code-string': ['--accent-green'],
  '--color-code-number': ['--accent-amber'],
  '--color-code-title': ['--accent-blue'],
  '--color-code-comment': ['--cm-comment'],
  '--color-code-attr': ['--accent-cyan'],
  '--color-inline-code-bg': ['--bg-color-panel-strong'],
  '--color-inline-code-text': ['--primary-color']
});

// animal-island
family('animal-island', 'Animal Island', {}, {
  '--color-bg-base': ['--ai-bg-app'],
  '--color-bg-panel': ['--ai-bg-soft'],
  '--color-bg-hover': ['--ai-bg-input', '--ai-border-soft'],
  '--color-bg-active': ['--ai-bg-input'],
  '--color-border-subtle': ['--ai-border-soft', '--ai-border-light'],
  '--color-text-primary': ['--ai-text-main'],
  '--color-text-secondary': ['--ai-text-body'],
  '--color-text-tertiary': ['--ai-text-muted'],
  '--color-accent': ['--ai-primary'],
  '--color-ai-user': ['--ai-primary'],
  '--color-ai-bot': ['--ai-bg-soft'],
  '--color-code-bg': ['--ai-bg-input'],
  '--color-code-header-bg': ['--ai-bg-soft'],
  '--color-code-text': ['--ai-text-body'],
  '--color-code-muted': ['--ai-text-secondary'],
  '--color-code-keyword': ['--ai-primary'],
  '--color-code-string': ['--ai-success'],
  '--color-code-number': ['--ai-primary-hover'],
  '--color-code-title': ['--ai-text-body'],
  '--color-code-comment': ['--ai-text-muted'],
  '--color-code-attr': ['--ai-primary-hover'],
  '--color-inline-code-bg': ['--ai-bg-input'],
  '--color-inline-code-text': ['--ai-primary']
});

// blue-topaz-main (Nord-like dark)
family('blue-topaz-nord', 'Blue Topaz Nord', {}, {
  '--color-bg-base': ['--bg-color-primary'],
  '--color-bg-panel': ['--bg-color-secondary'],
  '--color-bg-hover': ['--bg-color-tertiary'],
  '--color-bg-active': ['--hover-bg'],
  '--color-border-subtle': ['--border-color'],
  '--color-text-primary': ['--text-color-primary'],
  '--color-text-secondary': ['--text-color-secondary'],
  '--color-text-tertiary': ['--text-color-muted'],
  '--color-accent': ['--primary-color'],
  '--color-ai-user': ['--accent-blue'],
  '--color-ai-bot': ['--bg-color-secondary'],
  '--color-code-bg': ['--bg-color-code'],
  '--color-code-header-bg': ['--bg-color-secondary'],
  '--color-code-text': ['--text-color-primary'],
  '--color-code-muted': ['--text-color-muted'],
  '--color-code-keyword': ['--mp-keyword'],
  '--color-code-string': ['--mp-string'],
  '--color-code-number': ['--mp-number'],
  '--color-code-title': ['--mp-function'],
  '--color-code-comment': ['--mp-comment'],
  '--color-code-attr': ['--mp-function'],
  '--color-inline-code-bg': ['--bg-color-inline-code'],
  '--color-inline-code-text': ['--accent-cyan']
});

// inkwell
family('inkwell', 'Inkwell', {}, {
  '--color-bg-base': ['--bg-color'],
  '--color-bg-panel': ['--table-header-bg'],
  '--color-bg-hover': ['--table-stripe-bg', '--border-light'],
  '--color-bg-active': ['--table-stripe-bg'],
  '--color-border-subtle': ['--border-color'],
  '--color-text-primary': ['--text-color'],
  '--color-text-secondary': ['--meta-color'],
  '--color-text-tertiary': ['--meta-color'],
  '--color-accent': ['--link-color'],
  '--color-ai-user': ['--link-color'],
  '--color-ai-bot': ['--blockquote-bg'],
  '--color-code-bg': ['--code-bg'],
  '--color-code-header-bg': ['--table-header-bg'],
  '--color-code-text': ['--code-text'],
  '--color-code-muted': ['--meta-color'],
  '--color-code-keyword': ['--cm-keyword'],
  '--color-code-string': ['--cm-string'],
  '--color-code-number': ['--cm-number'],
  '--color-code-title': ['--heading-color'],
  '--color-code-comment': ['--cm-comment'],
  '--color-code-attr': ['--cm-operator'],
  '--color-inline-code-bg': ['--code-bg'],
  '--color-inline-code-text': ['--code-text']
});

// pink-hsiao
family('pink-hsiao', 'Pink Hsiao', {}, {
  '--color-bg-base': ['--side-bar-bg-color'],
  '--color-bg-panel': ['--side-bar-bg-color'],
  '--color-bg-hover': ['--item-hover-bg-color'],
  '--color-bg-active': ['--item-hover-bg-color'],
  '--color-border-subtle': ['--border-color'],
  '--color-text-primary': ['--text-color'],
  '--color-text-secondary': ['--control-text-color'],
  '--color-text-tertiary': ['--control-text-color'],
  '--color-accent': ['--pink-accent'],
  '--color-ai-user': ['--pink-accent'],
  '--color-ai-bot': ['--pink-lighter'],
  '--color-code-bg': ['--code-bg'],
  '--color-code-header-bg': ['--pink-lighter'],
  '--color-code-text': ['--text-color'],
  '--color-code-muted': ['--control-text-color'],
  '--color-code-keyword': ['--pink-accent'],
  '--color-code-string': ['--pink-accent'],
  '--color-code-number': ['--pink-accent'],
  '--color-code-title': ['--pink-light'],
  '--color-code-comment': ['--control-text-color'],
  '--color-code-attr': ['--pink-light'],
  '--color-inline-code-bg': ['--code-bg'],
  '--color-inline-code-text': ['--pink-accent']
});

// VLOOK (7 series, light + dark)
const VLOOK_SERIES = ['fancy', 'geek', 'hope', 'joint', 'note', 'solaris', 'thinking'];

// Jinxiu (SCU) — hardcoded colors, no CSS variables.
const JINXIU_MAP = {
  '--color-bg-base': ['#ffffff'],
  '--color-bg-panel': ['#f6f8fa'],
  '--color-bg-hover': ['#f6f8fa'],
  '--color-bg-active': ['#f6f8fa'],
  '--color-border-subtle': ['#e3e8f0'],
  '--color-text-primary': ['#40464f'],
  '--color-text-secondary': ['#4f5467'],
  '--color-text-tertiary': ['#9a9a9a'],
  '--color-accent': ['rgb(181,54,41)'],
  '--color-ai-user': ['rgb(181,54,41)'],
  '--color-ai-bot': ['#f6f8fa'],
  '--color-code-bg': ['#f6f8fa'],
  '--color-code-header-bg': ['#f6f8fa'],
  '--color-code-text': ['#40464f'],
  '--color-code-muted': ['#4f5467'],
  '--color-code-keyword': ['#6f42c2'],
  '--color-code-string': ['#7aadad'],
  '--color-code-number': ['#8f6aa8'],
  '--color-code-title': ['#b9218e'],
  '--color-code-comment': ['#9a9a9a'],
  '--color-code-attr': ['rgb(181,54,41)'],
  '--color-inline-code-bg': ['#f6f8fa'],
  '--color-inline-code-text': ['rgb(181,54,41)']
};

const JINXIU_ESSAY_MAP = {
  ...JINXIU_MAP,
  '--color-bg-panel': ['#f3f4f4'],
  '--color-bg-hover': ['#f8f8f8'],
  '--color-bg-active': ['#f8f8f8'],
  '--color-code-bg': ['#f8f8f8'],
  '--color-code-header-bg': ['#f8f8f8'],
  '--color-ai-bot': ['#f8f8f8'],
  '--color-inline-code-bg': ['#f8f8f8']
};

const VLOOK_MAP = {
  '--color-bg-base': ['--db'],
  '--color-bg-panel': ['--pn-c'],
  '--color-bg-hover': ['--pn-c-a'],
  '--color-bg-active': ['--pn-c-a'],
  '--color-border-subtle': ['--df04', '--pn-c'],
  '--color-text-primary': ['--df'],
  '--color-text-secondary': ['--df-a'],
  '--color-text-tertiary': ['--df05'],
  '--color-accent': ['--a-c'],
  '--color-ai-user': ['--a-c'],
  '--color-ai-bot': ['--pn-c'],
  '--color-code-bg': ['--bq-bg-fd', '--pn-c'],
  '--color-code-header-bg': ['--pn-c'],
  '--color-code-text': ['--df'],
  '--color-code-muted': ['--df-a'],
  '--color-code-keyword': ['--cm-keyword'],
  '--color-code-string': ['--cm-string'],
  '--color-code-number': ['--cm-number'],
  '--color-code-title': ['--cm-variable-2'],
  '--color-code-comment': ['--cm-comment'],
  '--color-code-attr': ['--cm-attribute'],
  '--color-inline-code-bg': ['--mark-bg'],
  '--color-inline-code-text': ['--a-c']
};

function familyFiles() {
  const list = [];
  for (const f of Object.keys(allTokens)) {
    if (f.includes('themes-live')) continue;
    list.push(f);
  }
  return list;
}

const seen = new Set();
function buildFiles() {
  const files = familyFiles();
  const map = {};
  for (const f of files) {
    if (f.startsWith('Bloom-theme/')) {
      const base = f.replace('Bloom-theme/', '');
      const dark = base.endsWith('-dark.css');
      let color = dark ? base.replace('-dark.css', '') : base.replace('.css', '');
      color = color.replace(/^bloom-/, '');
      const key = `bloom-${color}`;
      map[key] = map[key] || { group: 'Bloom' };
      map[key][dark ? 'dark' : 'light'] = f;
    } else if (f.startsWith('blue-topaz-typora/')) {
      const dark = f.includes('-dark.');
      map['blue-topaz'] = map['blue-topaz'] || {};
      map['blue-topaz'][dark ? 'dark' : 'light'] = f;
    } else if (f.startsWith('claude-typora-theme-v1.0.0/')) {
      const dark = f.includes('-dark.');
      map['claude'] = map['claude'] || {};
      map['claude'][dark ? 'dark' : 'light'] = f;
    } else if (f.startsWith('Konayuki-0.1.2/')) {
      const dark = f.includes('-dark.');
      map['konayuki'] = map['konayuki'] || {};
      map['konayuki'][dark ? 'dark' : 'light'] = f;
    } else if (f.startsWith('LatexTypora-1.5.1/')) {
      if (f.includes('dev')) continue;
      const dark = f.includes('-dark.');
      map['latex'] = map['latex'] || {};
      map['latex'][dark ? 'dark' : 'light'] = f;
    } else if (f.startsWith('LightMindTheme-0.1.4/')) {
      const dark = f.includes('-dark.');
      map['lightmind'] = map['lightmind'] || {};
      map['lightmind'][dark ? 'dark' : 'light'] = f;
    } else if (f.startsWith('MorandiGarden/')) {
      map['morandi'] = { light: f };
    } else if (f === 'rose.css') {
      map['rose'] = { light: f };
    } else if (f.startsWith('Typora_Claude-Like_Theme/')) {
      const name = f.split('/')[1];
      const isDark = name.includes('dark');
      const isGrey = name.includes('grey');
      const key = isGrey ? 'claude-like-grey' : 'claude-like';
      map[key] = map[key] || {};
      map[key][isDark ? 'dark' : 'light'] = f;
      if (isGrey) map[key].group = 'Claude Like';
    } else if (f.startsWith('typora-nocturne-theme-main/')) {
      map['nocturne'] = { dark: f };
    } else if (f.startsWith('typora-theme-animal-island-main/')) {
      const dark = f.includes('-dark.');
      map['animal-island'] = map['animal-island'] || {};
      map['animal-island'][dark ? 'dark' : 'light'] = f;
    } else if (f.startsWith('typora-theme-blue-topaz-main/')) {
      map['blue-topaz-nord'] = { dark: f };
    } else if (f.startsWith('typora-theme-inkwell-main/')) {
      const dark = f.includes('-dark.');
      map['inkwell'] = map['inkwell'] || {};
      map['inkwell'][dark ? 'dark' : 'light'] = f;
    } else if (f.startsWith('typora-theme-pink-hsiao-main/')) {
      map['pink-hsiao'] = { light: f };
    } else if (f.startsWith('typora-theme-Jinxiu-0.2.0/')) {
      const isEssay = f.includes('scu-essay');
      map[isEssay ? 'jinxiu-scu-essay' : 'jinxiu-scu'] = { light: f, group: 'Jinxiu' };
    } else if (f.startsWith('VLOOK-src-V2026.7/released/themes/vlook-')) {
      const baseName = f.split('/').pop();
      if (!baseName.includes('-light.') && !baseName.includes('-dark.')) continue;
      const name = baseName.replace('vlook-', '').replace('-light', '').replace('-dark', '').replace('.css', '');
      for (const s of VLOOK_SERIES) {
        if (name !== s) continue;
        const isDark = baseName.includes('-dark.');
        const key = `vlook-${s}`;
        map[key] = map[key] || {};
        map[key][isDark ? 'dark' : 'light'] = f;
        break;
      }
    }
  }
  return map;
}

const FILE_MAP = buildFiles();

function findMap(themeId) {
  if (themeId === 'jinxiu-scu') return JINXIU_MAP;
  if (themeId === 'jinxiu-scu-essay') return JINXIU_ESSAY_MAP;
  const id = themeId.replace(/-dark$/, '').replace(/-light$/, '').replace(/-grey$/, '');
  const first = id.split('-')[0];
  const exact = FAMILIES.find((f) => id === f.id);
  if (exact) return exact.map;
  const family = FAMILIES.find((f) => first === f.id);
  return family ? family.map : {};
}

function resolveThemeVars(themeId, files) {
  const css = {};
  const tokens = {};
  for (const [mode, rel] of Object.entries(files)) {
    if (mode === 'group' || !rel) continue;
    css[mode] = readFileSync(join(THEMES_DIR, rel), 'utf8');
    tokens[mode] = allTokens[rel] || {};
  }
  const modes = Object.keys(files).filter((m) => m !== 'group');
  const vars = {};
  for (const mode of modes) {
    const t = tokens[mode];
    const c = css[mode];
    // The VLOOK bundles are large and already expose the colors we need as
    // variables. Running the selector regex across those minified files is
    // needlessly expensive and can make generation run out of memory.
    const cm = c.length <= 200_000 ? extractCmColors(c) : {};
    const out = {};
    const map = themeId.startsWith('vlook-') ? VLOOK_MAP : findMap(themeId);    for (const [inkVar, candidates] of Object.entries(map)) {
      let found = null;
      for (const cand of candidates) {
        if (isColor(cand)) {
          found = normalizeHex(cand);
          break;
        }
        if (cand in t) {
          const raw = t[cand];
          let v = resolveVar(raw, t);
          if (v.includes('var(')) v = resolveChannels(v, t);
          if (isColor(v)) {
            found = normalizeHex(v);
            break;
          }
          if (/^[\d\s,]+$/.test(v)) {
            found = `rgb(${v.trim()})`;
            break;
          }
          const hexInside = v.match(/#[0-9a-fA-F]{3,8}\b/);
          if (hexInside) {
            found = normalizeHex(hexInside[0]);
            break;
          }
        }
      }
      out[inkVar] = found;
    }
    if (cm) {
      const cmMap = {
        '--color-code-keyword': ['keyword', 'builtin'],
        '--color-code-string': ['string', 'string-2'],
        '--color-code-number': ['number', 'atom'],
        '--color-code-title': ['def', 'type', 'variable-2'],
        '--color-code-comment': ['comment'],
        '--color-code-attr': ['attribute', 'property', 'variable-3', 'tag']
      };
      for (const [inkVar, cls] of Object.entries(cmMap)) {
        if (!out[inkVar]) {
          for (const c of cls) {
            if (cm[c]) {
              out[inkVar] = cm[c];
              break;
            }
          }
        }
      }
    }
    vars[mode] = out;
  }
  return vars;
}

const themes = [];
for (const [id, files] of Object.entries(FILE_MAP)) {
  const group = files.group || inferGroup(id);
  const vars = resolveThemeVars(id, files);
  const modes = Object.keys(files);
  for (const mode of modes) {
    const v = vars[mode];
    if (!v || !v['--color-bg-base']) continue;
    const themeId = mode === 'light' ? id : `${id}-dark`;
    const dark = mode === 'dark';
    // derive missing colors
    const bg = v['--color-bg-base'] || '#ffffff';
    const text = v['--color-text-primary'] || '#1f1f1f';
    v['--color-bg-panel'] = v['--color-bg-panel'] || mix(bg, text, 0.04);
    v['--color-bg-hover'] = v['--color-bg-hover'] || mix(bg, text, 0.06);
    v['--color-bg-active'] = v['--color-bg-active'] || mix(bg, text, 0.1);
    v['--color-border-subtle'] = v['--color-border-subtle'] || (dark ? withAlpha(bg, 0.3) : mix(bg, text, 0.18));
    v['--color-text-secondary'] = v['--color-text-secondary'] || (dark ? '#b9c2cf' : '#6b6b6b');
    v['--color-text-tertiary'] = v['--color-text-tertiary'] || withAlpha(text, 0.55);
    v['--color-accent'] = v['--color-accent'] || (dark ? '#0a84ff' : '#007aff');
    v['--color-ai-user'] = v['--color-ai-user'] || v['--color-accent'];
    v['--color-ai-bot'] = v['--color-ai-bot'] || v['--color-bg-panel'];
    v['--color-code-bg'] = v['--color-code-bg'] || (dark ? mix(bg, text, 0.06) : mix(bg, text, 0.03));
    v['--color-code-header-bg'] = v['--color-code-header-bg'] || (dark ? mix(bg, text, 0.1) : mix(bg, text, 0.06));
    v['--color-code-text'] = v['--color-code-text'] || text;
    v['--color-code-muted'] = v['--color-code-muted'] || v['--color-text-tertiary'];
    v['--color-code-keyword'] = v['--color-code-keyword'] || v['--color-accent'];
    v['--color-code-string'] = v['--color-code-string'] || v['--color-accent'];
    v['--color-code-number'] = v['--color-code-number'] || v['--color-accent'];
    v['--color-code-title'] = v['--color-code-title'] || v['--color-accent'];
    v['--color-code-comment'] = v['--color-code-comment'] || v['--color-code-muted'];
    v['--color-code-attr'] = v['--color-code-attr'] || v['--color-accent'];
    v['--color-inline-code-bg'] = v['--color-inline-code-bg'] || v['--color-code-bg'];
    v['--color-inline-code-text'] = v['--color-inline-code-text'] || v['--color-accent'];
    const sourceRel = files[mode];
    const content = buildScopedContentCss({
      css: readFileSync(join(THEMES_DIR, sourceRel), 'utf8'),
      themeId,
      sourcePath: join(THEMES_DIR, sourceRel),
      tokens: allTokens[sourceRel] || {}
    });
    themes.push({
      id: themeId,
      group,
      dark,
      variables: v,
      files: sourceRel,
      contentCss: content.css,
      semanticRuleCount: content.semanticRuleCount,
      contentVariableCount: content.variableCount
    });
  }
}

// -------- emit --------
const FONT_READING = 'var(--font-sans)';
const FONT_EDITOR = 'var(--font-mono)';

const lines = [
  '// AUTO-GENERATED by scripts/generate_typora_themes.mjs — do not edit.',
  '// Run `node scripts/generate_typora_themes.mjs` after adding/changing Typora themes.',
  'export type GeneratedThemeId =',
  ...themes.map((theme) => `  | '${theme.id}'`),
  ';',
  '',
  'export interface GeneratedThemeMeta {',
  '  id: GeneratedThemeId;',
  '  name: string;',
  '  groupZh: string;',
  '  groupEn: string;',
  '  descriptionZh: string;',
  '  descriptionEn: string;',
  '  dark: boolean;',
  '  swatches: string[];',
  '}',
  '',
  'export interface GeneratedTheme {',
  '  meta: GeneratedThemeMeta;',
  '  variables: Record<string, string>;',
  '  contentCss: string;',
  '}',
  ''
];

const metaNames = {
  bloom: 'Bloom', 'blue-topaz': 'Blue Topaz', claude: 'Claude', konayuki: 'Konayuki',
  latex: 'LaTeX Typora', lightmind: 'LightMind', morandi: 'Morandi Garden', rose: 'Rose',
  'claude-like': 'Claude Like', 'claude-like-grey': 'Claude Like Grey', nocturne: 'Nocturne',
  'animal-island': 'Animal Island', 'blue-topaz-nord': 'Blue Topaz Nord', inkwell: 'Inkwell',
  'pink-hsiao': 'Pink Hsiao', 'jinxiu-scu': 'Jinxiu SCU', 'jinxiu-scu-essay': 'Jinxiu SCU Essay',
  'vlook-fancy': 'VLOOK Fancy', 'vlook-geek': 'VLOOK Geek', 'vlook-hope': 'VLOOK Hope',
  'vlook-joint': 'VLOOK Joint', 'vlook-note': 'VLOOK Note', 'vlook-solaris': 'VLOOK Solaris',
  'vlook-thinking': 'VLOOK Thinking'
};

const BLOOM_NAMES = {
  amber: 'Amber', cinnabar: 'Cinnabar', ink: 'Ink', lapis: 'Lapis', mist: 'Mist', petal: 'Petal',
  ripple: 'Ripple', sage: 'Sage', spring: 'Spring', stone: 'Stone', verdant: 'Verdant', wheat: 'Wheat'
};

const groups = {
  bloom: ['Bloom', 'Bloom'], 'blue-topaz': ['Blue Topaz', 'Blue Topaz'], claude: ['Claude', 'Claude'],
  konayuki: ['Konayuki', 'Konayuki'], latex: ['LaTeX', 'LaTeX'], lightmind: ['LightMind', 'LightMind'],
  morandi: ['莫兰迪花园', 'Morandi Garden'], rose: ['玫瑰', 'Rose'], 'claude-like': ['Claude 风格', 'Claude Like'],
  'claude-like-grey': ['Claude 风格', 'Claude Like'], nocturne: ['夜曲', 'Nocturne'],
  'animal-island': ['动物岛', 'Animal Island'], 'blue-topaz-nord': ['蓝宝石 Nord', 'Blue Topaz Nord'],
  inkwell: ['墨水瓶', 'Inkwell'], 'pink-hsiao': ['粉红晓', 'Pink Hsiao'],
  'jinxiu-scu': ['锦绣', 'Jinxiu'], 'jinxiu-scu-essay': ['锦绣', 'Jinxiu'],
  'vlook-fancy': ['VLOOK', 'VLOOK'], 'vlook-geek': ['VLOOK', 'VLOOK'], 'vlook-hope': ['VLOOK', 'VLOOK'],
  'vlook-joint': ['VLOOK', 'VLOOK'], 'vlook-note': ['VLOOK', 'VLOOK'], 'vlook-solaris': ['VLOOK', 'VLOOK'],
  'vlook-thinking': ['VLOOK', 'VLOOK']
};

function inferGroup(id) {
  const base = id.replace(/-dark$/, '');
  return base;
}

for (const theme of themes) {
  const baseId = theme.id.replace(/-dark$/, '');
  const bloomColor = baseId.replace(/^bloom-/, '');
  const name = baseId.startsWith('bloom-') && BLOOM_NAMES[bloomColor]
    ? `Bloom ${BLOOM_NAMES[bloomColor]}`
    : metaNames[baseId] || baseId;
  const modeLabel = theme.dark ? '深色' : '浅色';
  const g = baseId.startsWith('bloom-') ? ['Bloom', 'Bloom'] : (groups[baseId] || [baseId, baseId]);
  const swatches = [
    theme.variables['--color-bg-base'],
    theme.variables['--color-bg-panel'],
    theme.variables['--color-accent'],
    theme.variables['--color-code-bg']
  ].filter(Boolean);
  lines.push(`export const theme_${theme.id.replace(/-/g, '_')}: GeneratedTheme = {`);
  lines.push('  meta: {');
  lines.push(`    id: '${theme.id}',`);
  lines.push(`    name: '${name} ${modeLabel}',`);
  lines.push(`    groupZh: '${g[0]}',`);
  lines.push(`    groupEn: '${g[1]}',`);
  lines.push(`    descriptionZh: '由 Typora 主题「${name}」适配而来。',`);
  lines.push(`    descriptionEn: 'Adapted from the Typora theme "${name}".',`);
  lines.push(`    dark: ${theme.dark},`);
  lines.push(`    swatches: ${JSON.stringify(swatches)},`);
  lines.push('  },');
  lines.push('  variables: {');
  lines.push(`    '--font-reading': ${JSON.stringify(FONT_READING)},`);
  lines.push(`    '--font-editor': ${JSON.stringify(FONT_EDITOR)},`);
  for (const [k, v] of Object.entries(theme.variables)) {
    if (!v) continue;
    lines.push(`    '${k}': ${JSON.stringify(v)},`);
  }
  lines.push('  },');
  lines.push(`  contentCss: ${JSON.stringify(theme.contentCss)},`);
  lines.push('};');
  lines.push('');
}

lines.push('export const GENERATED_THEMES: GeneratedTheme[] = [');
for (const theme of themes) {
  lines.push(`  theme_${theme.id.replace(/-/g, '_')},`);
}
lines.push('];');
lines.push('');

writeFileSync(OUT, lines.join('\n'));
console.log(`Wrote ${themes.length} themes -> ${OUT}`);
const darkCount = themes.filter((t) => t.dark).length;
console.log(`  light: ${themes.length - darkCount}, dark: ${darkCount}`);
console.log(`  semantic rules: ${themes.reduce((sum, theme) => sum + theme.semanticRuleCount, 0)}`);
console.log(`  scoped source variables: ${themes.reduce((sum, theme) => sum + theme.contentVariableCount, 0)}`);
