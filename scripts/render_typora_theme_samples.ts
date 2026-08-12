import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { GENERATED_THEMES } from '../src/lib/themes.generated';

const root = process.cwd();
const outputDir = path.join(root, 'tmp', 'typora-theme-samples');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const requestedIds = process.argv.slice(2);
const ids = requestedIds.includes('--all')
  ? GENERATED_THEMES.map((theme) => theme.meta.id)
  : requestedIds.length > 0
  ? requestedIds
  : ['bloom-amber', 'animal-island', 'jinxiu-scu', 'vlook-fancy-dark'];

mkdirSync(outputDir, { recursive: true });

for (const id of ids) {
  const theme = GENERATED_THEMES.find((item) => item.meta.id === id);
  if (!theme) throw new Error(`Unknown generated theme: ${id}`);

  const htmlPath = path.join(outputDir, `${id}.html`);
  const screenshotPath = path.join(outputDir, `${id}.png`);
  const variables = Object.entries(theme.variables)
    .map(([name, value]) => `${name}:${value};`)
    .join('');
  writeFileSync(htmlPath, `<!doctype html>
<html data-inkstack-theme="${id}">
<head>
<meta charset="utf-8">
<style>
html{${variables}background:var(--color-bg-base);color:var(--color-text-primary)}
*{box-sizing:border-box}body{margin:0;background:var(--color-bg-base);color:var(--color-text-primary)}
.inkstack-reading-surface{width:760px;margin:0 auto;padding:48px 56px;font:16px/1.75 var(--font-reading);}
.inkstack-reading-surface img{max-width:100%}.inkstack-reading-surface a{text-decoration:none}
.inkstack-reading-surface [data-inkstack-preview="table"]{overflow:hidden}.inkstack-reading-surface table{width:100%}
.inkstack-inline-code{background:var(--color-inline-code-bg);color:var(--color-inline-code-text);padding:.15em .35em;border-radius:4px}
${theme.contentCss}
</style>
</head>
<body><main class="inkstack-reading-surface">
<h1 id="title"><a href="#title">墨栈主题完整适配</a></h1>
<p>这是一段用于检查正文排版、<strong>粗体强调</strong>、<em>斜体文字</em>、<mark>高亮标记</mark>与<a href="#">链接样式</a>的示例文字。</p>
<h2 id="section"><a href="#section">二级标题与章节装饰</a></h2>
<p>主题应保留原 Typora 设计中的字号、字重、间距、边框、背景、渐变和伪元素，而不仅仅是替换颜色。</p>
<h3 id="lists"><a href="#lists">三级标题与列表</a></h3>
<ul><li>无序列表项目<ul><li>嵌套项目与标记</li></ul></li><li class="task-list-item"><input type="checkbox" checked> 已完成任务</li></ul>
<ol><li>有序列表第一项</li><li>有序列表第二项</li></ol>
<blockquote><p>引用块应该继承原主题的背景、边框、圆角、间距和装饰效果。</p></blockquote>
<h4 id="table"><a href="#table">四级标题、代码与表格</a></h4>
<p>正文中的 <code class="inkstack-inline-code">const theme = 'typora'</code> 应使用主题自己的行内代码样式。</p>
<div data-inkstack-preview="table"><table><thead><tr><th>元素</th><th>适配内容</th></tr></thead><tbody><tr><td>标题</td><td>六级标题与装饰</td></tr><tr><td>正文</td><td>链接、列表、引用、代码、表格</td></tr></tbody></table></div>
<hr><h5 id="h5"><a href="#h5">五级标题</a></h5><h6 id="h6"><a href="#h6">六级标题</a></h6>
</main></body></html>`, 'utf8');

  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--allow-file-access-from-files',
    '--window-size=1000,1200',
    `--screenshot=${screenshotPath}`,
    pathToFileURL(htmlPath).href
  ], { stdio: 'ignore' });
  console.log(`Rendered ${id}: ${path.relative(root, screenshotPath)}`);
}
