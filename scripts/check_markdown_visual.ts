import fs from 'node:fs';
import path from 'node:path';
import { parseCodeBlocks } from '../src/lib/outline';

const root = process.cwd();
const fixturePath = path.join(root, 'tests/fixtures/InkStack功能测试.md');
const cssPath = path.join(root, 'src/index.css');
const outputDir = path.join(root, 'tmp');
const outputPath = path.join(outputDir, 'markdown-visual-regression.html');

const markdown = fs.readFileSync(fixturePath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const codeBlocks = parseCodeBlocks(markdown);

const hasMermaid = codeBlocks.some((block) => block.language === 'mermaid' && block.code.includes('flowchart TD'));
const hasCode = codeBlocks.some((block) => block.language === 'ts') && codeBlocks.some((block) => block.language === 'python');
const hasTable = markdown.includes('| Front matter 隐藏 | 查看预览顶部 | 不显示 YAML 元数据 | 待检查 |');
const hasMissingImage = markdown.includes('./assets/missing-image-for-regression.png');
const hasCodeThemeVariables = [
  '--color-code-bg',
  '--color-code-header-bg',
  '--color-code-text',
  '--color-code-keyword',
  '--color-code-string',
  '--color-code-comment'
].every((token) => css.includes(token));
const hasExpandedBuiltInThemes = [
  'github',
  'notion',
  'newsprint',
  'solarized',
  'nord',
  'dracula',
  'everforest',
  'flexoki',
  'academic'
].every((themeId) => sourceIncludes('src/lib/themes.ts', `'${themeId}'`)
  && sourceIncludes('src/index.css', `data-inkstack-theme="${themeId}"`));
const hasPreviewMarkers = [
  'data-inkstack-preview="code-block"',
  'data-inkstack-preview="code-surface"',
  'data-inkstack-preview="missing-image"',
  'data-inkstack-preview="table"',
  'data-inkstack-preview="mermaid"'
].every((marker) => findSourceMarker(marker));
const hasTauriRuntimeGuard = sourceIncludes('src/lib/tauriRuntime.ts', 'isTauriRuntime')
  && sourceIncludes('src/App.tsx', 'DesktopRuntimeRequired')
  && sourceIncludes('src/App.tsx', 'npm run tauri:dev')
  && sourceIncludes('src/App.tsx', 'if (!isTauriRuntime())');
const hasRootViewportLock = sourceIncludes('src/index.css', 'html,\n  body,\n  #root')
  && sourceIncludes('src/index.css', 'overflow: hidden;')
  && sourceIncludes('src/App.tsx', 'h-[100dvh]')
  && sourceIncludes('src/App.tsx', 'min-h-0 flex-1');
const hasThemePanels = sourceIncludes('src/components/AiSettingsPanel.tsx', 'AICodeMirror API');
const hasAiContextBudgetWarning = sourceIncludes('src/components/AiContextDialog.tsx', 'tokens > 12_000')
  && sourceIncludes('src/components/AiContextDialog.tsx', 'context is large');
const hasDesktopCodeView = sourceIncludes('src/components/CodeBlocksPanel.tsx', 'Diff previous')
  && sourceIncludes('src/components/AIPanel.tsx', '<CodeBlocksPanel');
const hasViewShortcutOrder = sourceIncludes('src-tauri/src/lib.rs', 'with_id("view-edit", "编辑视图")')
  && sourceIncludes('src-tauri/src/lib.rs', 'accelerator("CmdOrCtrl+1")')
  && sourceIncludes('src/lib/appCommands.ts', "'view-edit': 'Cmd/Ctrl+1'")
  && sourceIncludes('src/lib/appCommands.ts', "'view-code': 'Cmd/Ctrl+4'")
  && orderedSourceIncludes('src/components/CommandPalette.tsx', [
    "id: 'view-edit'",
    "id: 'view-split'",
    "id: 'view-read'",
    "id: 'view-code'"
  ]);
const hasDesktopRuntimeListenersGuarded = [
  'src/hooks/useDesktopEvents.ts',
  'src/components/EditorPane.tsx'
].every((file) => sourceIncludes(file, 'isTauriRuntime()'));
const hasWorkspaceCommandsSplit = sourceIncludes('src-tauri/src/workspace_commands.rs', 'pub async fn scan_directory')
  && sourceIncludes('src-tauri/src/lib.rs', 'mod workspace_commands;')
  && sourceIncludes('src-tauri/src/lib.rs', 'workspace_commands::create_workspace_markdown_file');
const hasAiProvidersSplit = sourceIncludes('src-tauri/src/ai_providers.rs', 'pub async fn request_openai_compatible')
  && sourceIncludes('src-tauri/src/ai_providers.rs', 'pub async fn request_anthropic')
  && sourceIncludes('src-tauri/src/ai_providers.rs', 'pub async fn request_gemini')
  && sourceIncludes('src-tauri/src/lib.rs', 'mod ai_providers;');
const hasFindReplacePanelSplit = sourceIncludes('src/components/FindReplacePanel.tsx', 'export function FindReplacePanel')
  && sourceIncludes('src/components/EditorPane.tsx', "import { FindReplacePanel } from './FindReplacePanel';");
const hasMarkdownToolbarSplit = sourceIncludes('src/components/MarkdownToolbar.tsx', 'export function MarkdownToolbar')
  && sourceIncludes('src/components/EditorPane.tsx', "import { MarkdownToolbar } from './MarkdownToolbar';");
const hasInlineSelectionToolbarSplit = sourceIncludes('src/components/InlineSelectionToolbar.tsx', 'export function InlineSelectionToolbar')
  && sourceIncludes('src/components/EditorPane.tsx', "import { InlineSelectionToolbar } from './InlineSelectionToolbar';");
const hasDesktopNotifications = sourceIncludes('src-tauri/src/notification_commands.rs', 'show_desktop_notification')
  && sourceIncludes('src-tauri/src/lib.rs', 'mod notification_commands;')
  && sourceIncludes('src/lib/desktopActions.ts', 'notifySaveFailure')
  && sourceIncludes('src/lib/fs.ts', 'showDesktopNotification');
const hasDesktopBundleConfig = sourceIncludes('src-tauri/tauri.conf.json', '"targets": ["dmg"]')
  && sourceIncludes('src-tauri/tauri.conf.json', '"ext": ["md", "markdown"]')
  && sourceIncludes('src-tauri/tauri.conf.json', '"minWidth": 920');
const hasTauriVisualCaptureScript = sourceIncludes('scripts/capture_tauri_visual.sh', 'TAURI_DEV_ARGS=(dev --no-watch)')
  && sourceIncludes('scripts/capture_tauri_visual.sh', 'npx tauri "${TAURI_DEV_ARGS[@]}"')
  && sourceIncludes('scripts/capture_tauri_visual.sh', 'screencapture')
  && sourceIncludes('scripts/capture_tauri_visual.sh', 'detect_inkstack_process')
  && sourceIncludes('scripts/capture_tauri_visual.sh', 'Refusing to capture the whole screen')
  && sourceIncludes('package.json', '"test:tauri:visual"');
const hasMacReleaseDistributionChecks = sourceIncludes('scripts/check_macos_release.sh', 'stapler validate')
  && sourceIncludes('scripts/check_macos_release.sh', 'com.apple.quarantine');

const checks: Array<[string, boolean]> = [
  ['fixture contains Mermaid chart', hasMermaid],
  ['fixture contains TypeScript and Python code blocks', hasCode],
  ['fixture contains table sample', hasTable],
  ['fixture contains missing image sample', hasMissingImage],
  ['code block theme variables exist', hasCodeThemeVariables],
  ['expanded built-in themes are registered in CSS and theme exports', hasExpandedBuiltInThemes],
  ['preview components expose stable visual markers', hasPreviewMarkers],
  ['Tauri runtime guard is present', hasTauriRuntimeGuard],
  ['desktop root viewport is locked to prevent bottom blank space', hasRootViewportLock],
  ['Tauri desktop listeners are runtime guarded', hasDesktopRuntimeListenersGuarded],
  ['view shortcuts match UI order 1 edit, 2 split, 3 read, 4 code', hasViewShortcutOrder],
  ['desktop bundle config produces DMG and keeps Markdown associations', hasDesktopBundleConfig],
  ['Tauri visual baseline capture script exists', hasTauriVisualCaptureScript],
  ['macOS release script checks notarization and quarantine state', hasMacReleaseDistributionChecks],
  ['settings panels expose stable desktop UI sections', hasThemePanels],
  ['AI context confirmation warns on large context budgets', hasAiContextBudgetWarning],
  ['code view panel is split and reachable', hasDesktopCodeView],
  ['find/replace panel is split from editor pane', hasFindReplacePanelSplit],
  ['Markdown toolbar is split from editor pane', hasMarkdownToolbarSplit],
  ['inline selection toolbar is split from editor pane', hasInlineSelectionToolbarSplit],
  ['workspace commands are split from file commands', hasWorkspaceCommandsSplit],
  ['AI provider implementations are split from command dispatch', hasAiProvidersSplit],
  ['desktop notifications are wired for save failures', hasDesktopNotifications],
];

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, buildVisualFixtureHtml(), 'utf8');

let failed = 0;
for (const [name, passed] of checks) {
  if (passed) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

console.log(`INFO visual fixture written: ${path.relative(root, outputPath)}`);

if (failed > 0) {
  console.error(`\nMarkdown visual smoke checks failed: ${failed}/${checks.length}`);
  process.exit(1);
}

console.log(`\nMarkdown visual smoke checks passed: ${checks.length}/${checks.length}`);

function findSourceMarker(marker: string) {
  const sourceFiles = [
    'src/features/preview/PreviewCodeBlock.tsx',
    'src/features/preview/PreviewImage.tsx',
    'src/features/preview/PreviewTable.tsx',
    'src/components/Mermaid.tsx'
  ];
  return sourceFiles.some((file) => fs.readFileSync(path.join(root, file), 'utf8').includes(marker));
}

function sourceIncludes(file: string, marker: string) {
  const fullPath = path.join(root, file);
  return fs.existsSync(fullPath) && fs.readFileSync(fullPath, 'utf8').includes(marker);
}

function orderedSourceIncludes(file: string, markers: string[]) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) return false;

  const source = fs.readFileSync(fullPath, 'utf8');
  let offset = 0;
  for (const marker of markers) {
    const index = source.indexOf(marker, offset);
    if (index < 0) return false;
    offset = index + marker.length;
  }

  return true;
}

function buildVisualFixtureHtml() {
  const mermaidBlock = codeBlocks.find((block) => block.language === 'mermaid')?.code ?? 'flowchart TD\nA-->B';
  const tsBlock = codeBlocks.find((block) => block.language === 'ts')?.code ?? 'const ok = true;';
  const pythonBlock = codeBlocks.find((block) => block.language === 'python')?.code ?? 'print("ok")';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>InkStack Markdown Visual Regression Fixture</title>
  <style>
    :root {
      --color-bg-base: #fbfcfd;
      --color-bg-panel: #f2f5f7;
      --color-border-subtle: #d9e0e6;
      --color-text-primary: #1f2933;
      --color-text-secondary: #52606d;
      --color-text-tertiary: #7b8794;
      --color-code-bg: #f7f8fa;
      --color-code-header-bg: #eef1f4;
      --color-code-text: #26323f;
      --color-code-muted: #8a96a3;
      --color-code-keyword: #6f5f9a;
      --color-code-string: #4f7f63;
      --color-code-number: #8a6f3d;
      --color-code-comment: #7b8794;
      --color-code-title: #3f6f8f;
      --color-code-attr: #7a668c;
      --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      margin: 0;
      background: var(--color-bg-base);
      color: var(--color-text-primary);
      font-family: var(--font-sans);
    }
    main {
      max-width: 960px;
      margin: 0 auto;
      padding: 32px;
    }
    .section {
      margin: 24px 0;
      border: 1px solid var(--color-border-subtle);
      border-radius: 8px;
      background: white;
      overflow: hidden;
    }
    .section h2 {
      margin: 0;
      padding: 12px 16px;
      border-bottom: 1px solid var(--color-border-subtle);
      background: var(--color-bg-panel);
      font-size: 14px;
    }
    .chart-container,
    [data-inkstack-preview="missing-image"],
    [data-inkstack-preview="table"],
    .inkstack-code-surface {
      margin: 16px;
    }
    .chart-container {
      min-height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--color-border-subtle);
      border-radius: 8px;
      background: var(--color-bg-panel);
    }
    .inkstack-code-toolbar {
      margin: 16px 16px 0;
      border: 1px solid var(--color-border-subtle);
      border-bottom: 0;
      border-radius: 8px 8px 0 0;
      background: var(--color-code-header-bg);
      color: var(--color-text-secondary);
      padding: 8px 12px;
      font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .inkstack-code-surface {
      border: 1px solid var(--color-border-subtle);
      border-radius: 0 0 8px 8px;
      background: var(--color-code-bg);
      color: var(--color-code-text);
      overflow: hidden;
    }
    .inkstack-code-surface pre {
      margin: 0;
      padding: 16px;
      overflow: auto;
      font: 12px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    [data-inkstack-preview="table"] {
      overflow-x: auto;
      border: 1px solid var(--color-border-subtle);
      border-radius: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      border-bottom: 1px solid var(--color-border-subtle);
      padding: 10px 12px;
      text-align: left;
    }
    th { background: var(--color-bg-panel); }
    [data-inkstack-preview="missing-image"] {
      display: block;
      border: 1px dashed var(--color-border-subtle);
      border-radius: 8px;
      background: var(--color-bg-panel);
      padding: 12px;
      color: var(--color-text-secondary);
      font-size: 13px;
    }
    code.path {
      display: block;
      margin-top: 6px;
      color: var(--color-text-tertiary);
    }
  </style>
</head>
<body>
  <main>
    <h1>InkStack Markdown Visual Regression Fixture</h1>
    <p>用于人工快速打开检查，也作为自动 smoke 检查的输出样张。桌面端回归时，请在 Tauri 窗口中同步检查浅色/深色主题、AI 面板、代码视图和设置页。</p>
    <section class="section">
      <h2>Desktop Checklist</h2>
      <ul>
        <li>浅色和深色主题下代码块背景不突兀，文字对比清晰。</li>
        <li>Mermaid、表格、缺失图片提示和代码块复制按钮均可见。</li>
        <li>AI 面板可打开设置、代码视图、智能大纲和普通对话。</li>
        <li>独立 Vite 页面应显示 Tauri 运行时提示，不假装拥有本地文件能力。</li>
        <li>快捷键顺序：Cmd/Ctrl+1 编辑、2 分屏、3 阅读、4 代码；菜单、顶部按钮、命令面板一致。</li>
        <li>新建、重命名、删除工作区文件后无需重新打开目录即可刷新文件树。</li>
        <li>打包前运行 npm run tauri:check-macos，并完成 Finder 默认编辑器手检。</li>
      </ul>
    </section>

    <section class="section" data-inkstack-preview="mermaid">
      <h2>Mermaid</h2>
      <div class="chart-container">
        <pre>${escapeHtml(mermaidBlock)}</pre>
      </div>
    </section>

    <section class="section">
      <h2>Table</h2>
      <div data-inkstack-preview="table">
        <table>
          <thead><tr><th>功能</th><th>操作</th><th>预期</th><th>状态</th></tr></thead>
          <tbody><tr><td>Front matter 隐藏</td><td>查看预览顶部</td><td>不显示 YAML 元数据</td><td>待检查</td></tr></tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <h2>Code Blocks</h2>
      ${codeBlockHtml('typescript', tsBlock)}
      ${codeBlockHtml('python', pythonBlock)}
    </section>

    <section class="section">
      <h2>Missing Image</h2>
      <span data-inkstack-preview="missing-image">
        图片无法加载
        <code class="path">./assets/missing-image-for-regression.png</code>
        <span>请检查相对路径是否存在，或将图片拖入编辑器自动复制到 assets 后重新插入。</span>
      </span>
    </section>
  </main>
</body>
</html>
`;
}

function codeBlockHtml(language: string, code: string) {
  return `<div data-inkstack-preview="code-block">
    <div class="inkstack-code-toolbar">${language}</div>
    <div class="inkstack-code-surface" data-inkstack-preview="code-surface">
      <pre><code>${escapeHtml(code)}</code></pre>
    </div>
  </div>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
