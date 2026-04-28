# InkStack（墨栈）

InkStack（墨栈）是一款面向 macOS 的本地优先、AI 原生 Markdown 桌面编辑器。它以原生 `.md` / `.markdown` 文件为核心，保留源码编辑、实时预览、文档大纲、代码块理解和 AI 辅助写作能力，适合日常写作、技术文档、知识整理和代码说明。

墨栈的设计目标不是把文档锁进某个云端系统，而是让文件继续属于用户：你可以用本机目录管理 Markdown 文档，也可以把 AI 作为可审查、可确认的写作伙伴接入工作流。

## 现有功能

- 本地 Markdown 文件打开、编辑、保存与另存为。
- macOS 桌面应用打包，支持 `.md` / `.markdown` 文件关联。
- 支持从 Finder 双击 `.md` / `.markdown` 文档后直接在墨栈中打开。
- CodeMirror Markdown 源码编辑器，支持常用格式化工具栏与快捷命令。
- Markdown 预览，支持 GFM、表格、任务列表、脚注、定义列表、公式、Mermaid 图表、代码高亮、目录和 front matter。
- 本地图片预览与插入，支持相对资源路径和 Base64 内嵌模式。
- AI 面板，支持普通对话、选区总结、提问、改写、润色、扩写、翻译和代码解释。
- AI 上下文确认机制：发送前展示并允许调整本次发送的选区、当前文件或工作区上下文。
- AI 文档级 Diff 审查：生成候选后可按变更块接受或拒绝，避免直接覆盖正文。
- 代码块面板，支持从 Markdown 中提取代码块、搜索、折叠、复制、跳转源行和与 AI 联动。
- 多主题阅读体验，包含浅色、深色、专注、代码文档、GitHub、Notion、Newsprint、Solarized、Nord、Dracula、Everforest、Flexoki、Academic 等主题。
- 阅读字体、字号、行高、段落间距、内容宽度等阅读参数调节。
- 工作区文件树、最近项目、查找替换、命令面板、自动保存、未保存变更保护和外部修改冲突处理。

## AI 配置

AI 提供商可在应用内设置页配置。

支持的连接方式：

- OpenAI-compatible API，包括 OpenAI、DeepSeek、Qwen/DashScope、Doubao/Ark、Moonshot、Zhipu、SiliconFlow、OpenRouter 和自定义兼容端点。
- Google Gemini native API。
- Anthropic Claude native API。

开发构建中，API Key 仅保存在当前浏览器会话的 `sessionStorage`。不要把密钥写入 `.env` 或源码。

## 本地运行

前置要求：Node.js。

```bash
npm install
npm run dev
```

macOS 桌面开发：

```bash
npm run tauri:dev
```

macOS 打包：

```bash
npm run tauri:build:mac
```

## 版本更新记录

### 1.0.3 - 2026-04-29

- 更新 macOS 应用图标，移除明显白边与方角，重新生成透明圆角图标资源。
- 修复从 Finder 双击 `.md` / `.markdown` 文档时，应用启动但未打开对应文档的问题。
- 统一版本号到 `1.0.3`。
- 补充 README 软件介绍、功能清单、更新记录和作者信息。

### 1.0.1 - 2026-04-28

- 修复本地 Markdown 图片在桌面版预览中偶发只显示 alt 文本、不显示图片内容的问题。
- 修复 Mermaid 流程图放大查看时画布空白的问题，保留缩放、拖拽与导出能力。
- 更新桌面版安全策略，允许 Tauri 本地资源协议正常加载预览图片。
- 新增图片插入模式一键切换：支持 `assets` 模式与 `Base64` 内嵌模式。
- 重构阅读设置面板，新增同主题下的 `Light / Dark` 切换、主题下拉选择和阅读参数调节滑杆。
- 新增系统字体读取与阅读字体切换。
- 优化阅读参数拖动条视觉风格。

## 作者

InkStack
