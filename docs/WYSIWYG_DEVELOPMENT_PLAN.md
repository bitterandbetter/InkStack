# Specification: InkStack Typora 风格所见即所得模式

## 文档用途

本文档是后续开发 AI 的执行规格，不是产品宣传稿。开发时必须按波次顺序推进，每完成一波先通过该波验收，再进入下一波。不得为了快速看到效果而绕过 Markdown 无损、自动保存、选区映射或异常回退。

本文档不规定开发时间。

## Problem

InkStack 当前提供以下视图：

- 编辑模式：使用 CodeMirror 直接编辑 Markdown 源码。
- 编辑和阅读：左侧源码、右侧预览。
- 阅读模式：使用 React Markdown 渲染只读内容。
- 代码模式：集中查看 Markdown 代码块或代码文件。

当前缺少 Typora 风格的编辑体验：用户不能在一个编辑面中直接看到排版后的标题、列表、链接、图片、公式和其他 Markdown 元素，同时继续输入和修改原始 Markdown。

现有编辑层与预览层彼此独立：

- `src/components/EditorPane.tsx` 维护 CodeMirror、光标、选区、搜索替换、Markdown 工具栏、拖放资源和内联 AI。
- `src/components/PreviewPane.tsx` 使用 `react-markdown` 渲染只读内容。
- `src/features/preview/markdownPipeline.ts` 处理 GFM、数学公式、原始 HTML 清洗、目录占位符、front matter 和定义列表。
- `src/store/documents.ts` 将 Markdown 字符串作为文档内容，并以字符串偏移量保存选区和执行 AI 替换。
- `src/hooks/useDesktopEvents.ts` 根据 `activeFileContent` 的变化触发自动保存。

因此，所见即所得不能通过把预览区域设置为 `contenteditable` 完成。那样会产生第二份文档状态、丢失 Markdown 语法细节，并破坏自动保存、撤销、AI 修改及文件冲突处理。

## Goal

增加一个独立的“所见即所得”视图，使 Markdown 文档在保持原始 Markdown 为唯一数据源的前提下，提供接近 Typora 的即时排版和直接编辑体验。

目标包括：

1. 模式切换不会无意修改文件内容。
2. 所见即所得中的每一次修改都直接形成合法 Markdown 文本。
3. 继续复用现有保存、自动保存、标签页、撤销、搜索、工具栏和 AI 能力。
4. 普通 Markdown 元素可直接编辑；复杂元素提供可视预览和明确的源码编辑入口。
5. 无法安全解析或渲染时显示原始 Markdown，并给出可恢复操作，不得隐藏内容或静默丢失内容。
6. 所见即所得模式适配现有内置、生成和导入主题。

## Users or systems affected

- Markdown 文档编辑用户。
- CodeMirror 编辑器及 Markdown 编辑命令。
- 阅读预览渲染链路及其组件。
- Zustand 文档状态、标签页状态和视图模式。
- 自动保存、手动保存、另存为和文件冲突处理。
- 文档内搜索、光标跳转、目录跳转和分屏跳转。
- Markdown 工具栏、快捷键、命令面板和 macOS 原生菜单。
- 内联 AI、AI 面板插入/替换及选区上下文。
- 主题生成、主题加载和 Markdown 视觉回归。

## Scope

### In scope

- 新增 `wysiwyg` 视图模式，不替换现有四种模式。
- 基于现有 CodeMirror 6 实例实现混合所见即所得，不引入第二套富文本数据模型。
- 使用 CodeMirror 语法树、装饰、标记和可交互 Widget 呈现 Markdown。
- 当前光标所在块显示必要 Markdown 标记；非活动块隐藏可安全隐藏的标记并显示排版结果。
- 支持标题、段落、强调、删除线、行内代码、链接、引用、列表、任务列表、分隔线、代码块、图片、表格、数学公式和 Mermaid。
- 支持 front matter、目录、定义列表、脚注和原始 HTML 的保留与安全回退。
- 保留工具栏、快捷键、查找替换、图片拖放、AI 选区与插入能力。
- 增加解析、无损、交互、主题和真实桌面环境回归测试。
- 为渲染失败、资源缺失和不支持语法提供错误提示、重试和“编辑源码”入口。

### Out of scope

- 不把 Markdown 转换为专有 JSON 文档格式。
- 不使用浏览器 `contenteditable` 作为完整文档的主要编辑器。
- 不删除或重定义现有编辑、分屏、阅读、代码模式。
- 不支持 Typora/VLOOK 私有插件协议；只有 InkStack 已明确实现的等价组件才可渲染。
- 不允许打开文档或切换模式时自动格式化整个 Markdown 文件。
- 不在第一轮为所有原始 HTML 元素提供可视化编辑器；必须先保证安全显示或源码回退。
- 不更改 Tauri 文件格式、工作区信任边界或保存协议，除非测试证明现有接口无法满足需求。

## Architecture decision

### 唯一数据源

`activeFileContent: string` 必须继续作为唯一、可保存的文档状态。

所见即所得层只做以下两类工作：

1. 通过 CodeMirror `Decoration` 改变内容的视觉表现，但不改变文档字符串。
2. 用户明确操作时，通过 CodeMirror transaction 修改对应 Markdown 字符范围。

禁止维护一份长期存在的 HTML、React 树或富文本 JSON，并在后台反向序列化覆盖 Markdown。

### 单编辑器实例

源码编辑和所见即所得优先复用同一个 CodeMirror 实例，通过 `Compartment` 或等价的可重配置扩展切换呈现模式。这样可以保留：

- 撤销/重做历史。
- 光标和选区。
- 搜索结果。
- 编辑命令和拖放行为。
- 现有 `setActiveFileContent` 数据流。

不得默认同时挂载两套可编辑 CodeMirror 实例。

### 解析层

建立共享的 Markdown 文档索引，输出稳定的源码范围：

```ts
type MarkdownSourceRange = {
  from: number;
  to: number;
  lineFrom: number;
  lineTo: number;
};

type MarkdownVisualNode = {
  id: string;
  type: MarkdownVisualNodeType;
  range: MarkdownSourceRange;
  contentRange?: MarkdownSourceRange;
  metadata?: Record<string, unknown>;
  fallbackReason?: string;
};
```

解析原则：

- 标准 Markdown 优先读取 CodeMirror/Lezer Markdown 语法树。
- GFM 与项目扩展语法使用独立、可测试的范围解析器补充。
- `math`、Mermaid、front matter、目录、定义列表、原始 HTML 等解析不得散落在各 Widget 内。
- 解析器必须返回源码偏移范围，不能只返回渲染后的文本。
- 文档存在不完整语法时，索引必须降级而不是抛出导致整个编辑器空白。
- 只重新计算变化区域及可见视口附近装饰；复杂文档不得每次按键全量挂载所有 Widget。

### 活动块规则

- 光标所在的最小可编辑块称为“活动块”。
- 活动块显示完成编辑所需的 Markdown 标记。
- 非活动块可隐藏标题井号、强调符号、链接 URL、围栏等，并应用阅读样式。
- 用户单击 Widget 时选中对应源码范围。
- 用户双击复杂 Widget 或点击“编辑源码”时，将该块变为活动源码块并把光标定位到可编辑位置。
- 按 `Escape` 退出复杂块编辑，重新显示可视预览。
- 选区跨越多个块时，相关块都显示源码，避免选择范围与视觉内容不一致。

### React Widget 生命周期

需要复用 React 预览组件时，使用受控的 CodeMirror `WidgetType` 桥接：

- Widget 只接收当前源码片段和只读派生数据。
- Widget 的修改回调必须生成 CodeMirror transaction。
- Widget 销毁时必须卸载 React root、取消 Mermaid/图片等异步任务。
- 不允许 Widget 直接调用 `setActiveFileContent` 绕过 CodeMirror transaction，否则会破坏撤销历史和光标位置。

### 无损不变量

以下规则优先级高于视觉效果：

1. 打开文件后不编辑，切换任意模式再保存，文件字节内容不变。
2. 装饰和 Widget 不得修改 Markdown。
3. 单个操作只能修改目标源码范围。
4. 无法解析的内容必须显示为源码。
5. 解析错误不得阻止保存。
6. 新建未命名文档仍然不能被自动保存为伪路径。
7. 外部文件变化和保存冲突处理必须与源码编辑模式一致。

## View behavior matrix

| 场景 | 预期行为 |
|---|---|
| 可编辑 Markdown 文件 | 可以进入所见即所得模式 |
| 未命名 Markdown 草稿 | 可以编辑；维持现有“手动首次保存”策略 |
| 只读 Markdown 文件 | 不允许修改；按钮禁用或转到阅读模式，并显示原因 |
| 普通文本或代码文件 | 所见即所得按钮禁用；保留编辑/代码模式 |
| 空 Markdown 文档 | 显示可点击的空白编辑面，输入后形成正常 Markdown |
| 语法不完整 | 显示原始源码，不报全局错误 |
| 图片资源缺失 | 显示缺失资源卡片、路径和“编辑源码”入口 |
| Mermaid/公式渲染失败 | 显示错误卡片，包含重试、复制源码、编辑源码 |
| 切换到源码编辑 | 保持光标对应 Markdown 偏移和撤销历史 |
| 切换标签页后返回 | 恢复该标签页内容、脏状态和合理的光标位置 |

## Markdown support contract

### 直接排版并直接编辑

- 普通段落和换行。
- H1–H6。
- 粗体、斜体、粗斜体、删除线。
- 行内代码。
- 无序列表、有序列表和嵌套列表。
- 任务列表及可点击复选框。
- 引用块。
- 分隔线。
- 链接文本；活动时可编辑目标地址。

### 保留结构的可视编辑，同时支持源码编辑

- 本地图片、远程图片和嵌入图片。
- 围栏代码块及语言标记。
- 行内公式和块级公式。
- Mermaid 图表：保持图形、节点和连线结构；已识别的命名节点可直接修改文字，并回写对应 Markdown 范围。
- Markdown 表格：保持表格结构；单元格内容、行列和对齐可直接修改，并回写 Markdown。
- 目录占位符。
- front matter。
- 定义列表。
- 脚注。
- 经过安全清洗的原始 HTML。

复杂语法无法安全映射到结构化控件时，必须保持可视结构并提供“编辑源码”入口，不得为了编辑一个节点或单元格而自动切换整个块到源码。

### 必须原样保留的内容

- 不认识的 Markdown 扩展语法。
- Typora/VLOOK 私有语法。
- 不完整或歧义语法。
- 被安全策略拒绝渲染的 HTML。

这些内容不保证可视化，但必须始终可见、可编辑、可保存。

## Development sequence

### Wave 0：建立基线、测试夹具和模块边界

先做保护工作，禁止直接开始隐藏 Markdown 符号。

开发内容：

1. 新增 `tests/fixtures/wysiwyg/complete.md`，覆盖：
   - front matter。
   - H1–H6。
   - 中英文段落。
   - 粗体、斜体、删除线、行内代码、链接。
   - 嵌套列表、任务列表、引用。
   - 表格。
   - 多语言代码块。
   - 行内和块级公式。
   - Mermaid。
   - 本地、远程和缺失图片。
   - HTML、目录、定义列表、脚注。
   - 不完整 Markdown 和未知扩展语法。
2. 新增无损测试工具，对任意夹具执行“载入 → 初始化所见即所得扩展 → 不编辑 → 导出当前文档”，断言字符串完全相等。
3. 为 `markdownEditorActions.ts` 的格式化、列表、链接、图片和表格操作补齐单元测试，锁住当前行为。
4. 为视图命令增加参数化测试，避免新增模式时破坏现有命令。
5. 在 `src/features/wysiwyg/` 建立目录，不把新逻辑继续堆进 `EditorPane.tsx`。

建议目录：

```text
src/features/wysiwyg/
  index.ts
  types.ts
  createWysiwygExtension.ts
  documentIndex.ts
  activeRanges.ts
  decorations/
    inlineDecorations.ts
    blockDecorations.ts
    listDecorations.ts
  widgets/
    ReactWidget.ts
    ImageWidget.tsx
    CodeBlockWidget.tsx
    MathWidget.tsx
    MermaidWidget.tsx
    TableWidget.tsx
    FallbackWidget.tsx
  commands/
    taskCommands.ts
    tableCommands.ts
    widgetCommands.ts
  __tests__/
```

Wave 0 验收：

- 基线测试能在没有所见即所得实现时运行。
- 现有 Markdown 操作行为有自动化保护。
- 完整夹具可以由现有预览链路读取。
- 未修改任何现有视图行为。

### Wave 1：接通新视图模式

只接通模式，不急着实现复杂排版。

开发内容：

1. 将 `ViewMode` 扩展为：

   ```ts
   type ViewMode = 'split' | 'edit' | 'wysiwyg' | 'read' | 'code';
   ```

2. 新增 `view-wysiwyg` 应用命令。
3. 在以下位置接入新命令：
   - `src/lib/appCommands.ts`
   - `src/lib/shortcuts.ts`
   - `src/lib/hooks/useShortcuts.ts`
   - `src/components/Header.tsx`
   - `src/components/CommandPalette.tsx`
   - `src-tauri/src/lib.rs` 原生“视图”菜单及事件白名单。
4. 保留现有 `Cmd/Ctrl+1` 至 `Cmd/Ctrl+4`，为新模式使用 `Cmd/Ctrl+5`，避免破坏用户记忆和已保存快捷键。
5. `App.tsx` 在 `wysiwyg` 模式下只显示编辑器，不显示 PreviewPane。
6. `EditorPane.tsx` 在 `wysiwyg` 模式下仍使用同一个 CodeMirror 文档状态，但挂载空的所见即所得扩展和专用 CSS class。
7. 对非 Markdown、只读文件和无活动文件定义按钮状态和提示。
8. 新增 `.inkstack-view-wysiwyg` 与 `.inkstack-wysiwyg-surface` 基础样式，暂不复制全部阅读 CSS。

Wave 1 验收：

- 顶部按钮、命令面板、快捷键和 macOS 菜单均能进入新模式。
- 进入和退出新模式不改变文档内容。
- 模式切换保留光标、选区和撤销历史。
- 非 Markdown 文件不能误入所见即所得编辑。
- 任一入口失败时通过现有通知系统提示，用户仍可返回编辑或阅读模式。

### Wave 2：实现文档索引和装饰基础设施

开发内容：

1. 实现 `documentIndex.ts`，把 Markdown 语法树转换为带源码范围的视觉节点。
2. 实现增量更新：使用 transaction 的 changed ranges 更新受影响节点，不在每次按键时重新处理全部长文档。
3. 实现视口过滤：只为可见区域及前后缓冲区创建复杂装饰和 Widget。
4. 实现 `activeRanges.ts`：
   - 单光标定位当前块。
   - 选区跨块时返回全部相关块。
   - Widget 选中时映射回源码范围。
5. 建立统一装饰优先级，避免 inline replacement、block widget 和选区互相覆盖。
6. 建立 `FallbackWidget` 和局部 Error Boundary。
7. 记录开发环境诊断信息，但生产环境不得持续打印大量解析日志。

Wave 2 验收：

- 每个视觉节点都能追溯到精确源码范围。
- 输入不完整 Markdown 不会导致编辑器崩溃或空白。
- 只移动光标不会修改文档或污染撤销栈。
- 大文档滚动时只挂载可见区域的复杂 Widget。
- 解析或 Widget 异常只影响当前块，并可一键进入源码编辑。

### Wave 3：基础 Markdown 所见即所得

按以下顺序实现，上一项稳定后再做下一项：

1. 普通段落、软换行和硬换行。
2. H1–H6：非活动块隐藏井号并应用层级字号；活动块恢复井号。
3. 粗体、斜体、粗斜体、删除线：非活动范围隐藏定界符并应用样式。
4. 行内代码：隐藏反引号，使用现有行内代码主题变量。
5. 链接：非活动状态显示链接文字；活动状态恢复完整 Markdown。
6. 引用块和分隔线。
7. 无序、有序和嵌套列表；先实现视觉层，再实现专用键盘行为。

实现要求：

- 遇到重叠或歧义标记时宁可显示源码，不得错误隐藏文本。
- 选中包含隐藏标记的文本时，必须自动显示相关源码，确保复制内容可解释。
- 输入法组合阶段不得频繁重建 Widget 或移动光标。
- 中文输入、英文输入、Emoji 和组合字符都要纳入测试。

Wave 3 验收：

- 基础元素具有明显的所见即所得效果。
- 光标进入元素后可编辑原始 Markdown 标记。
- 跨块选择、复制、剪切、粘贴正常。
- 撤销和重做能恢复文本与光标位置。
- 同一文件在编辑和所见即所得之间来回切换不发生格式漂移。

### Wave 4：编辑命令、键盘语义、搜索和 AI 接入

开发内容：

1. 抽取 `EditorPane.tsx` 中可复用的编辑控制逻辑，建议形成：
   - `useMarkdownEditorController`。
   - `createCommonEditorExtensions`。
   - `MarkdownEditorOverlays`。
2. 继续让 `markdownEditorActions.ts` 通过 CodeMirror transaction 工作；禁止为所见即所得另写一套字符串替换器。
3. 让 Markdown 工具栏在所见即所得模式正常执行：
   - 标题。
   - 粗体、斜体、删除线、行内代码。
   - 引用和列表。
   - 链接、图片、附件。
   - 代码块、表格和分隔线。
4. 实现列表键盘行为：
   - `Enter` 延续列表。
   - 空列表项按 `Enter` 退出列表。
   - `Tab` / `Shift+Tab` 调整层级。
   - `Backspace` 在列表起始处安全移除标记。
5. 查找替换继续按 Markdown 源字符串搜索；跳转后自动显示命中所在块的源码标记。
6. AI 选区继续使用 Markdown `from/to/text`：
   - 视觉选区必须映射到源偏移。
   - AI 替换通过现有 CodeMirror dispatch 或 `replaceActiveFileRange` 完成。
   - AI 返回结果插入后，装饰层重新解析变化范围。
7. 目录或代码面板跳转到某行时，所见即所得编辑器将光标定位到对应源位置并滚动到可见区域。

Wave 4 验收：

- 所有现有 Markdown 工具栏按钮在新模式下有实际效果。
- 所有现有 Markdown 快捷键在新模式下行为一致。
- 查找、替换当前、全部替换和跳转正常。
- AI 改写、总结、插入和撤销插入不会替换错误范围。
- 操作失败时显示明确提示，并保留返回源码编辑模式的入口。

### Wave 5：任务列表、链接和图片交互

开发内容：

1. 任务列表：
   - 非活动状态显示原生复选框。
   - 点击复选框只修改对应 Markdown 中的 `[ ]` / `[x]`。
   - 保留大小写和列表缩进，不重写整行其他内容。
2. 链接：
   - 单击选择或打开浮层，不立即离开应用。
   - 提供打开链接、编辑地址、复制地址和移除链接。
   - 外部打开失败时显示错误，并保留编辑地址入口。
3. 图片：
   - 复用现有资源路径解析和导入策略。
   - 支持本地相对路径、远程 URL、data/blob 和缺失资源。
   - 图片 Widget 提供选中、替换、编辑 alt、编辑路径、复制路径和源码编辑。
   - 拖放图片继续走 `importMarkdownAsset`，最终插入 Markdown，而不是 HTML。
   - 图片加载失败不得反复弹窗；错误卡片应稳定显示。
4. 附件链接保持普通 Markdown 链接，不自动转为不透明专有节点。

Wave 5 验收：

- 点击任务框后，源码只发生最小范围变化，并可撤销。
- 图片导入方式“assets/embed”都能工作。
- 缺失图片显示路径、错误原因、重试和源码编辑按钮。
- 模式切换后图片和链接内容保持一致。

### Wave 6：代码块、公式和 Mermaid

开发内容：

1. 围栏代码块：
   - 非活动状态隐藏围栏，显示语言和高亮代码。
   - 单击选中块，双击或点击“编辑源码”显示围栏源码。
   - 活动时保持 CodeMirror 原生代码编辑体验。
   - 支持复制代码和复制完整 Markdown。
2. 行内公式：非活动时渲染 KaTeX；活动或渲染失败时显示 `$...$` 源码。
3. 块级公式：使用 Widget 渲染；编辑时显示 `$$` 源码块。
4. Mermaid：
   - 复用现有 Mermaid 组件的安全配置。
   - 渲染任务必须可取消或忽略过期结果。
   - 修改源码后只更新当前图表。
   - 错误卡片提供错误摘要、重试、复制源码和编辑源码。
5. Widget 焦点不能截断全局保存、撤销或模式切换快捷键。

Wave 6 验收：

- 代码块、公式和 Mermaid 均可在预览与源码编辑状态间往返。
- 快速连续输入不会展示过期 Mermaid 或公式结果。
- 渲染失败不会影响其他块、自动保存或文档切换。
- 所有操作可返回，且不存在无法退出的 Widget 焦点状态。

### Wave 7：表格编辑器

表格单独开发，不要把它和普通 inline decoration 混在一起。

开发内容：

1. 先复用 `PreviewTable` 的解析/复制能力，将其纯逻辑抽到 feature/lib 层。
2. 表格 Widget 必须绑定完整表格源码范围，并保存列对齐信息。
3. 支持：
   - 单元格选中和编辑。
   - Tab/Shift+Tab 移动单元格。
   - 添加/删除行。
   - 添加/删除列。
   - 左/中/右对齐。
   - 粘贴 TSV/CSV。
   - 转为 TSV、复制表格。
4. 每次表格操作通过一个 CodeMirror transaction 替换整个表格范围，形成单步撤销。
5. 序列化时保留单元格内容并正确转义竖线、换行等；禁止影响表格之外的空行。
6. 表格结构不合法时自动进入源码回退，不尝试猜测并重写。

Wave 7 验收：

- 表格所有结构操作均可单步撤销。
- 中文、Emoji、转义竖线、行内格式和空单元格不会丢失。
- 非法表格原样显示为源码。
- 打开后不编辑的表格不会被重新格式化。

### Wave 8：扩展语法与安全回退

开发内容：

1. front matter：默认折叠为元数据块；点击进入源码编辑。不得自动解析后重新序列化 YAML。
2. TOC：显示与阅读模式一致的目录；点击条目跳转到对应 Markdown 标题范围。
3. 定义列表：显示排版结果；编辑时回到原始定义列表源码。
4. 脚注：如果当前预览链路不能完整渲染，先采用源码回退并明确标记“保留但暂不提供可视编辑”。
5. 原始 HTML：
   - 继续使用现有 sanitize 策略。
   - 安全 HTML 可预览但默认通过源码修改。
   - 被过滤内容必须显示提示，不能表现为内容消失。
6. 未知扩展和 Typora/VLOOK 私有组件：原样源码显示，并提供“不支持可视编辑”的非阻塞提示。
7. 所有回退块都必须支持：复制源码、编辑源码、退出源码编辑；可重试类型还要提供重试。

Wave 8 验收：

- 扩展语法不会因为进入所见即所得模式而丢失。
- 被清洗或不支持的 HTML 有明确提示。
- 目录跳转可定位并返回。
- 任一扩展块都不存在只有错误提示、没有返回按钮的死路。

### Wave 9：主题、可访问性和性能

开发内容：

1. 为 `.inkstack-wysiwyg-surface` 建立语义样式适配层，复用阅读主题变量和可复用语义规则。
2. 不直接把针对 `#write` 或 `.inkstack-reading-surface` 的选择器原样套到 CodeMirror DOM；先映射到稳定的所见即所得 class。
3. 为生成的 62 套主题验证：
   - 标题、正文、链接、引用、列表和任务框。
   - 行内代码和围栏代码。
   - 表格。
   - 图片错误态。
   - 公式和 Mermaid。
   - 光标、选区、活动块和错误卡片。
4. 支持浅色/深色同系列主题切换。
5. 可访问性：
   - Widget 操作可使用键盘完成。
   - 按钮有中文/英文可读标签。
   - 焦点环清晰。
   - 错误提示使用适当的状态语义。
   - 遵循 reduced motion 设置。
6. 性能：
   - 建立大文档夹具。
   - 统计初次建立索引、输入延迟、滚动和 Widget 数量。
   - Mermaid、KaTeX、图片等不可见 Widget 应延迟处理。
   - 解析失败或慢任务不得阻塞正常输入。

Wave 9 验收：

- 所有主题中的正文和控件都可读。
- 主题切换不会使活动编辑标记消失。
- 键盘可以进入和退出所有可交互块。
- 长文档持续输入和滚动没有明显卡顿或光标跳动。
- 视觉测试覆盖全部主题，而不是只检查默认主题。

### Wave 10：完整回归与发布开关

开发内容：

1. 增加所见即所得偏好设置：首次稳定发布前可作为实验功能开关；稳定后再决定是否默认显示。
2. 运行完整模式矩阵：编辑、所见即所得、分屏、阅读、代码。
3. 运行文件矩阵：已保存 Markdown、未命名草稿、只读 Markdown、外部打开文件、普通文本、代码文件。
4. 运行状态矩阵：干净、脏、保存中、保存成功、保存失败、外部冲突。
5. 验证关闭标签页、关闭窗口、切换工作区、后退和前进时的未保存提示。
6. 验证真实 Tauri 窗口中的菜单、快捷键、拖放、剪贴板和输入法。
7. 更新 README、快捷键说明和模式说明。
8. 最终验证命令：

   ```text
   npm test
   npm run lint
   npm run build
   npm run test:markdown
   npm run test:markdown:visual
   npm run test:themes:visual -- --all
   cargo check（在 src-tauri 目录）
   git diff --check
   ```

   如果 Markdown 测试依赖的仓库夹具缺失，先补齐或明确记录缺口，不能把缺失夹具描述成功能通过。

Wave 10 验收：

- 所见即所得模式不破坏任何现有模式。
- 自动保存仅对已有、可编辑 Markdown 文件工作；未命名草稿仍要求首次手动保存。
- 所有失败操作都有提示和可返回路径。
- 无损测试、功能测试、主题视觉测试和真实桌面测试全部有结果记录。

## State and event changes

### Store

必须修改：

- `ViewMode` 增加 `wysiwyg`。
- 如果需要跨标签页恢复精确光标，增加基于 Markdown 偏移量的编辑器视图状态；不要保存 DOM selection。

尽量不修改：

- `activeFileContent`、`isDirty`、`saveState` 语义。
- 未命名草稿路径和自动保存资格判断。
- 文件元数据与外部冲突数据结构。

### Commands

新增：

- `view-wysiwyg`。

复杂 Widget 内部操作优先使用 feature 内部命令，不要无限扩张全局 `AppCommandId`。只有需要菜单、命令面板或用户自定义快捷键的操作才进入全局命令表。

### Editing flow

```text
用户输入或 Widget 操作
  -> CodeMirror transaction
  -> CodeMirror 文档字符串变化
  -> EditorPane onChange
  -> setActiveFileContent
  -> isDirty/saveState 更新
  -> 现有自动保存或手动保存
```

任何实现如果绕过这条链路，必须先说明原因并补充撤销、光标和保存一致性测试。

## Acceptance criteria

- Given 一个已保存的 Markdown 文件，When 用户打开文件、依次切换五种模式但不编辑并保存，Then 文件内容与打开前逐字节一致。
- Given 一个未命名 Markdown 草稿，When 用户在所见即所得模式输入，Then 文档标记为未保存，但不会对 `inkstack-draft://` 路径执行自动保存。
- Given 用户在标题、强调或链接中放置光标，When 该元素成为活动范围，Then 编辑所需的 Markdown 标记可见且光标位置正确。
- Given 用户离开基础 Markdown 元素，When 元素语法完整，Then 语法标记隐藏并显示对应排版。
- Given Markdown 语法不完整或无法识别，When 所见即所得解析该范围，Then 原始源码可见且编辑器其余部分可继续工作。
- Given 用户点击任务复选框，When 状态切换，Then 只修改对应任务标记并可一步撤销。
- Given 图片、公式或 Mermaid 渲染失败，When 错误出现，Then 当前块显示错误原因、重试和编辑源码按钮，且保存不受影响。
- Given 用户从阅读目录、代码面板或搜索结果跳转，When 所见即所得为当前模式，Then 编辑器滚动到对应源码位置并允许返回。
- Given 用户选择排版后的文本并执行 AI 改写，When 接受修改，Then 替换准确的 Markdown 源范围，不影响相邻标记。
- Given 用户编辑表格单元格，When 提交更改，Then 生成合法 Markdown 表格，并且一次撤销恢复整个操作。
- Given 任一支持主题，When 切换浅色/深色和主题，Then 内容、光标、选区、错误态与 Widget 控件均清晰可见。
- Given 用户使用中文输入法连续输入，When 组合输入尚未结束，Then 编辑器不提前隐藏标记、不移动光标、不重复提交内容。

## Constraints

- 继续使用 React 19、CodeMirror 6、Zustand 和现有 Tauri 2 架构。
- 优先复用现有依赖；新增编辑器框架必须先证明 CodeMirror 方案无法满足需求，并单独评审。
- 前端不得直接绕过 `src/lib/tauriRuntime.ts` 调用 Tauri API。
- 新的重逻辑放在 `src/features/wysiwyg/` 或 `src/lib/`，不要继续扩大组件文件。
- 所见即所得不拥有独立保存格式。
- 所有用户可见文案提供中文和英文。
- 所有异常都必须提供提示；会把用户带入临时状态的界面必须提供退出或返回操作。
- 保持现有工作区文件安全边界、只读判断和外部修改冲突检测。

## Assumptions

- “Typora 风格”指 Markdown-first 的即时排版编辑，不要求复制 Typora 的全部私有插件能力。
- 新模式作为第五种模式加入，现有模式和快捷键保持兼容。
- 第一数据优先级是 Markdown 无损，其次才是视觉还原度。
- 复杂块允许使用“可视预览 + 源码编辑”作为稳定过渡形态。
- 当前保存层接收完整 Markdown 字符串，因此通常不需要新增 Rust 保存接口。

## Risks

### 源码范围漂移

Widget 使用旧偏移量修改新文档会替换错误内容。所有异步 Widget 必须验证当前文档版本或重新解析目标范围后再提交。

### 装饰重叠

粗斜体、链接内强调、嵌套列表等可能产生相互覆盖的 replacement decoration。必须集中处理装饰优先级并为冲突提供源码回退。

### 输入法与光标跳动

中文输入法组合期间频繁重建装饰可能中断输入。组合输入需要专门事件状态和真实桌面测试。

### Markdown 被重新格式化

表格或复杂块序列化容易改变无关空格和换行。除非用户执行了明确的“格式化”操作，否则不得重写未触及范围。

### 双渲染逻辑漂移

阅读模式与所见即所得 Widget 如果各自维护解析规则，会逐渐产生差异。应抽取共享纯逻辑，但保持预览 DOM 与编辑 DOM 的职责分离。

### 长文档性能

全量 React Widget、Mermaid 和 KaTeX 渲染会阻塞输入。必须使用视口挂载、缓存、任务取消和变化范围更新。

### 主题选择器不兼容

阅读主题 CSS 直接应用到 CodeMirror 可能影响光标、测量和滚动。必须通过稳定语义 class 做映射并执行全主题视觉验证。

## Open questions

以下问题不阻塞 Wave 0–3，但必须在对应功能开发前确定：

1. 所见即所得是否在稳定后成为 Markdown 默认模式，还是长期保持用户选择。
2. 单击链接默认是选中还是打开；建议单击选中，按住修饰键或通过浮层打开。
3. 图片是否需要拖拽缩放；建议首版不写入非标准尺寸语法，先只支持路径和 alt。
4. front matter 是否需要表单编辑；建议首版只折叠预览并通过源码编辑。
5. HTML 的可视编辑范围；建议首版仅安全预览和源码编辑。
6. 脚注是否引入新的 remark 插件实现完整阅读渲染，还是先保留源码回退。
7. 表格序列化是否默认保持原布局，还是只在用户执行“格式化表格”时对齐列宽；建议默认保持，显式格式化时才规范化。

## Suggested waves

严格按以下顺序：

1. 基线、夹具、无损测试和模块目录。
2. 新视图、命令、菜单和单 CodeMirror 实例切换。
3. 文档索引、活动范围、装饰基础设施和错误回退。
4. 基础 Markdown 排版。
5. 工具栏、键盘、搜索、跳转和 AI 选区。
6. 任务列表、链接和图片。
7. 代码块、公式和 Mermaid。
8. 表格编辑器。
9. 扩展语法和安全回退。
10. 全主题、可访问性和性能。
11. 完整回归、实验开关和发布准备。

不得把表格、Mermaid 或全主题适配提前塞进基础装饰阶段。每一波都应形成可独立评审、可回退的提交。

## Review checklist

后续开发 AI 在每个提交前回答：

- [ ] 本次修改是否仍以 Markdown 字符串为唯一数据源？
- [ ] 是否存在仅切换模式就修改文档的情况？
- [ ] 所有文本修改是否通过 CodeMirror transaction？
- [ ] 是否保持了撤销、重做和光标位置？
- [ ] 是否为新增语法提供精确源码范围测试？
- [ ] 解析失败时是否显示原始 Markdown？
- [ ] 异步渲染是否能取消或忽略过期结果？
- [ ] 错误提示是否包含重试、返回或编辑源码操作？
- [ ] 新功能是否同时覆盖中文输入和英文输入？
- [ ] 是否验证未命名草稿不会误触发自动保存？
- [ ] 是否验证只读文件和非 Markdown 文件？
- [ ] 是否没有破坏现有编辑、分屏、阅读和代码模式？
- [ ] 是否补充了相应单元、交互或视觉测试？
- [ ] 是否运行了本波相关检查并记录真实结果？

## Definition of done

只有同时满足以下条件，所见即所得功能才能被视为完成：

1. 五种模式可以通过顶部按钮、命令面板、快捷键和原生菜单进入。
2. 完整 Markdown 夹具通过无损往返测试。
3. 基础 Markdown 可直接排版编辑，复杂块可安全预览和进入源码编辑。
4. 表格、任务列表、图片、代码块、公式和 Mermaid 具有明确且可撤销的编辑行为。
5. 工具栏、搜索替换、跳转、AI、拖放、剪贴板和输入法在新模式可用。
6. 自动保存、首次保存、保存失败、外部冲突和未保存关闭流程保持正确。
7. 任何错误状态都有说明和返回路径，不存在无法退出的交互状态。
8. 全部主题完成真实渲染检查。
9. 单元测试、构建、类型检查、Markdown 回归、主题视觉回归和 Tauri 桌面验证均有通过记录。
