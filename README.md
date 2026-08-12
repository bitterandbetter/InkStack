# InkStack（墨栈）

InkStack（墨栈）是一款面向 macOS 的本地优先、AI 原生的 Markdown 桌面编辑器。它以原生 `.md` / `.markdown` 文件为核心，支持源码编辑、实时预览、文档大纲、代码块理解、知识图谱与 AI 辅助写作，适合日常写作、技术文档、知识整理和代码说明。

墨栈的设计目标不是把文档锁进某个云端系统，而是让文件继续属于用户：可以用本机目录管理 Markdown 文档，也可以把 AI 作为可审查、可确认的写作伙伴接入工作流。

技术栈：Tauri 2 + React 19 + TypeScript + Zustand + Vite，前端只负责 UI 交互，文件系统与 AI 网络请求全部经由 Rust 后端命令完成。

## 主要功能

### 文档编辑

- 打开、编辑、保存、另存为本地 `.md` / `.markdown` 文件，也支持常见代码/文本文件（JavaScript、TypeScript、Python、Rust、JSON、HTML、CSS、SQL、YAML 等）以只读代码视图浏览。
- CodeMirror 6 Markdown 源码编辑器，内置常用格式化工具栏与快捷命令（标题、粗体、斜体、删除线、行内代码、代码块、引用、无序/有序/任务列表、链接、图片、表格、分隔线）。
- 编辑 / 分屏 / 阅读 / 代码四种视图模式（`Cmd/Ctrl+1..4`），分屏模式支持编辑器与预览滚动联动。
- 查找替换（`Cmd/Ctrl+F`）、文档标签页（上限 24）、导航历史后退/前进（上限 80）。
- 自动保存（1800ms 防抖、失败重试）、保存历史、未保存变更保护。
- 外部修改冲突检测：保存前比对 `modifiedAt` / `size` 基线，文件被外部改动时提示重新加载。
- 命令面板（`Cmd/Ctrl+K`）统一搜索文件、目录与执行命令。

### 预览渲染

- 实时预览（180ms 防抖），支持 GFM、表格、任务列表、脚注、定义列表、数学公式（KaTeX）、Mermaid 图表、代码高亮、目录（TOC）和 front matter。
- 代码块支持行号、折叠、复制、标题（`title=`）解析；Mermaid 图支持全屏缩放、平移与 SVG/PNG 导出。
- 本地图片预览与插入，支持相对资源路径和 Base64 内嵌两种模式（`assets` / embed），可拖拽导入图片。
- 图片导入时同步处理：图片文件会被导入到文档旁的 `assets/` 目录，或在 embed 模式下转为 data URL 写入文档。

### AI 能力

- AI 面板内置对话、智能大纲、代码助手、设置四个标签页，支持流式生成、可取消。
- 支持普通对话、选区总结、提问、改写、润色、扩写、翻译、代码解释与代码块操作（解释 / 重构 / 注释 / 插入文档）。
- AI 上下文确认机制：发送前展示并允许调整本次发送的选区、当前文件或工作区上下文。
- 文档级 Diff 审查：AI 改写结果以行级 / 词级 diff 呈现，可按变更块逐块接受、拒绝或重新生成，避免直接覆盖正文。
- 行内 AI：编辑器内选中文字后可直接改写、润色、扩写、翻译、总结、提问，结果以内联草稿卡片预览。
- 支持四种 AI 提供商预设：OpenAI 兼容接口、Anthropic Claude、Google Gemini、NVIDIA NIM，模型选择器可覆盖默认模型。
- API Key 从本机环境变量读取，绝不进入前端源码或明文持久化（可参考 `.env.example` 配置 `OPENAI_*` / `ANTHROPIC_*` / `GEMINI_*` 环境变量）。

### 知识图谱

- 基于工作区文档自动建立知识索引（SQLite 持久化，`.inkstack/workspace-index.sqlite3`），支持增量刷新。
- 解析标题、代码块、表格、任务、引用、公式、图片、段落等块，提取 Markdown 链接、Wiki 链接（`[[文档名]]`）、脚注链接与标签（`#tag`）。
- 提供反链、未链接提及、标签汇总、未解析链接、孤立文档及关联建议。
- 图谱视图（cytoscape）可视化文档间链接关系，支持缩放与拖拽。

### 外观与阅读

- 内置 13 套主题：light、dark、focus、code-docs、github、notion、newsprint、solarized、nord、dracula、everforest、flexoki、academic。
- 支持导入 CSS 主题、导出主题、打开主题目录，并可为任意主题自动派生暗色模式。
- 阅读与编辑参数独立调节：内容宽度、字号、行高、段落间距；支持切换系统字体（`system_profiler` 读取本机字体）。

### 其他

- 原生 macOS 菜单（中文）、`.md` / `.markdown` 文件关联、Finder 拖拽打开、单实例运行（第二实例启动参数转发给主实例）、窗口状态记忆。
- 从 Finder 双击或命令行参数打开文档，启动路径通过事件队列安全传递给前端。
- 桌面通知、最小化到托盘、退出前未保存变更确认。
- 桌面宠物：内置像素风伴生角色，随应用显示。

## 工作区与文件

- 工作区（目录）浏览：文件树懒加载、创建 Markdown 文件/文件夹、重命名、删除（含移入废纸篓）、路径前缀批量迁移。
- 最近项目与最近文件记忆（上限 12），打开过的历史记录可清理。
- 工作区文件与全文搜索（Markdown 与代码/文本文件），结果带行号与摘要。
- 工作区信任边界：文件树、搜索、知识索引只作用于工作区根目录；经对话框 / 拖拽 / 文件关联打开的工作区外文件进入白名单，可读可写但不进入工作区树。

## 导出

- 支持导出 HTML、Markdown、PDF、DOCX、PNG，以及直接打印。

## 本地运行

前置要求：Node.js（≥ 18）与 Rust 工具链（`cargo`）。

浏览器预览（仅 UI，无文件系统与 AI 能力）：

```bash
npm install
npm run dev
```

macOS 桌面开发（完整能力，需要 Rust 后端）：

```bash
npm run tauri:dev
```

## 构建与发布

```bash
npm run build                      # 前端构建（Vite）
npm run tauri:build:mac            # macOS 发布构建（DMG）
npm run tauri:fix-macos            # 修复 macOS 打包（清理隔离属性 + ad-hoc 签名）
npm run tauri:check-macos          # 校验发布产物（标识符/文件关联/签名/Gatekeeper 等）
npm run tauri:build:mac:install    # 构建并移动 DMG 到 dist/installer/
```

## 代码检查与测试

```bash
npm run lint                       # tsc --noEmit 类型检查
npm test                           # vitest 单元测试
npm run test:markdown              # Markdown 渲染管线回归脚本
npm run test:markdown:visual       # Markdown 渲染视觉回归
npm run test:tauri:visual          # Tauri 桌面视觉截图
```

Rust 侧：

```bash
cargo check                        # 在 src-tauri/ 下执行
cargo test                         # Rust 单元测试（含知识索引、SQLite）
```

## 项目结构

```
src/                        # React 前端
  App.tsx                   # 布局组合
  components/               # UI 组件（编辑器、预览、AI 面板、知识图谱等）
  features/preview/         # Markdown 渲染管线与预览组件
  hooks/                    # 全局钩子（桌面事件、快捷键）
  lib/                      # 工具库：Tauri 封装、AI、主题、快捷键、导出、知识图谱等
  store/                    # Zustand 全局状态（documents / settings / ai / ui）
src-tauri/                  # Rust 后端
  src/lib.rs                # AppState、58 个 command 注册、原生菜单
  src/file_commands.rs      # 文件打开/读取/路径解析
  src/save_commands.rs      # 保存与外部修改冲突检测
  src/workspace_commands.rs # 工作区生命周期与文件树
  src/workspace_search.rs   # 工作区文件/内容搜索
  src/workspace_index.rs    # 知识索引（内存侧）
  src/workspace_index_store.rs # 知识索引 SQLite 持久化
  src/ai_commands.rs        # AI 流式生成与取消（curl 子进程）
  src/ai_config.rs          # AI 配置与环境变量读取
  src/ai_providers.rs       # OpenAI / Anthropic / Gemini / NVIDIA 适配
  src/theme_commands.rs     # CSS 主题导入/导出/字体列表
  src/asset_commands.rs     # 图片/附件导入
  src/app_settings.rs       # 设置持久化
  src/notification_commands.rs # 桌面通知
  src/file_kinds.rs         # 文件分类
  src/models.rs             # 命令出入参 DTO
scripts/                    # 回归测试、打包修复、视觉校验脚本
```

## 版本

当前版本：1.1.0

## 作者

InkStack
