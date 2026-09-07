# UI Tuner — Architecture

> 状态：M1–M8 完成 + 注释模式重构 + 页面侧编辑卡 + Codex 风格 UI 重做。本文档只描述**已实现**的部分，随每次重大变更更新。
> 完整产品规划见根目录 `UI_TUNER_EXECUTION_PLAN.md`。

## 1. 当前范围

Milestone 1 交付：pnpm + Turborepo + TypeScript monorepo、Chrome Extension（MV3）、React Side Panel、Content Script（仅 localhost）、双向消息通道。

Milestone 2 交付：

- **Element Picker**：Edit Mode 下 hover 高亮（≥30fps）、点击选中、`⌘↑` 选父级、Breadcrumb 回跳、Esc 取消/清除
- **Overlay**：独立层（Shadow DOM 隔离），显示边框 + `tag  W × H` 标签，滚动/resize/布局位移每帧自动校正
- **Selection 身份**：`data-ui-tuner-id`（ut-xxxxxx）+ 唯一 CSS selector + nearest-first Breadcrumb

Milestone 3 交付：

- **Style Inspector**：白名单 computed style 抓取 + 属性分组
- **ScrubInput（P0）**：拖动 ±step、Shift ×10、Option ×0.1、方向键、双击键入精确值
- **Preview CSS Engine**：`<style id="ui-tuner-preview-style">` 生成 `[data-ui-tuner-id=…] { prop: value !important }`，永不写 `element.style`
- **ChangeSet 记录**：`StyleChange`（§12）在 content 侧 ChangeTracker 中累积，`preview.changed` 回报面板

Milestone 4 交付：

- **Changes Tab 完整化**（§13）：按元素分组、每条 `prop prev → next` 可单条 Revert、每组 Revert、底部 Reset All
- **重连同步**：content 重连时存量记录补发 `preview.changed`；revert/reset 后重发 `selection.changed` 刷新面板数值

Milestone 5 交付：

- **Local Bridge**（`packages/bridge`）：`npx ui-tuner` / `pnpm bridge` 启动；node:http + ws，**只绑 127.0.0.1:47321**，`/health` JSON 端点
- **项目检测**：package.json 依赖判定框架，常见端口探活 dev server
- **Chrome ↔ Bridge**：Side Panel 直连 WebSocket；hello → welcome 握手；selection / changes 自动镜像

Milestone 6 交付：

- **Example A**：`examples/react-vite`（独立 npm 项目）——Source Resolver 验证对象
- **Source Resolver**（bridge 侧）：regex 级静态索引 + 多信号打分 → 置信度三档（exact / inferred / unknown）
- **Element Identity**：`domFingerprint` 结构签名，HMR 重定位地基

Milestone 7 交付：

- **Agent Tab**：Context 卡 + Instruction 输入 + Agent 行 + Include 开关 + Context Level + Prompt 预览
- **MCP Server**：stateless StreamableHTTP 内嵌 Bridge，`/mcp` 路径，五工具
- **Codex Adapter**：`isAvailable()` 真实探测 CLI；`applyChanges()` 在 M8 真实现

Milestone 8 交付：

- **Apply to Code**：`changes.apply` → CodexAdapter → spawn `codex exec` → fileDiff 检测改动 → `apply.result`
- **HMR 重定位 + 确认**：`locateAppliedElement` + `confirmOneChange` 轮询；静态项目跳过确认提示刷新
- **Apply UI**：idle → Dialog（scope + agent）→ applying → Result 卡

**注释模式重构（2026-09-02）**：

- Side Panel 去 Tab → **两态注释模式**：空闲态只有「选取元素」，选中态显示 Breadcrumb + 操作
- 页面侧注释层（`Annotations`，shadow DOM 隔离），蓝色序号气泡，按注释先后编号
- 中英文切换 + 亮/暗/跟随系统主题
- **样式编辑从 Side Panel 迁到页面侧编辑卡**：面板只剩「选取/注释列表/Agent/Apply」

**页面侧编辑卡（2026-09-03）**：

- `EditorCard`（React，shadow root 隔离）：紧凑/展开两态，就近弹出不超出视口
- **StagingEngine**：保存才记录（stage → PreviewEngine 实时可见；commit 才写 ChangeTracker；rollback 还原）
- **InstructionStore**：elementId → 自然语言指令，页面侧存储
- 样式控件从 sidepanel 抽到 `style-editor/` 供卡片复用

**Codex 风格 UI 重做（2026-09-04）**：

- **Remix Icon 图标系统**：28 个内联 SVG 组件，`fill="currentColor"` 跟随主题
- **属性精简到 17 项**，单值属性折叠下拉（`<select>`），默认态零高亮
- **点击外部关闭编辑卡**（Codex 风格），卡片打开期间 picker 完全停止
- **卡片主题跟随页面背景明暗**（浅色页面 → 暗色卡片，反之亦然）
- **Shadow root Tailwind 修复**：`@layer base` 补 42 个 `--tw-*` 初值（Chrome 不注册 shadow tree 的 `@property`）

M1–M8 + 注释模式 + 编辑卡全部完成。剩余为 backlog 增强项。

## 2. Repo 结构

```txt
ui-tuner/
  dev/index.html                 # localhost 测试页（pnpm page 启动 :8000）
  apps/
    chrome-extension/            # MV3 扩展
    ├ public/manifest.json       # 静态 manifest，构建时拷贝到 dist
    ├ sidepanel.html             # Side Panel HTML 入口
    ├ vite.config.*.ts           # 三个独立构建（见 §4）
    └ src/
        background/              # service worker：点击图标打开 Side Panel
        content/                 # 内容脚本：接线 inspector ↔ Port
        │   └ card/              #   页面侧编辑卡（shadow root）
        │       EditorCard.tsx   #     React 组件（紧凑/展开两态）
        │       mount-card.tsx   #     挂载/卸载 + 放置 + 点击外部关闭
        │       placement.ts     #     就近弹出纯函数（右→左→下→上）
        │       inject-styles.ts #     Tailwind token scoped 到 :host
        │       page-luminance.ts#     页面背景明暗检测
        │       types.ts         #     EditorCardProps
        sidepanel/               # React 应用（两态注释模式，无 Style Tab）
        │   └ components/        #   AgentTab / ChangesTab / ApplySection
        style-editor/            # 样式控件（从 sidepanel 抽出供编辑卡复用）
        │   ScrubInput.tsx       #   拖动 ±step / 方向键 / 双击输入
        │   StylePanel.tsx       #   17 项属性面板（Codex 风格扁平排列）
        │   rows.tsx             #   Row / ScrubField / TextRow / ColorRow / SelectRow
        │   StyleEditContext.tsx  #   React Context 封装
        ui/                      # icons.tsx（Remix Icon 派生内联 SVG）
        i18n/                    # messages.ts（zh/en）+ use-t.ts
        messaging/               # Channel（Port）+ BridgeChannel（WebSocket）
        state/                   # zustand store + prefs（语言/主题）
        styles/                  # sidepanel.css（主题令牌）+ tokens.test.ts
  packages/
    protocol/                    # 共享消息协议：类型 + 守卫 + 构造器
    inspector/                   # DOM 能力（chrome-free，可单测）
    ├ src/picker/Picker.ts       #   Edit Mode 控制器
    ├ src/overlay/Overlay.ts     #   独立高亮层（Shadow DOM + rAF）
    ├ src/dom/identity.ts        #   uiTunerId / 唯一 selector
    ├ src/dom/selection.ts       #   SelectionTracker
    ├ src/dom/snapshot.ts        #   DOM Snapshot
    ├ src/styles/whitelist.ts    #   STYLE_PROPERTIES 白名单
    ├ src/styles/computed.ts     #   pickStyles
    ├ src/styles/parse.ts        #   CSS 值解析/格式化
    ├ src/styles/color.ts        #   颜色归一化
    ├ src/preview/PreviewEngine.ts  # Preview override <style> 引擎
    ├ src/changes/ChangeTracker.ts  # StyleChange 记录
    ├ src/changes/confirm.ts     #   cssValuesEqual / normalizeCssValue
    ├ src/changes/InstructionStore.ts # elementId → 自然语言指令
    ├ src/staging/StagingEngine.ts  # 保存才记录（stage/commit/rollback）
    ├ src/annotations/Annotations.ts # 页面侧气泡注释层
    └ src/styles/overlay.ts      #   Overlay 样式常量
    bridge/                      # 本地 Bridge（Node ESM，无浏览器 API）
    ├ src/server/BridgeServer.ts #   127.0.0.1:47321 + /health + WS + MCP /mcp
    ├ src/detect/                #   项目框架检测 + dev server 探活
    ├ src/resolver/              #   静态源码索引 + 多信号打分
    ├ src/adapter/               #   Codex/ClaudeCode/Cursor 适配器
    ├ src/mcp/                   #   MCP Server（五工具）
    └ src/cli.ts                 #   bin ui-tuner
  examples/
    react-vite/                  # Source Resolver 验证对象
  docs/
    architecture.md              # 本文档
    handover.md                  # 交接文档
    backlog.md                   # 顺延项 / scope 外需求
    superpowers/{specs,plans}/   # 设计文档 + 实施计划
```

## 3. 运行时架构

```txt
┌─────────────────────────── Chrome ───────────────────────────┐   ┌────── Node ──────┐
│                                                               │   │                   │
│  localhost 页面                              Side Panel       │   │  Bridge :47321    │
│  ┌─────────────────────────────┐           ┌──────────────┐  │   │                   │
│  │ Content Script              │  port     │ 两态注释面板  │  │ws │  BridgeServer     │
│  │ ├ Picker (注释模式)         │◄─────────►│ 选取/注释列表 │◄─┼──►│  ├ project detect│
│  │ ├ Overlay (shadow root)     │           │ Agent Tab     │  │   │  ├ /health       │
│  │ ├ Annotations (shadow root) │           │ ApplySection  │  │   │  ├ /mcp (MCP)    │
│  │ ├ EditorCard (shadow root)  │           └──────▲───────┘  │   │  └ lastSync       │
│  │ │ └ StagingEngine           │     tabs.connect │          │   │                   │
│  │ ├ PreviewEngine             │                  │          │   │  Source Resolver  │
│  │ ├ ChangeTracker             │           ┌──────┴───────┐  │   │  Codex Adapter    │
│  │ ├ InstructionStore          │           │ zustand store │  │   └───────────────────┘
│  │ └ SelectionTracker          │           │ selection/    │  │
│  └─────────────────────────────┘           │ changes/…     │  │
│                                            └──────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

**关键变化（vs M8）**：样式编辑从 Side Panel 迁到页面侧 `EditorCard`（shadow root 隔离）。面板不再直接编辑样式，只负责总览/Agent/Apply。

### Bridge 流程（M5）

1. 用户在项目目录跑 `npx ui-tuner`（当前本地 `pnpm bridge --cwd <项目路径>`）→ 检测框架 + 探活 dev server → 监听 127.0.0.1:47321。
2. Side Panel 打开即拨号 WS；连不上 → Offline 卡（Preview 不受影响）。
3. 连上 → hello → welcome（项目信息上屏）。
4. selection / changes 变化自动 `bridge.sync` 镜像 → Bridge 供 MCP 工具读取。

### Source Resolver 流程（M6）

1. `bridge.sync` 带 selection → 对 `project.root` 做静态索引（`src/**/*.{tsx,jsx,ts,js,html}`，regex 级提取组件名/文本/class/标签/id）。
2. 多信号打分：文本 4 / class 1 / 标签 1 / id 3。
3. 置信度：exact（文本唯一强匹配，给 `file:line`）/ inferred（弱匹配，只给 `Possible: file`）/ unknown（Preview only）。

### Agent / MCP 流程（M7）

1. **Agent Tab**：Context 卡 + Instruction + Agent 行 + Include 开关 + Context Level + Prompt 预览 → 发 Bridge。
2. **MCP Server**：`/mcp` 路径，五工具 `ui_get_selection` / `ui_get_changes` / `ui_get_context` / `ui_capture` / `ui_notify_applied`。
3. 面板 Prompt 预览与 Codex 经 `ui_get_context` 拿到的文本**出自同一函数**（`assembleAgentContext`）。

### Apply to Code 流程（M8）

1. 「Apply to Code」→ Dialog（scope + agent）→ `changes.apply` 发 Bridge。
2. CodexAdapter：守卫 → `buildCodexApplyPrompt()`（含精确 css selector + domFingerprint）→ spawn `codex exec`（stdin=ignore）→ fileDiff → `apply.result`。
3. HMR 项目：confirmApply 轮询确认。静态项目：跳过确认，提示刷新。

### 注释模式 + 编辑卡流程

1. Side Panel 点「选取元素」→ Content Script 启动 Picker + `Annotations.setVisible(true)` 显示气泡。
2. 点击元素 → SelectionTracker → 打开 `EditorCard`（就近弹出，紧凑/展开由 props 推出）。
3. **编辑卡内编辑**：拖动/输入 → `StagingEngine.stage` → `PreviewEngine.setOverride`（页面实时可见但不落账）→ 保存 → `commit` 写 ChangeTracker + InstructionStore → `Annotations.sync` 出气泡。
4. **点击外部关闭**（Codex 风格）：`mount-card.tsx` 挂 window capture mousedown，检测点击在卡片外即 rollback + hide。卡片打开期间 picker 完全停止。
5. **退出注释模式**：`stopPicking()` → `clearPageSelection()`（清选中框/overlay，不发 `selection.cleared`，保留 Apply 入口）+ `Annotations.setVisible(false)` 隐藏气泡。页面干净但 Preview 改动保留。
6. **点气泡重开**：`Annotations` 放行点击 → `onOpenEditor` → 重开该元素的编辑卡（含已存指令与序号）。

### 选取流程（M2）

1. 点「选取元素」→ Picker 启动 → hover 高亮 + Overlay 蓝框。
2. 点击 → `SelectionTracker.select()` → `selection.changed` → 打开编辑卡。
3. `⌘↑` → moveToParent/moveToAncestor。
4. Esc → 退出注释模式（清页面选中，保留 Preview + Apply）。

### 样式调整流程（编辑卡内）

1. 选中时 `pickStyles` 抓白名单 computed style → `selection.changed.styles` → 编辑卡渲染属性行。
2. 拖动/输入 → `StagingEngine.stage` → `PreviewEngine.setOverride`（页面实时可见）。
3. 保存 → `commit` 写 ChangeTracker → `preview.changed` 回报面板（Changes 列表 + 计数）。
4. 取消 → `rollback` 还原基线 → 页面恢复。
5. **重置单属性**：`onRevert` 先 `stagingEngine.unstage` 再查 ChangeTracker，查到记录就 `stage(previousValue)`（撤销本身成为本次改动），查不到才 unstage。保证二次保存可用。

### 变更撤销流程（M4）

1. Changes Tab 单条 ↩ / 元素级 Revert / Reset All → content 侧处理 → `preview.changed` 回报。
2. 若受影响元素是当前选中 → 重发 `selection.changed` → 面板数值恢复。

### 性能

- mousemove 只写坐标缓存，`elementFromPoint` 每帧至多一次。
- Overlay 每帧 `getBoundingClientRect`，无目标时 rAF 自停。
- ScrubInput：拖动数值直写 DOM，`onPreview` rAF 节流。
- PreviewEngine 重写前先比对，值未变不触 DOM。
- 编辑卡打开期间 picker 完全停止，零开销。
- Annotations 隐藏期停 rAF，零开销。

## 4. 构建管线

三个独立 Vite 构建：

| 构建                        | 入口                      | 格式       | 原因                                 |
| --------------------------- | ------------------------- | ---------- | ------------------------------------ |
| `vite.config.sidepanel.ts`  | `sidepanel.html`          | ES（默认） | 扩展页面，正常 Vite 应用             |
| `vite.config.content.ts`    | `src/content/index.ts`    | **IIFE**   | MV3 content script 不能是 ES module  |
| `vite.config.background.ts` | `src/background/index.ts` | ES 单文件  | service worker                       |

关键约束：

- sidepanel 构建先执行且唯一 `emptyOutDir: true`；content / background 追加。
- protocol 与 inspector 先经 `tsc` 构建，Vite 内联进产物。turbo 保证顺序。
- `pnpm dev` 并行 watch 三个构建。

## 5. 协议（packages/protocol）

所有跨上下文消息唯一定义在 `@ui-tuner/protocol`。当前消息：

| type                              | 方向          | payload 要点                                                                                   |
| --------------------------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| `content.ready`                   | CS→SP         | url / title / connectedAt                                                                      |
| `sidepanel.ping` / `content.pong` | SP→CS / CS→SP | RTT 探针                                                                                       |
| `sidepanel.picking`               | SP→CS         | `{enabled}` 进入/退出注释模式                                                                  |
| `picker.state`                    | CS→SP         | `{enabled}` 实际状态                                                                           |
| `selection.changed`               | CS→SP         | `{element, breadcrumb, styles, dom?, pickedAt}`                                                |
| `selection.cleared`               | CS→SP         | `{}`                                                                                           |
| `sidepanel.selectAncestor`        | SP→CS         | `{uiTunerId}` breadcrumb 回跳                                                                  |
| `sidepanel.clearSelection`        | SP→CS         | `{}` 「完成此元素」——清选中但不退出注释模式                                                     |
| `preview.changed`                 | CS→SP         | `{changes: StyleChange[], instructions: Record<elementId, string>}` 页面侧变更+指令全量回报    |
| `sidepanel.revertChange`          | SP→CS         | `{changeId}` 撤销单条                                                                          |
| `sidepanel.revertElement`         | SP→CS         | `{elementId}` 撤销元素全部                                                                     |
| `sidepanel.resetChanges`          | SP→CS         | `{}` 清空全部                                                                                  |
| `bridge.hello`                    | SP→Bridge     | `{extensionVersion, pageUrl}`                                                                  |
| `bridge.welcome`                  | Bridge→SP     | `{bridgeVersion, project, devServerUrl}`                                                       |
| `bridge.sync`                     | SP→Bridge     | `{selection, changes}` 镜像                                                                    |
| `bridge.sourceResolved`           | Bridge→SP     | `{elementId, confidence, componentName?, file?, line?}`                                        |
| `agent.request`                   | SP→Bridge     | `{instruction, include, contextLevel, sentAt}`                                                 |
| `bridge.agents`                   | Bridge→SP     | `{agents: AgentInfo[]}`                                                                        |
| `agent.applied`                   | Bridge→SP     | `{files, summary, at}`                                                                         |
| `agent.capture`                   | Bridge→SP     | `{captureId, withScreenshot}`                                                                  |
| `agent.captureResult`             | SP→Bridge     | `{captureId, selection, changes, screenshot?}`                                                 |
| `changes.apply`                   | SP→Bridge     | `{requestId, scope, element, changes[]}`                                                       |
| `apply.result`                    | Bridge→SP     | `{requestId, success, files?, summary?, error?}`                                               |
| `sidepanel.confirmApply`          | SP→CS         | `{changes[]}` HMR 确认                                                                         |
| `sidepanel.reloadPage`            | SP→CS         | `{}` 静态项目刷新                                                                              |
| `apply.confirmed`                 | CS→SP         | `{appliedChangeIds, failedChangeIds, reidentified}`                                            |

**已删除**：`sidepanel.stylePreview`——样式编辑迁到页面侧编辑卡后，面板不再下发编辑指令。

约定：

- 每条消息 `{ type, payload }`，payload 恒为非数组对象；边界处 `isUiTunerMessage()` 收窄，非法消息静默丢弃。
- MCP 不经 WS 协议——Agent 用标准 MCP over HTTP（`/mcp`）。

## 6. 关键设计决策

| 决策                                                                                                      | 理由                                                           |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| TypeScript 锁 5.9                                                                                         | typescript-eslint 8.x 不支持 TS 7；稳定性优先                  |
| 手写 Vite 多构建，不用 CRXJS                                                                              | 依赖少、行为可控                                               |
| Picker / Overlay / PreviewEngine 放 `packages/inspector`，不 import chrome                                | jsdom 可单测；chrome 接线只在 content script                   |
| Overlay / Annotations / EditorCard 用 Shadow DOM 隔离                                                     | 不污染宿主页面样式，也不被宿主样式污染                         |
| Preview 只走独立 `<style>` override，永不写 `element.style`                                               | 可整块撤销、不动内联状态                                       |
| 样式读写只经 `STYLE_PROPERTIES` 白名单                                                                    | 永不读/写完整 computed style                                   |
| ChangeSet 真相在 content（ChangeTracker），面板只镜像                                                     | 页面刷新即清空；面板崩溃不丢页面状态                           |
| Bridge 由 Side Panel 直连 WebSocket（不经 background SW）                                                 | MV3 SW 空闲回收会断 WS                                         |
| Bridge 只绑 127.0.0.1:47321                                                                               | 安全边界                                                       |
| Source Resolver 放 bridge 做 regex 级静态索引                                                             | 浏览器无文件系统；不伪造源码位置                               |
| **StagingEngine 保存才记录**：stage → PreviewEngine（页面可见）；commit → ChangeTracker；rollback 还原     | 取消/删除能干净还原；避免「拖一下就产生记录」的噪声            |
| **仅指令元素是一等公民**：`Annotations.sync(changes, instructions)` 取并集                                 | 只写自然语言也是有效诉求，不被当「空」丢弃                     |
| **气泡只在注释模式激活时绘制**：`setVisible()` 改宿主 `display`，隐藏期停 rAF                              | 单纯浏览时不该带标注；display 让序号跨切换存活                 |
| **退出注释模式只清页面选中**：`clearPageSelection()` 不发 `selection.cleared`，保留 `lastSelector`         | ApplySection 门控在 selection 上，发了 cleared 就删掉 Apply 入口 |
| **编辑卡就近弹出**：`placement.ts` 按右→左→下→上取候选，`flushSync` 先渲染再量尺寸                         | 卡片贴在元素旁边；不先同步渲染量到 0×0 会误判溢出              |
| **编辑卡默认态由 props 推出**：`number !== null ∨ changedProperties 非空 ∨ 已有指令` → 展开，否则紧凑     | 新元素常只需一句话；已注释元素必须展开看高亮                   |
| **卡片主题由页面背景 luminance 决定**                                                                     | 浅色页面 → 暗色卡片，确保对比度                                |
| **编辑卡挂在 shadow root + `adoptedStyleSheets`**，Tailwind token scoped 到 `:host`                       | 不污染宿主也不被污染；`:root` 在 shadow 里拿不到               |
| **`card.css` 用 `@layer base` 补 42 个 `--tw-*` 初值**                                                   | Chrome 不注册 shadow tree 的 `@property`，Tailwind border/shadow/ring 静默失效 |
| **23 个主题令牌在 sidepanel.css 与 card.css 之间逐字复制**，`tokens.test.ts` 防漂移守卫                    | shadow root 里 `:root` 拿不到，共享文件抽不干净                |
| **图标一律 `src/ui/icons.tsx`**（Remix Icon 派生内联 SVG，`fill="currentColor"`）                         | 不用图标字体（manifest 无 `web_accessible_resources`）         |
| **点击外部关闭编辑卡**：window capture mousedown 检测 + 延迟 200ms 摘 handler                             | Codex 风格；同一物理点击的 click 还会来，要挡住                |
| **卡片打开期间 picker 完全停止**                                                                          | 不只停 click，mousemove 也不能触发 overlay                     |
| **单值属性用 `<select>` 折叠下拉**，真值不在候选时插到第一项                                              | 段选挤且满眼高亮；`<select>` 匹配不到 option 静默显示第一项    |
| **默认态零高亮**：强调色只给正在调的控件 + 已改动行                                                       | 用户明确要「默认不要高亮」                                     |
| **可交互控件用 `focus:` 不用 `focus-visible:`**                                                           | Chrome 对非文本元素的鼠标点击不匹配 `:focus-visible`           |
| **`onRevert` 先 unstage 再查记录**：查到记录 stage(previousValue)，查不到才 unstage                        | 保证重置已保存属性后二次保存可用                               |
| **`canSave` 读原始 dirtySet，传给 rows 的 dirty 减去 reverted**                                           | 重置按钮该消失，保存该能点——两个问题不能共用一个集合           |
| **`codex exec` spawn 用 `stdio:["ignore","pipe","pipe"]`**                                                | 默认 pipe 的 stdin 不关闭会让 codex 阻塞                       |
| **Apply 改动检测用 mtime+size 快照比对**，不依赖 git                                                      | 用户项目未必是 git 仓库                                        |

## 7. 测试

- `packages/protocol`（26 例）：构造器、守卫、按类型收窄、`assembleAgentContext`。
- `packages/inspector`（119 例，jsdom）：
  - identity / selection / snapshot / parse / color / computed
  - PreviewEngine / ChangeTracker / confirm
  - Picker / Overlay
  - **StagingEngine**：stage/commit/rollback/unstage
  - **Annotations**：sync(changes, instructions) 取并集、setVisible 显隐、序号跨切换存活
  - **InstructionStore**：get/set/clear/remove
- `packages/bridge`（74 例，node env）：detectProject / probeDevServer / BridgeServer / resolver / adapter / mcp。
- `chrome-extension`（167 例）：
  - Channel / BridgeChannel / store / format-changeset
  - **EditorCard**（23 例）：紧凑/展开两态、默认态推出、属性面板、reset、联动
  - **mount-card**（9 例）：挂载/卸载、ResizeObserver 重 clamp、点击外部关闭
  - **placement**（9 例）：四候选翻边、贴边角 clamp
  - **rows**：ScrubField / TextRow / ColorRow / SelectRow / useIsChanged / dirty reset
  - **ScrubInput**：拖动提交、空操作 no-op、snapToStep 精度
  - **content**：openEditorCard、onRevert、changedProperties
  - **icons**（28 例）：每个图标 fill="currentColor"
  - **tokens**（3 例）：sidepanel.css 与 card.css 令牌名集合齐平
  - **i18n**：zh/en 键齐平
  - **prefs**：语言/主题切换
- 真机浏览器验收：`.playwright-mcp/verify-codex-card-ui.mjs` 106/106 断言通过。
- 真机 E2E（`/tmp/ui-tuner-e2e/`）：M6 9/9、M8 8/8。

## 8. 已知限制 / 风险

- 页面导航/刷新后 Port 断开需手动 Reconnect；自动重连在 backlog。
- 预览修改随页面刷新消失（预期行为）。跨刷新持久化依赖 HMR 重定位（backlog）。
- 颜色提交写 `#rrggbb`，半透明色丢失 alpha（backlog）。
- Bridge 只在 Side Panel 打开时在线。
- CLI 未发布 npm：`npx ui-tuner` 不可用；本地用 `pnpm bridge --cwd <项目路径>`。
- **编辑卡内 Esc 会退出整个注释模式**（期望：只关卡片）。backlog。
- **编辑卡麦克风是禁用占位**（灰态 + 「语音输入即将上线」）。backlog。
- **MCP / Codex**：codex 需走代理；codex exec 需 `--dangerously-bypass-approvals-and-sandbox`；spawn 必须 stdin=ignore。
- **Apply HMR 确认**：8s 超时，慢构建可能 confirmed < 总数。
- Source Resolver V1：覆盖 Vite/React + 静态 HTML；Next App Router 顺延。数据驱动文本无静态字面量 → 只能 inferred。
- Bridge 需 `--cwd` 匹配正在浏览的项目，否则全部 unknown。
- Multi Select / `⌘↓` 顺延。
- hover 不进入 iframe / closed shadow root。
- box-shadow / grid-template 只提供文本编辑。
- StrictMode 开发环境会建两次 Port（生产无此现象）。
