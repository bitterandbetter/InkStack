# InkStack 桌面 AI 原生 Markdown 编辑器整改计划

本文档用于承接用户对 InkStack 的长期产品设想：它不是网页端编辑器，而是面向 macOS 日常使用、可作为默认 `.md` / `.markdown` 编辑器的桌面 App；同时它不是传统 Markdown 编辑器外接一个聊天框，而是 AI 原生的写作、阅读、代码理解和知识处理工作台。

---

## 1. 产品判断

InkStack 的目标不是复刻 Typora、Obsidian、Zettlr、MarkText、Vditor、VS Code Markdown Preview、iA Writer、Bear、Notion、Logseq 中任意一个，而是吸收它们各自成熟的部分，再面向 AI 时代重新组织。

核心定位：

- **本地优先**：Markdown 原生文件，文件归用户所有。
- **桌面优先**：Tauri/macOS 原生能力，支持默认 Markdown 编辑器、Finder 双击、拖拽、菜单栏、快捷键、窗口恢复。
- **AI 原生**：AI 不是附属聊天窗口，而是贯穿选区、文档、代码块、图表、知识库、写作流程和重构流程。
- **渲染一流**：Markdown 预览要稳定、安全、美观；复杂图表、公式、代码、表格、脚注、TOC、front matter 都要有高质量体验。
- **适合写作与开发者文档**：既能写文章，也能维护技术文档、设计文档、代码说明、Prompt 文档和项目知识库。

---

## 2. 竞品参考与取舍

### Typora

可借鉴：

- 所见即所得的沉浸式 Markdown 写作体验。
- 简洁、低干扰、文本优先。
- 表格、数学公式、导出、主题体验成熟。

InkStack 取舍：

- 不必完全变成 Typora 式单栏所见即所得；保留源码编辑 + 预览 + AI/大纲面板更适合开发者和 AI 工作流。
- 重点学习其视觉克制和实时渲染质量。

### Obsidian

可借鉴：

- 本地文件库、双链、图谱、Canvas、插件生态。
- 工作区、标签页、命令面板、快速打开。

InkStack 取舍：

- MVP 不急着做完整双链图谱和插件市场。
- 优先做“本地 Markdown + AI 上下文管理 + 文档结构理解”，后续再扩展知识图谱。

### Zettlr

可借鉴：

- 学术写作、引用、项目管理、导出链路。
- 本地文档库与搜索体验。

InkStack 取舍：

- 可把引用、BibTeX、Pandoc 导出作为中后期能力。
- 先把 Markdown 核心写作、AI、桌面文件系统做好。

### MarkText

可借鉴：

- 开源 Markdown 桌面编辑器的轻量体验。
- 编辑和预览融合的交互。

InkStack 取舍：

- 重点学习轻量和桌面感，不照搬交互。

### Vditor / Zditor 类编辑器

可借鉴：

- Markdown 渲染能力丰富，支持所见即所得、即时渲染、分屏预览。
- 对 GFM、数学公式、图表、代码块等支持较完整。

InkStack 取舍：

- InkStack 保持 CodeMirror + React 渲染链路，不直接切换编辑器内核。
- 渲染能力要达到甚至超过这类编辑器。

### VS Code Markdown

可借鉴：

- 代码块、符号大纲、命令面板、扩展能力、开发者文档工作流。

InkStack 取舍：

- InkStack 不做通用 IDE，但要支持“文档里的代码理解”和“代码结构大纲”。

### iA Writer / Bear

可借鉴：

- 写作专注、排版、标签、轻量知识管理。

InkStack 取舍：

- 保持写作体验安静，不让 AI 和面板喧宾夺主。

---

## 3. Markdown 编辑器应具备的基础能力

### 文件与工作区

- 打开单个 Markdown 文件。
- 打开工作区目录。
- `.md` / `.markdown` 文件关联，支持系统默认打开。
- 多标签页、最近文件、最近工作区。
- 新建未命名文档、保存、另存为。
- 外部修改检测与冲突处理。
- 文件重命名、移动、删除、新建文件夹。
- Reveal in Finder。
- 拖拽文件/目录到窗口。

### 编辑能力

- CodeMirror 6 Markdown 编辑。
- 行号、软换行、折叠、搜索、替换。
- Markdown 格式工具栏：标题、加粗、斜体、删除线、行内代码、代码块、引用、列表、任务列表、链接、图片、表格、分割线。
- 快捷键：`Cmd+B/I/K/S/O/F`、`Cmd+1/2/3`、`Cmd+Shift+O`、`Cmd+Shift+S`。
- 命令面板。
- 多光标、块移动、行排序等高级编辑后续考虑。

### 预览与阅读

- GFM：表格、任务列表、删除线、自动链接。
- 数学公式：KaTeX。
- 图表：Mermaid。
- 代码高亮：优先 Shiki 或可按需加载 highlight.js 语言包。
- front matter 识别和隐藏。
- 标题锚点、TOC、脚注、定义列表。
- 本地图片相对路径解析。
- 图片、Mermaid、SVG、表格支持放大查看。
- 阅读模式支持内容宽度、字体、字号、行高、段间距。

### 结构与导航

- Markdown 标题大纲。
- 代码块大纲：语言、起止行、代码符号摘要。
- 文档内搜索和跳转。
- 工作区全文搜索。
- 快速打开文件。
- 返回/前进导航栈。

---

## 4. AI 原生能力蓝图

### AI 不只是聊天框

InkStack 的 AI 应覆盖四个层次：

1. **选区级**：润色、扩写、压缩、改语气、翻译、解释、生成标题。
2. **段落/章节级**：重写章节、补充论证、生成摘要、检查逻辑。
3. **文档级**：生成大纲、重排结构、生成摘要、提取行动项、生成 FAQ。
4. **工作区级**：跨文档问答、关联文档推荐、查找重复内容、构建知识地图。

### AI 修改必须可审查

- AI 不得默认直接覆盖正文。
- AI 修改应先生成 diff。
- 用户可以逐块接受、拒绝、重新生成。
- 支持“应用到选区”“应用到当前章节”“应用到新文档”。
- 保存前仍走文件冲突检测。

### AI 上下文控制

- 默认只发送当前选区或当前文档片段。
- 发送前展示上下文清单：文件、选区、附加资料。
- 用户可以手动添加相关文档。
- 不允许默认上传整个工作区。
- 可支持本地索引后做 RAG，但必须可见、可控。

### AI 供应商支持

- OpenAI-compatible：OpenAI、DeepSeek、Qwen、豆包、Moonshot、智谱、SiliconFlow、OpenRouter、本地网关。
- Gemini 原生 API。
- Anthropic 原生 API。
- 本地模型：Ollama、LM Studio、vLLM、LiteLLM、One API。

当前阶段实现约束：

- AI API Key、Base URL、默认模型只从本机环境变量读取。
- 不在前端输入、保存或粘贴 API Key。
- 不做 macOS Keychain / Tauri Stronghold，除非后续用户明确要求。
- AI 请求从 Rust 后端发出。
- 前端只维护 provider profile、模型选择、温度等非密钥配置。
- 支持超时、取消、错误脱敏、流式输出。
- 默认支持的环境变量：
  - OpenAI-compatible：`OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL`。
  - Anthropic：`ANTHROPIC_BASE_URL`、`ANTHROPIC_API_KEY`、`ANTHROPIC_MODEL`。
  - Gemini：`GEMINI_API_KEY`、`GEMINI_MODEL`；Base URL 如供应商无标准环境变量，可在 Rust provider 中按 AICodeMirror 文档固定默认值。

### AI 工作流设想

- `/rewrite`：生成可审查 diff。
- `/outline`：基于当前文档生成结构建议。
- `/continue`：续写当前段落。
- `/explain-code`：解释当前代码块。
- `/diagram`：把描述生成 Mermaid 图。
- `/table`：把文本整理成 Markdown 表格。
- `/review`：审阅文档逻辑、错别字、术语一致性。
- `/commit-doc`：根据代码变更生成文档更新建议。
- AI 侧边栏可以引用当前文件、选区、代码块、图表、搜索结果。

---

## 5. 渲染体验目标

Markdown 渲染是 InkStack 的核心体验，不能只是“能显示”。

### 图表

- Mermaid 流程图、时序图、类图、状态图、甘特图、ER 图、用户旅程图等。
- 图表支持：
  - 放大查看。
  - 拖拽平移。
  - 缩放。
  - 复制 SVG。
  - 导出 PNG/SVG。
  - 渲染错误定位到代码块行号。
- 后续可支持 PlantUML、Graphviz、Excalidraw/Canvas 嵌入。

### 代码块

- 代码高亮。
- 复制按钮。
- 显示语言。
- 折叠长代码。
- 代码块标题。
- 可选行号。
- 高亮指定行。
- AI 解释代码块。
- AI 生成代码块摘要。

### 表格

- 横向滚动。
- 表格放大查看。
- 编辑辅助：插入行列、格式化表格。
- CSV 粘贴转 Markdown 表格。

### 数学公式

- 行内和块级公式。
- 错误提示。
- 复制源码。

### 图片与附件

- 相对路径解析。
- 点击放大。
- 拖入图片自动复制到 assets 目录并插入相对路径。
- 图片丢失提示和修复建议。

---

## 6. 主题系统

InkStack 不应只支持浅色 / 深色两个硬编码主题，而要支持可切换、可导入、可维护的 CSS 主题系统。

### 主题能力

- 内置多套主题：默认浅色、默认深色、专注写作、代码文档、护眼阅读等。
- 支持用户在设置中切换主题。
- 支持导入本地 CSS 主题文件。
- 支持导出当前主题配置，便于备份和分享。
- 主题应覆盖：
  - 应用外壳：侧边栏、顶部栏、状态栏、AI 面板、命令面板。
  - 编辑器：CodeMirror 背景、正文、选区、光标、行号、折叠 gutter、语法高亮。
  - Markdown 预览：正文、标题、链接、引用、代码块、表格、公式、Mermaid 容器。
  - AI 交互：选区浮层、diff 候选、上下文确认、聊天气泡。

### CSS 主题导入约束

- 主题文件优先使用 CSS variables，不允许主题引入 JavaScript。
- 推荐主题变量挂在 `:root`、`.dark` 或 `html[data-inkstack-theme="..."]` 下。
- 导入前应做基础校验：文件扩展名、大小限制、文本编码、明显危险的远程 `@import` / 外链资源。
- 导入后的 CSS 存放在本机应用配置目录或用户授权目录，不写入项目源码。
- 如果主题 CSS 解析失败，应能回退到默认浅色主题。
- 后续可支持主题 manifest，例如：

```json
{
  "name": "InkStack Focus",
  "version": "1.0.0",
  "author": "local",
  "css": "theme.css",
  "mode": "light"
}
```

### 实现顺序

- MVP：内置主题切换 + 当前主题持久化。
- 下一步：导入单个 `.css` 文件，保存为用户主题。
- 中期：支持主题管理列表、重命名、删除、导出。
- 后期：支持主题包 manifest、预览缩略图、编辑器语法高亮主题分离。

---

## 7. 代码查看与代码结构大纲

用户明确要求：编辑器要支持代码查看，大纲就是代码结构等。

### 文档内代码结构

对 Markdown 内代码块进行结构提取：

- 识别代码块语言。
- 识别起止行。
- 对常见语言提取符号：
  - JS/TS：function、class、interface、type、export。
  - Python：class、def。
  - Rust：fn、struct、enum、impl、trait。
  - Go：func、type、struct、interface。
  - Java/C#：class、interface、method。
- 大纲中显示：
  - Markdown 标题节点。
  - 代码块节点。
  - 代码块内符号节点。

### 代码查看模式

- 点击代码块可进入“代码查看”模式。
- 支持只看本文档中的所有代码块。
- 支持按语言过滤。
- 支持复制全部代码块。
- 支持 AI 解释、重构建议、生成注释。

### 实现建议

- MVP：正则解析代码块符号，够用即可。
- 中期：使用 Lezer parser / Tree-sitter WASM 提取结构。
- 桌面版后期：Rust 后端可使用 tree-sitter 做更稳定的结构解析。

---

## 8. 桌面化整改路线

### 阶段 1：Tauri 壳与文件系统迁移

- 新建 `src-tauri`。
- 保留 React/Vite 前端。
- 迁移旧项目 Rust `models.rs`、文件 command、settings command。
- `src/lib/fs.ts` 改为 desktop adapter。
- 移除 `FileSystemHandle`。
- 文件树只保存路径和元数据。
- 支持打开文件、打开目录、保存、另存为。

### 阶段 2：默认 Markdown 编辑器

- 配置 `.md` / `.markdown` 文件关联。
- 支持 Finder 双击打开。
- 支持单实例和二次打开路径转发。
- 支持 Dock 拖入文件。
- 支持最近文件/目录。
- 菜单栏和核心快捷键。

### 阶段 3：渲染增强

- front matter。
- TOC。
- 脚注。
- 标题锚点。
- 图片相对路径解析。
- Mermaid 放大、缩放、导出。
- 表格放大查看。
- 代码块增强。

### 阶段 4：AI 安全化

- AI Key / Base URL / 默认模型只从本机环境变量读取。
- 不在前端保存密钥；暂不做 Keychain / Stronghold。
- AI 请求迁入 Rust。
- 前端只保留 provider profile。
- 支持 streaming。
- AI 生成 diff，不直接覆盖正文。
- 上下文清单和权限确认。

### 阶段 5：CSS 主题系统

- 内置 CSS variable 主题。
- 设置中支持主题切换。
- 支持导入本地 `.css` 主题文件。
- 支持主题回退、校验和删除。
- 编辑器、预览、AI 面板和桌面外壳统一吃主题变量。

### 阶段 6：代码结构与智能大纲

- Markdown 标题大纲。
- 代码块大纲。
- 代码符号大纲。
- 点击跳转。
- 根据光标位置高亮当前节点。
- AI 解释当前代码块和当前章节。

### 阶段 7：AI 工作区知识能力

- 本地全文索引。
- 文档摘要索引。
- 跨文档问答。
- 关联文档推荐。
- 重复内容检测。
- 项目文档健康度检查。

---

## 9. 当前已有能力与差距

已具备：

- React/Vite/Tailwind 前端。
- CodeMirror 编辑器。
- Markdown 预览。
- Mermaid 渲染和放大查看。
- AI 设置页和多 provider 原型。
- 大纲基础解析。
- Bold / Italic / Code 工具按钮。
- 保存状态和基础外部修改保护原型。

仍需整改：

- 文件系统仍是浏览器原型。
- AI Key 读取策略需统一为本机环境变量，前端不得保存密钥。
- AI 请求需保持在 Rust 后端。
- `/rewrite` 还没有正式 diff 应用流程。
- 大纲还没有代码符号结构。
- 渲染还缺 TOC、脚注、front matter、图片路径解析、表格放大。
- 没有 Tauri 桌面壳。
- 没有默认编辑器、菜单、快捷键、拖拽、窗口恢复。
- 主题系统还缺 CSS 主题切换、导入、导出和主题管理。

---

## 10. 近期执行顺序

建议下一步按这个顺序做：

1. 初始化 Tauri 2 桌面壳。
2. 迁移文件系统到 Rust command。
3. 前端数据模型从 `FileSystemHandle` 改为路径模型。
4. 做菜单栏和快捷键。
5. 做 `.md` / `.markdown` 文件关联。
6. 做 Mermaid / 图片 / 表格放大查看统一 viewer。
7. 做 CSS 主题切换和本地 CSS 导入。
8. 做代码块结构大纲。
9. 做 AI diff 应用流程。
10. 保持 AI Key / Base URL / 默认模型从环境变量读取，AI 请求走 Rust 后端。
11. 做工作区全文搜索与 AI 上下文选择器。

这个顺序的原则是：先把“桌面 App 的可信边界”做对，再继续增强 AI 和渲染体验。
