import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import postcss from 'postcss';

const CONTENT_TAG = /(^|[\s>+~,(])(?:h[1-6]|p|a|strong|b|em|i|del|s|mark|kbd|blockquote|ul|ol|li|table|thead|tbody|tfoot|tr|th|td|hr|img|figure|figcaption|details|summary|dl|dt|dd|sup|sub|code|pre)(?=$|[\s>+~.#:[,)])/i;
const CONTENT_CLASS = /\.(?:task-list-item|contains-task-list|footnotes?|footnote-ref|footnote-backref|katex(?:-display)?|math-display|math-inline)\b/i;
const TYPORA_EDITOR_UI = /(?:CodeMirror|md-toc|md-outline|md-table-edit|md-meta|md-alert|md-fences|md-diagram|md-focus|md-expand|md-image|md-content|md-hover-tip|md-tooltip|md-search|md-notification|typora-|megamenu|context-menu|sidebar|outline-content|file-list|file-node|footer-item|toolbar|popover|modal|quick-open|auto-suggest|spell-check|ty-)/i;
const ROOT_LAYOUT_PROPERTIES = new Set([
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'position', 'inset', 'top', 'right', 'bottom', 'left', 'overflow', 'overflow-x', 'overflow-y'
]);
const MIME_TYPES = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};
const MAX_INLINE_ASSET_BYTES = 256 * 1024;

export function buildScopedContentCss({ css, themeId, sourcePath, tokens }) {
  const scope = `html[data-inkstack-theme="${themeId}"] .inkstack-reading-surface`;
  const sourceRoot = postcss.parse(css, { from: sourcePath });
  const output = postcss.root();
  const referencedVariables = new Set();
  let semanticRuleCount = 0;

  sourceRoot.walkRules((rule) => {
    if (isInsideSkippedAtRule(rule)) return;
    const mappedSelectors = rule.selectors
      .map((selector) => translateSelector(selector, scope))
      .filter(Boolean);
    if (mappedSelectors.length === 0) return;

    const mappedRule = postcss.rule({ selector: mappedSelectors.join(',\n') });
    const isRootRule = mappedSelectors.every((selector) => selector === scope);
    rule.nodes?.forEach((node) => {
      if (node.type !== 'decl') return;
      if (isRootRule && ROOT_LAYOUT_PROPERTIES.has(node.prop.toLowerCase())) return;
      const value = rewriteAssetUrls(node.value, sourcePath);
      if (value === null) return;
      collectVariableReferences(value, referencedVariables);
      mappedRule.append(node.clone({ value }));
    });
    if (!mappedRule.nodes?.length) return;

    appendWithSupportedAncestors(output, rule, mappedRule);
    semanticRuleCount += 1;
  });

  // Typora themes lean heavily on :root custom properties. Include the
  // transitive closure used by the adapted semantic rules, without copying
  // unrelated editor/sidebar variables into InkStack.
  const variableDeclarations = [];
  const pending = [...referencedVariables];
  const emitted = new Set();
  while (pending.length > 0) {
    const name = pending.pop();
    if (!name || emitted.has(name) || !(name in tokens)) continue;
    const value = rewriteAssetUrls(String(tokens[name]), sourcePath);
    if (value === null) continue;
    emitted.add(name);
    variableDeclarations.push(postcss.decl({ prop: name, value }));
    const nested = new Set();
    collectVariableReferences(value, nested);
    pending.push(...nested);
  }

  if (variableDeclarations.length > 0) {
    const variablesRule = postcss.rule({ selector: scope });
    variablesRule.append(variableDeclarations.sort((a, b) => a.prop.localeCompare(b.prop)));
    output.prepend(variablesRule);
  }

  // Preview headings contain an anchor for navigation. Typora's heading
  // selectors assume plain text children, so make the anchor inherit the
  // adapted heading appearance.
  output.prepend(`${scope} :where(h1,h2,h3,h4,h5,h6) > a { color: inherit; font: inherit; letter-spacing: inherit; text-decoration: inherit; }`);
  // React renders native checkbox inputs. Typora themes often fake a checkbox
  // with input pseudo-elements, which WebKit/Chromium position against the
  // page rather than the list item outside Typora's editor DOM.
  output.append(`${scope} .task-list-item input[type="checkbox"] { appearance: auto; position: static; width: 1em; height: 1em; margin: 0 .55em 0 0; accent-color: var(--color-accent); transform: translateY(.08em); }`);

  return {
    css: output.toString(),
    semanticRuleCount,
    variableCount: emitted.size
  };
}

function translateSelector(original, scope) {
  let selector = original.trim();
  if (!selector || selector.includes('@')) return '';
  // Custom properties are added below by dependency closure. Copying :root
  // wholesale would pull Typora's editor/plugin state and large unused icons
  // into every InkStack theme.
  if (/^(?::root|html)$/i.test(selector)) return '';
  if (/input[^,]*::(?:before|after)\b/i.test(selector)) return '';

  selector = selector
    .replace(/pre(?:\.md-fences|\[mdtype=["']?fences["']?\])/gi, '.inkstack-code-surface')
    .replace(/\.md-fences\b/gi, '.inkstack-code-surface')
    .replace(/\.inkstack-code-surface\s+\.CodeMirror-(?:scroll|sizer|lines)\b/gi, '.inkstack-code-surface pre')
    .replace(/\.inkstack-code-surface\s+\.CodeMirror-code\b/gi, '.inkstack-code-surface code')
    .replace(/(?:span)?\[md-inline=["']?code["']?\]\s*>?\s*code/gi, '.inkstack-inline-code')
    .replace(/(?:span\.)?md-inline-code\s*>?\s*code/gi, '.inkstack-inline-code')
    .replace(/\.md-math-block\b|\.mathjax-block\b/gi, '.katex-display')
    .replace(/\.md-inline-math\b/gi, '.katex');

  if (TYPORA_EDITOR_UI.test(selector)) return '';

  const hadWriteRoot = /#write\b/.test(selector);
  selector = selector
    .replace(/(?:\.typora-export\s+)?content\s*>\s*#write\b/gi, scope)
    .replace(/\.typora-export\s+#write\b/gi, scope)
    .replace(/#write\b/gi, scope)
    .replace(/^\s*(?:html\s+)?body\b/i, scope)
    .trim();

  if (selector === scope || selector.startsWith(`${scope} `) || selector.startsWith(`${scope}>`) || selector.startsWith(`${scope}:`)) {
    return selector;
  }

  if (hadWriteRoot) return '';
  if (!CONTENT_TAG.test(selector) && !CONTENT_CLASS.test(selector)) return '';
  return `${scope} ${selector}`;
}

function isInsideSkippedAtRule(node) {
  let parent = node.parent;
  while (parent) {
    if (parent.type === 'atrule') {
      const name = parent.name.toLowerCase();
      if (name === 'keyframes' || name.endsWith('keyframes')) return true;
      if (name === 'media' && /\bprint\b/i.test(parent.params)) return true;
    }
    parent = parent.parent;
  }
  return false;
}

function appendWithSupportedAncestors(output, sourceRule, mappedRule) {
  const ancestors = [];
  let parent = sourceRule.parent;
  while (parent) {
    if (parent.type === 'atrule' && ['media', 'supports', 'container'].includes(parent.name.toLowerCase())) {
      ancestors.unshift({ name: parent.name, params: parent.params });
    }
    parent = parent.parent;
  }

  let node = mappedRule;
  for (const ancestor of ancestors.reverse()) {
    const wrapper = postcss.atRule(ancestor);
    wrapper.append(node);
    node = wrapper;
  }
  output.append(node);
}

function collectVariableReferences(value, output) {
  for (const match of String(value).matchAll(/var\(\s*(--[\w-]+)/g)) {
    output.add(match[1]);
  }
}

function rewriteAssetUrls(value, sourcePath) {
  let invalid = false;
  const rewritten = String(value).replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (match, _quote, rawUrl) => {
    const url = rawUrl.trim();
    if (/^(?:data:|https?:|blob:|#)/i.test(url)) return match;
    const cleanUrl = decodeURIComponent(url.split(/[?#]/)[0]);
    const assetPath = resolve(dirname(sourcePath), cleanUrl);
    const mime = MIME_TYPES[extname(assetPath).toLowerCase()];
    if (!mime || !existsSync(assetPath)) {
      invalid = true;
      return match;
    }
    const buffer = readFileSync(assetPath);
    if (buffer.byteLength > MAX_INLINE_ASSET_BYTES) {
      invalid = true;
      return match;
    }
    return `url("data:${mime};base64,${buffer.toString('base64')}")`;
  });
  return invalid ? null : rewritten;
}
