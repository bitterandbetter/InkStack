import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const base = path.join(root, 'Typora主题');

const EXCLUDE_DIRS = new Set(['.DS_Store', 'bloom', 'claude_fonts', 'latex_fonts', 'fonts', 'img', 'docs', 'plugin', 'plugin-live', 'samples', 'source', 'submission', 'template', 'preview', 'showcase', 'screenshots', 'morandigarden', 'nocturne', 'pink-hsiao', 'blue-topaz', 'vlook']);
const EXCLUDE_FILES = new Set(['font.css', 'latex-dev-dark.css']);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      out.push(...walk(full));
    } else if (entry.isFile() && entry.name.endsWith('.css') && !EXCLUDE_FILES.has(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// Deduplicate VLOOK: released/themes == docs/V2026.7, skip top-level released
const files = walk(base).filter((f) => {
  if (f.includes(`${path.sep}released${path.sep}`) && f.includes('VLOOK')) return false;
  if (f.includes(`${path.sep}docs${path.sep}`) && f.includes('VLOOK')) return false;
  return true;
});

const inventory = files.map((f) => {
  const rel = path.relative(base, f);
  const content = fs.readFileSync(f, 'utf8');
  const tokens = [...content.matchAll(/--([a-zA-Z0-9-]+)\s*:\s*([^;{}]+);/g)]
    .map((m) => ({ name: m[1], value: m[2].trim() }));
  const hasDark = /dark|nocturne/i.test(rel);
  return { rel, tokens, hasDark };
});

console.log('TOTAL:', inventory.length);
for (const it of inventory) {
  console.log(`${it.hasDark ? 'D' : ' '} ${it.rel}  (${it.tokens.length} tokens)`);
}
