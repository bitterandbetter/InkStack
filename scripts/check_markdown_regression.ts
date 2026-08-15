import fs from 'node:fs';
import path from 'node:path';
import {
  buildHeadingIndex,
  preparePreviewMarkdown,
  stripFrontMatter,
  TOC_PLACEHOLDER,
  transformDefinitionLists
} from '../src/features/preview/markdownPipeline';
import { parseCodeBlocks, parseOutline } from '../src/lib/outline';

const root = process.cwd();
const fixturePath = path.join(root, 'tests/fixtures/InkStack功能测试.md');
const raw = fs.readFileSync(fixturePath, 'utf8');
const stripped = stripFrontMatter(raw);
const prepared = preparePreviewMarkdown(raw);
const headings = buildHeadingIndex(prepared);
const codeBlocks = parseCodeBlocks(raw);
const outline = parseOutline(raw);

const checks: Array<[string, boolean, string?]> = [
  [
    'front matter is stripped before preview',
    !stripped.includes('description: 这段 front matter 应该在预览中隐藏')
  ],
  [
    'TOC placeholder is injected',
    prepared.includes(TOC_PLACEHOLDER)
  ],
  [
    'duplicate heading slugs are unique',
    hasSlug('重复标题') && hasSlug('重复标题', 2) && hasSlug('重复锚点') && hasSlug('重复锚点', 2)
  ],
  [
    'relative and missing images stay in preview markdown',
    prepared.includes('./assets/inkstack-test-image.svg') && prepared.includes('./assets/missing-image-for-regression.png')
  ],
  [
    'table fixture is present',
    prepared.includes('| Front matter 隐藏 | 查看预览顶部 | 不显示 YAML 元数据 | 待检查 |')
  ],
  [
    'mermaid fixture is present and parsed as a code block',
    codeBlocks.some((block) => block.language === 'mermaid' && block.code.includes('flowchart TD'))
  ],
  [
    'typescript and python code blocks are parsed',
    codeBlocks.some((block) => block.language === 'ts') && codeBlocks.some((block) => block.language === 'python')
  ],
  [
    'code symbols are extracted for outline',
    outline.some((item) => item.type === 'symbol' && item.text === 'MarkdownDocument')
      && outline.some((item) => item.type === 'symbol' && item.text === 'createDocumentSummary()')
      && outline.some((item) => item.type === 'symbol' && item.text === 'WorkspaceIndex')
      && outline.some((item) => item.type === 'symbol' && item.text === 'summarize_workspace()')
  ],
  [
    'math fixture is preserved',
    prepared.includes('$E = mc^2$') && prepared.includes('\\int_0^1 x^2 dx')
  ],
  [
    'task list fixture is preserved',
    prepared.includes('- [x] Markdown 原生文件') && prepared.includes('- [ ] 工作区级 AI 知识库')
  ],
  [
    'footnote fixture is preserved',
    prepared.includes('[^inkstack-footnote]') && prepared.includes('[^inkstack-footnote]: 脚注应渲染在文档底部')
  ],
  [
    'definition lists are transformed to sanitized preview HTML',
    transformDefinitionLists(stripped).includes('<dl class="inkstack-definition-list">')
      && transformDefinitionLists(stripped).includes('<dt>InkStack</dt>')
      && transformDefinitionLists(stripped).includes('<dd>本地优先、AI 原生的 Markdown 桌面编辑器。</dd>')
  ],
];

let failed = 0;
for (const [name, passed, detail] of checks) {
  if (passed) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ''}`);
  }
}

if (failed > 0) {
  console.error(`\nMarkdown regression checks failed: ${failed}/${checks.length}`);
  process.exit(1);
}

console.log(`\nMarkdown regression checks passed: ${checks.length}/${checks.length}`);

function hasSlug(text: string, duplicateIndex = 1) {
  const base = slugifyForFixture(text);
  const slug = duplicateIndex === 1 ? base : `${base}-${duplicateIndex}`;
  return headings.some((heading) => heading.text === text && heading.slug === slug);
}

function slugifyForFixture(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'heading';
}
