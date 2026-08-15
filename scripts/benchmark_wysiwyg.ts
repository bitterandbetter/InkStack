import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { buildMarkdownDocumentIndex, buildWysiwygDecorations } from '../src/features/wysiwyg';

const sections = 600;
const source = Array.from({ length: sections }, (_, index) => `
## 长文档章节 ${index + 1}

这是包含 **粗体**、*斜体*、[链接](https://example.com/${index + 1}) 和 \`行内代码\` 的正文。

- [${index % 2 ? 'x' : ' '}] 任务 ${index + 1}
- 列表项目 ${index + 1}

| 名称 | 数值 |
| :--- | ---: |
| 项目 ${index + 1} | ${index + 1} |
`).join('\n');

const state = EditorState.create({
  doc: source,
  selection: { anchor: source.length },
  extensions: [markdown()]
});

const startedAt = performance.now();
const index = buildMarkdownDocumentIndex(state);
const indexedAt = performance.now();
const decorations = buildWysiwygDecorations(state, { documentPath: '', locale: 'zh' });
const finishedAt = performance.now();
const totalMs = finishedAt - startedAt;

if (index.nodes.length < sections * 3) {
  throw new Error(`WYSIWYG index incomplete: expected at least ${sections * 3} nodes, received ${index.nodes.length}`);
}
if (decorations.size === 0) throw new Error('WYSIWYG decoration benchmark produced no decorations');
if (totalMs > 3000) throw new Error(`WYSIWYG benchmark exceeded 3000 ms: ${totalMs.toFixed(1)} ms`);

console.log(JSON.stringify({
  lines: state.doc.lines,
  characters: state.doc.length,
  nodes: index.nodes.length,
  decorations: decorations.size,
  indexMs: Number((indexedAt - startedAt).toFixed(1)),
  decorationMs: Number((finishedAt - indexedAt).toFixed(1)),
  totalMs: Number(totalMs.toFixed(1))
}, null, 2));
