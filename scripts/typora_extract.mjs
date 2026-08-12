#!/usr/bin/env node
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';

const ROOT = process.cwd();
const THEMES_DIR = join(ROOT, 'Typora主题');
const OUT_DIR = join(ROOT, 'tmp', 'typora-dump');
mkdirSync(OUT_DIR, { recursive: true });

const SKIP_DIRS = new Set(['.git', 'node_modules', '.vscode', 'assets', 'docs', 'images']);
const SKIP_FILES = /\.(woff2?|ttf|eot|otf|png|jpg|jpeg|gif|svg|ico|zip|md|txt|json|js|mjs|ts)$/i;
const DEDUP_DIRS = new Set(['released/themes', 'docs/V2026.7']);

function listCss(dir, rel = '') {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      const sub = rel ? `${rel}/${e.name}` : e.name;
      if (DEDUP_DIRS.has(sub)) continue;
      out.push(...listCss(join(dir, e.name), sub));
    } else if (e.name.toLowerCase().endsWith('.css')) {
      if (SKIP_FILES.test(e.name)) continue;
      out.push({ path: join(dir, e.name), rel: rel ? `${rel}/${e.name}` : e.name });
    }
  }
  return out;
}

function extractTokens(css) {
  // Typora themes commonly provide a light, paper-friendly palette inside
  // `@media print`. Those declarations must not replace the on-screen theme
  // tokens (especially for dark themes).
  css = stripAtRule(css, 'media', (prelude) => /\bprint\b/i.test(prelude));
  const tokens = {};
  const re = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;{}]+);/g;
  let m;
  while ((m = re.exec(css))) {
    tokens[m[1]] = m[2].trim().replace(/\/\*[\s\S]*?\*\//g, '').trim();
  }
  return tokens;
}

function stripAtRule(css, ruleName, shouldStrip) {
  const lower = css.toLowerCase();
  const needle = `@${ruleName.toLowerCase()}`;
  let result = '';
  let cursor = 0;

  while (cursor < css.length) {
    const start = lower.indexOf(needle, cursor);
    if (start < 0) {
      result += css.slice(cursor);
      break;
    }

    const open = css.indexOf('{', start + needle.length);
    if (open < 0) {
      result += css.slice(cursor);
      break;
    }
    const prelude = css.slice(start + needle.length, open);
    if (!shouldStrip(prelude)) {
      result += css.slice(cursor, open + 1);
      cursor = open + 1;
      continue;
    }

    let depth = 1;
    let quote = '';
    let escaped = false;
    let end = open + 1;
    for (; end < css.length && depth > 0; end += 1) {
      const char = css[end];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (quote) {
        if (char === quote) quote = '';
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
      }
    }
    result += css.slice(cursor, start);
    cursor = end;
  }

  return result;
}

const files = listCss(THEMES_DIR);
const all = {};
const summary = [];
for (const f of files) {
  const css = readFileSync(f.path, 'utf8');
  const tokens = extractTokens(css);
  all[f.rel] = tokens;
  const codeTokens = Object.keys(tokens).filter(k => /(^--(cm|code)|token|syntax|inline)/i.test(k));
  summary.push({
    file: f.rel,
    totalTokens: Object.keys(tokens).length,
    codeTokens: codeTokens.length,
  });
}

writeFileSync(join(OUT_DIR, 'all-tokens.json'), JSON.stringify(all, null, 2));
writeFileSync(join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`Extracted ${files.length} files -> tmp/typora-dump/all-tokens.json`);
console.log(`Theme files with CSS variables: ${summary.filter((item) => item.totalTokens > 0).length}`);
