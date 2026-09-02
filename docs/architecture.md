# UI Tuner — Architecture（Milestone 7）

> 状态：Milestone 7 完成（Agent Tab + MCP Server + Codex Adapter：Codex 可获取元素 Context）。本文档只描述**已实现**的部分，随每个 Milestone 更新。
> 完整产品规划见根目录 `UI_TUNER_EXECUTION_PLAN.md`。

## 1. 当前范围

Milestone 1 交付：pnpm + Turborepo + TypeScript monorepo、Chrome Extension（MV3）、React Side Panel、Content Script（仅 localhost）、双向消息通道。

Milestone 2 交付：

- **Element Picker**：Edit Mode 下 hover 高亮（≥30fps）、点击选中、`⌘↑` 选父级、Breadcrumb 回跳、Esc 取消/清除
- **Overlay**：独立层（Shadow DOM 隔离），显示边框 + `tag  W × H` 标签，滚动/resize/布局位移每帧自动校正
- **Selection 身份**：`data-ui-tuner-id`（ut-xxxxxx）+ 唯一 CSS selector + nearest-first Breadcrumb

Milestone 3 交付：

- **Style Inspector 三 Tab**（Style 默认 / Agent 占位 / Changes 列表）
- **Style 分组**：Layout（display / flex 方向 / 3×3 对齐 / wrap / gap）/ Size / Spacing（Simple V·H + Advanced T·R·B·L）/ Typography / Fill / Border / Effects
- **ScrubInput（P0）**：拖动 ±step、Shift ×10、Option ×0.1、方向键、双击键入精确值
- **Preview CSS Engine**：`<style id="ui-tuner-preview-style">` 生成 `[data-ui-tuner-id=…] { prop: value !important }`，永不写 `element.style`
- **ChangeSet 记录**：`StyleChange`（§12）在 content 侧 ChangeTracker 中累积，`preview.changed` 回报面板

Milestone 4 交付：

- **Changes Tab 完整化**（§13）：按元素分组、每条 `prop prev → next` 可单条 Revert（§14 Revert single property）、每组 Revert（Revert element）、底部 Reset All（Reset all preview changes）；「Apply · M8」占位计数
- **重连同步**：content 重连时（content.ready 后）若有存量记录主动补发 `preview.changed`；revert/reset 后若当前选中元素受影响则重发 `selection.changed` 刷新面板数值
- 面板 `elementNames`（elementId→tagName 累积映射）作为 Changes 分组标签（组件名不伪造，§20）

**M4 验收标准**：所有 Preview 修改可恢复。

Milestone 5 交付：

- **Local Bridge**（`packages/bridge`）：`npx ui-tuner` / `pnpm bridge` 启动；node:http + ws，**只绑 127.0.0.1:47321**（§38），`/health` JSON 端点
- **项目检测**：package.json 依赖判定框架（Next.js/Vite/CRA/React/…），常见端口探活 dev server（3000/5173/8080/4000/8000）
- **Chrome ↔ Bridge**（§16）：Side Panel 直连 WebSocket；hello → welcome 握手（项目信息上屏）；selection / changes 变化自动 `bridge.sync` 镜像（M7 MCP 工具数据源）
- **Bridge Offline 卡**（§35）：未连接不影响 Preview 编辑，提示 `npx ui-tuner` + Reconnect

**M5 验收标准**：浏览器可以发送 Selection + ChangeSet。

Milestone 6 交付：

- **Example A**（计划 §39）：`examples/react-vite`（独立 npm 项目，不进 pnpm workspace）——Navbar/Card/Button/Form/List，Source Resolver 的验证对象
- **Source Resolver**（bridge 侧 `resolver/`）：regex 级静态索引（组件名 / JSX 文本 / className / 标签 / id，每命中带行号）+ 多信号打分（§21 selector/text/class/标签/id）→ 置信度三档
- **置信度纪律**（§20，不伪造）：`exact`（文本唯一强匹配，给 `file:line`）/ `inferred`（弱匹配，只给 `Possible: file`）/ `unknown`（Preview only）
- **Element Identity**（§21）：`SelectionElement` 增 `domFingerprint` 结构签名（`tag#id.cls>[子标签]`），§22 HMR 重定位地基
- **Source UI**：Element Header 按三态渲染（● Source linked / ● Source inferred / Preview only）；`bridge.sourceResolved` 消息 + stale 守卫

**M6 验收标准**：Demo 项目可以显示源码位置。

Milestone 7 交付（计划 §23–§27 + §44）：

- **Agent Tab**（§23）：Context 卡（元素 + 源码行 + 截图占位）、Instruction textarea、Agent 行（Codex + ●available，§36 Offline 提示）、Include 五开关（DOM/Styles/Source/Screenshot/Parent Tree）、Context Level 1/2/3（§25，默认 L1 §24）、§26 Prompt 实时预览 + Copy、发送至 Bridge
- **Prompt Context**（§24/§25/§26）：protocol 的 `assembleAgentContext()` 纯文本组装，**面板预览与 MCP `ui_get_context` 共用同一函数**（杜绝两处漂移）；L1=element/component/source/styles/changes/instruction，L2+=parent tree/DOM 结构，L3+=截图提示（截图本体走 ui_capture）
- **MCP Server**（§27）：stateless StreamableHTTP（@modelcontextprotocol/sdk 1.30）内嵌 Bridge 进程，挂在同一 47321 server 的 `/mcp` 路径——与 WS 侧共享 lastSync/lastResolution/lastAgentRequest；五工具 `ui_get_selection` / `ui_get_changes` / `ui_get_context{level}` / `ui_capture{withScreenshot}` / `ui_notify_applied{files,summary}`
- **ui_capture 往返**：Bridge→面板（WS `agent.capture`）→面板注入的 `chrome.tabs.captureVisibleTab` → `agent.captureResult` 回 Bridge → MCP 响应（截图作 MCP image content）；面板未连/超时诚实报错
- **Codex Adapter**（§44）：`AgentAdapter` 接口 {id,name,isAvailable(),applyChanges()}；Codex/ClaudeCode/Cursor——`isAvailable()` 真实探测 CLI（`<bin> --version`）；Codex 的 `applyChanges()` 在 M8 已真实现（spawn `codex exec` + fileDiff），ClaudeCode/Cursor 仍诚实返回 `NOT_IMPLEMENTED`，**绝不假实现成功**

**M7 验收标准**：Codex 可以获取当前元素 Context。

Milestone 8 交付（计划 §29/§30/§31/§34 + §44–§47 + §22）：

- **Apply 协议**：`ApplyScope`(instance|component) / `ApplyErrorCode` / `ApplyElementContext` / `ApplyChangeRequest` / `ApplyChangeResult`；消息 `changes.apply`(SP→Bridge) / `apply.result`(Bridge→SP) / `sidepanel.confirmApply`(SP→content) / `apply.confirmed`(content→SP)
- **CodexAdapter.applyChanges 真实现**（§44/§47）：无 source→`SOURCE_NOT_FOUND`、CLI 不在→`AGENT_OFFLINE`、否则 `buildCodexApplyPrompt()`（§28 约束：Tailwind 改 utility 不加 inline；plain CSS 改类规则；组件库保抽象；最小改动）→ spawn `codex exec` → `fileDiff.ts`（mtime+size 签名，不依赖 git）检测真实改动文件 → 成功报 files+summary；exit≠0/无改动/超时→诚实 `APPLY_FAILED`，**绝不假成功**
- **spawn stdin 必须 `ignore`**：默认 pipe 的 stdin 永不关闭会让 codex 阻塞在 "Reading additional input from stdin…"（真机卡死根因）；`codexEnv()` 透传代理 + 强制 `NO_PROXY` 含 loopback
- **Apply UI**（`ApplySection.tsx` 挂在 ChangesTab）：idle「Apply to Code」→ §30 Dialog（scope + agent + sourceUnknown 警告）→ §34 applying 态 → §31 Result 卡（✓ Applied emerald / Unable 红 + Retry）
- **HMR 重定位 + 确认**（§22/§29）：content `locateAppliedElement`（data-ui-tuner-id → selector+fingerprint 回退）+ `confirmOneChange` 轮询（移除 override→读 computed→`cssValuesEqual` 比对→不匹配恢复 override 重试）；确认后 drop override+记录，面板 Preview 计数归零

**M8 验收标准**：浏览器 UI 调整能够最终落到真实源码。

M1–M8 全部完成。剩余为 backlog 增强项：Next App Router 适配 / 数据驱动文本索引 / 索引缓存 / HMR 跨刷新持久化（§37）/ 颜色 alpha / CLI npm 发布 / codex MCP 免 bypass 配置 / ui_capture 元素级裁剪。

## 2. Repo 结构

```txt
ui-tuner/
  dev/index.html                 # localhost 测试页（pnpm page 启动 :8000）
  apps/
    chrome-extension/            # MV3 扩展
    ├ public/manifest.json       # 静态 manifest，构建时拷贝到 dist
    ├ sidepanel.html             # Side Panel HTML 入口（包根 → dist 根）
    ├ vite.config.*.ts           # 三个独立构建（见 §4）
    ├ scripts/dev.mjs            # 并行 watch 三个构建
    └ src/
        background/              # service worker：点击图标打开 Side Panel
        content/                 # 内容脚本：接线 inspector ↔ Port（chrome 知识只在这里）
        sidepanel/               # React 应用（App.tsx 三 Tab）
        │   └ components/        #   ScrubInput / StylePanel / rows / ChangesTab
        messaging/               # Channel（Port）+ BridgeChannel（WebSocket）类型化封装
        state/                   # zustand store（连接 + 选取 + changes + bridge 状态）
        styles/                  # Tailwind 入口 + 基础样式
  packages/
    protocol/                    # 共享消息协议：类型 + 守卫 + 构造器
    inspector/                   # DOM 检查能力（chrome-free，可单测）
    ├ src/picker/Picker.ts       #   Edit Mode 控制器（rAF 合并 mousemove）
    ├ src/overlay/Overlay.ts     #   独立高亮层（Shadow DOM + rAF 跟踪）
    ├ src/dom/identity.ts        #   uiTunerId / 唯一 selector / 文本预览
    ├ src/dom/selection.ts       #   SelectionTracker（身份注册 + breadcrumb + keepId）
    ├ src/dom/snapshot.ts        #   DOM snapshot（总预算 12000 截断，§3.1）
    ├ src/measurement/rect.ts    #   Bounds 快照
    ├ src/styles/whitelist.ts    #   STYLE_PROPERTIES 白名单（§7）
    ├ src/styles/computed.ts     #   pickStyles：computed style → 白名单过滤
    ├ src/styles/parse.ts        #   CSS 值解析/格式化 + scrubMultiplier（§10）
    ├ src/styles/color.ts        #   rgb()/rgba()/hex → #rrggbb
    ├ src/preview/PreviewEngine.ts  # Preview override <style> 引擎（§11）
    ├ src/changes/ChangeTracker.ts  # StyleChange 记录（§12）
    └ src/styles/overlay.ts      #   Overlay 样式常量（唯一样式来源）
    bridge/                      # 本地 Bridge（Node ESM，规则 8：无浏览器 API）
    ├ src/server/BridgeServer.ts #   127.0.0.1:47321 + /health + WebSocket + sourceResolved
    ├ src/detect/project.ts      #   package.json 依赖 → 框架
    ├ src/detect/devserver.ts    #   常见 dev 端口探活
    ├ src/resolver/indexer.ts    #   静态源码索引（组件名/文本/class/标签/id + 行号）
    ├ src/resolver/resolve.ts    #   多信号打分 → exact/inferred/unknown（§19/§20）
    ├ src/cli.ts                 #   bin ui-tuner（§15 启动横幅）
    └ dist/                      #   tsc 直出，node 直接运行
  examples/
    react-vite/                  # 计划 §39 Example A（独立 npm 项目）：Source Resolver 验证对象
  docs/
    architecture.md              # 本文档
    handover.md                  # 交接文档（每里程碑更新）
    backlog.md                   # 顺延项 / scope 外需求
```

## 3. 运行时架构

```txt
┌──────────────────────── Chrome ────────────────────────┐   ┌──────── Node ─────────┐
│                                                         │   │                       │
│  localhost 页面                        Side Panel (React)│   │  ui-tuner bridge      │
│  ┌───────────────────────────┐        ┌──────────────┐  │   │  (127.0.0.1:47321)    │
│  │ Content Script            │  port  │ zustand store│  │ws │                       │
│  │ ├ Picker (edit mode)      │◄──────►│ selection/   │◄─┼──►│  BridgeServer        │
│  │ ├ Overlay (shadow root)   │        │ changes/…    │  │   │  ├ project detect   │
│  │ └ SelectionTracker        │        └──────▲───────┘  │   │  ├ /health          │
│  │   PreviewEngine/ChangeTracker      │ tabs.connect  │   │  └ lastSync (M7 源)  │
│  └──────────┬────────────────┘        │              │   │                       │
│             │ manifest 注入            │              │   └───────────────────────┘
│  ┌──────────┴──────────┐    ┌─────────┴──────────┐
│  │ background.js (SW)  │───►│ action 点击开面板   │    ← SW 不参与 Bridge 通道
│  └─────────────────────┘    └────────────────────┘      （MV3 空闲回收会断 WS）
└─────────────────────────────────────────────────────────┘
```

### Bridge 流程（M5）

1. 用户在项目目录跑 `npx ui-tuner`（发布后命令；当前未发布 npm，本地等价 `pnpm bridge --cwd <项目路径>` 或项目目录内 `node …/dist/cli.js`）：检测框架 + 探活 dev server → 打印 §15 横幅 → 监听 127.0.0.1:47321。
2. Side Panel 打开即拨号 `ws://127.0.0.1:47321`；连不上 → Bridge Offline 卡（§35：Preview 不受影响，提示启动命令）。
3. 连上 → `bridge.hello`（扩展版本 + 页面 URL）→ Bridge 回 `bridge.welcome`（框架/root/dev server）→ 面板 Bridge 卡显示 `Vite · localhost:5173`。
4. 之后每次 `selection.changed` / `selection.cleared` / `preview.changed`，面板自动转发 `bridge.sync {selection, changes}` —— Bridge 持有最新镜像，供 M7 MCP `ui_get_selection` / `ui_get_changes`。
5. Bridge 关闭/崩溃 → onclose → 面板回 Offline；Reconnect 重拨。

### Source Resolver 流程（M6，计划 §19/§20/§21）

1. `bridge.sync` 带 selection 到达 Bridge → 除存储镜像外，立即对 `project.root` 做静态索引（`resolver/indexer`：扫 `src/**`（无 src/ 则扫根）的 `*.{tsx,jsx,ts,js,html}`，提取默认导出组件名、JSX/HTML 文本字面量、className/class token、小写标签、id，每个命中带 1-based 行号；跳过 node_modules/dist 等，上限 500 文件 / 200KB 每文件；每次解析重建，dev 项目毫秒级）。
2. `resolver/resolve` 把 selection 的身份信号（§21：selector 的 id 锚点、text、fingerprint/outerHTML 的 class、tagName）对索引打分：文本 4（全索引唯一 +1）/ class 1（封顶 3）/ 标签 1 / id 3。
3. 置信度判定（§20，**不伪造**）：文本命中且得分 ≥5 且领先次名 ≥2 → `exact`（组件名 + `file:line`，行号指向 JSX 调用点，与 React 语义一致——如「查看详情」按钮定位到 Card.tsx 的 `<Button>` 行）；得分 ≥3 → `inferred`（只给 `Possible: file`，**绝不给行号**）；否则 `unknown`（Preview only）。
4. 结果以 `bridge.sourceResolved` 回发面板；解析异常一律降级 `unknown`，不影响 sync 通道。
5. 面板 store 做 stale 守卫（elementId 不匹配当前选中即丢弃），重选/清除/断线置 null → Element Header 三态渲染（● Source linked 绿 / ● Source inferred 黄 / Preview only）。

### Agent / MCP 流程（M7，计划 §23–§27 + §44）

1. **Agent Tab**（§23）：面板展示选中元素 Context 卡 + Instruction 输入 + Agent 行（Codex，●available 来自 `bridge.agents`）+ Include 开关 + Context Level + §26 Prompt 实时预览（`assembleAgentContext`）。「发送至 Bridge」把 `agent.request {instruction, include, contextLevel}` 经 WS 给 Bridge 存为 `lastAgentRequest`。
2. **MCP Server**（§27）：内嵌 Bridge 进程，stateless StreamableHTTP 挂在同一 server 的 `/mcp`。每请求新建 McpServer+transport，deps 闭包读 Bridge 实时状态（lastSync / lastResolution / lastAgentRequest）。Codex 注册：`codex mcp add ui-tuner --url http://127.0.0.1:47321/mcp`。
3. **五工具**：`ui_get_selection`（selection+source+project）/ `ui_get_changes`（changes）/ `ui_get_context{level}`（`assembleAgentContext` 组装，含 lastAgentRequest 的 instruction/include）/ `ui_capture{withScreenshot}`（WS 往返面板取新鲜快照+截图，截图作 MCP image content）/ `ui_notify_applied{files,summary}`（记录 + 广播 `agent.applied` 给面板弹横幅）。空状态一律诚实文本（未选中/面板未连/超时）。
4. **Adapter**（§44）：`CodexAdapter.applyChanges()` 见下方 M8 流程；ClaudeCode/Cursor 仍返回 `NOT_IMPLEMENTED`。
5. 面板 Agent Tab 的 Prompt 预览与 Codex 实际经 `ui_get_context` 拿到的文本**出自同一函数**，保证「所见即 Agent 所得」。

### Apply to Code 流程（M8，计划 §29/§30/§31 + §22）

1. Changes Tab 底部「Apply to Code」（仅当选中元素有待应用 changes 且 Bridge 在线 **且 source 非 unknown**，否则禁用并给原因）→ §30 Dialog：scope radio（This instance / Component）+ Agent 行（Codex ●available）+ sourceUnknown 时黄条警告（Preview only，Apply 需 ● Source linked；可改用「复制改动」手动粘贴给 AI）。
2. 「Apply」→ store `applyChanges(scope)` 只把**选中元素**的 changes 连同 source/identity 组成 `changes.apply` 发 Bridge，进入 §34 applying 态。
3. Bridge `CodexAdapter.applyChanges()`：守卫（无 source→`SOURCE_NOT_FOUND`、CLI 离线→`AGENT_OFFLINE`）→ `buildCodexApplyPrompt()`（**Target 段含精确 `css selector` + `domFingerprint`（tag#id.class）+ 显式指令「按 id/selector grep 定位，勿凭文本语义猜元素」**——否则 inferred 无行号时 codex 会猜错规则；§28 约束）→ spawn `codex exec`（**stdin=ignore**，否则 codex 阻塞读 stdin）→ `detectChangedFiles`（mtime+size，不依赖 git）比对 → 回 `apply.result`（成功 files+summary / 诚实 `APPLY_FAILED`）。
4. **HMR 项目**（framework ≠ Unknown）：成功时面板向 content 发 `sidepanel.confirmApply {changes}` → content 对每条 change 做 HMR 重定位 + 轮询确认（移除 override 读 computed，`cssValuesEqual` 比对；达标即 drop override+记录，否则恢复重试至 8s 超时）→ `apply.confirmed` 回面板。**静态项目**（framework = Unknown，无 HMR）：跳过确认轮询，置 `applyNeedsReload`，Preview 覆盖保留。
5. 面板 §31 Result 卡：✓ Applied（emerald，列 files + summary + confirmed 计数）/ Unable to apply changes（红，列 reason + Retry）。**静态项目额外显示「改动已写入源码 · 需刷新后生效」+「刷新页面查看」按钮**（发 `sidepanel.reloadPage` → content `location.reload()`）。超时/失败的 Preview 覆盖保持激活，不静默丢。

### 选取流程（M2）

1. Side Panel 点「选取元素」→ `sidepanel.picking {enabled:true}` → Content Script 启动 Picker，回 `picker.state` 同步状态。
2. Picker rAF 循环：`elementFromPoint`（mousemove 只更新坐标缓存，一帧一次）→ hover 变化时 Overlay 画蓝框 + `tag  W × H` 标签。
3. 点击（capture 阶段拦截，阻止页面响应）→ Picker 停止 → `SelectionTracker.select()`：打 `data-ui-tuner-id`、生成唯一 selector、构建 breadcrumb → `selection.changed` → Side Panel 显示选中卡片，Overlay 画紫框。
4. `⌘↑` / breadcrumb 点击 → `SelectionTracker.moveToParent/moveToAncestor` → 新的 `selection.changed`。
5. Esc：picking 中 → Picker 自身处理取消；已选中 → Content Script 全局 keydown 清除 → `selection.cleared`。
6. 选中元素被移出 DOM（HMR 等）→ Overlay 检测 `isConnected` → 立即隐藏并发 `selection.cleared`（不静默错选）。
7. Port 断开（面板关闭/导航）→ Content Script 清理 Picker/Overlay/Tracker，面板重开时重建。

### 样式调整流程（M3）

1. 选中时 `SelectionTracker.select()` 用 `pickStyles(getComputedStyle(el))` 抓**白名单** computed style，随 `selection.changed.styles` 发到面板；`domSnapshotFor` 附带截断的 DOM 快照（`dom`，供后续 Agent 上下文用，面板不渲染）。
2. 面板 Style Tab 各行读 `store.styleValues`（提交值快照）。ScrubInput 拖动帧 → `updateStyle(prop, "20px", false)` → `sidepanel.stylePreview {committed:false}` —— **不更新 store 的 `styleValues`**。注意「零重渲染」只对 ScrubInput 成立（它用 ref 跟踪拖动值、直写 DOM）；但每帧 content 回的 `preview.changed` 会更新 `changes`，而 App 顶层订阅 `changes`（徽标）→ **整个面板仍会重渲染**。因此 **ColorRow 不能把原生取色 input 直接绑到滞后的 `styleValues`**——否则重渲染会把它拨回原色、blur 提交错值；ColorRow 用本地 `draft` state 跟踪拖动期实时色值，blur 提交 draft（对齐 ScrubInput 的 ref 模式）。
3. Content Script 收到 stylePreview：`(elementId, property)` 首帧先取当前 computed 值作为 `previousValue` 存入 ChangeTracker，然后 `PreviewEngine.setOverride` 重写 `<style>` 规则文本（值未变则 no-op）。
4. 释放 → `committed:true` → ChangeTracker 定稿该条 StyleChange → 若 `cssValuesEqual(nextValue, previousValue)`（拖回原值，**颜色感知**：`rgb(47,109,246)` ≡ `#2f6df6` 经 `colorKey` 归一判等）则删除记录并撤掉 override → `preview.changed {changes}` 回报面板（Changes Tab 列表 + Tab 徽标计数）。
5. 选中转移时，有 change 记录的元素保留 `data-ui-tuner-id`（`keepId`），override 继续生效；全部状态（engine + tracker）在 Port 断开后仍存活，**随页面刷新消亡**（§37 in-memory 原则）。

### 变更撤销流程（M4）

1. Changes Tab 单条 ↩ → `sidepanel.revertChange {changeId}`；元素级 Revert → `sidepanel.revertElement {elementId}`；Reset All → `sidepanel.resetChanges`。
2. Content：ChangeTracker 删除记录 → PreviewEngine 移除对应 override（reset 用 unmount）→ `preview.changed` 回报新列表。
3. 若受影响元素正是当前选中 → 重发 `selection.changed`（重新 select，computed styles 已恢复原值）→ 面板 Style 数值回到页面真值。
4. 面板重连（未刷新页面）→ content.ready 后存量记录随 `preview.changed` 补发 → Changes 列表恢复（elementNames 需重新选中后才显示 tagName，之前显示 ut 短码）。

### 性能（计划 §33 红线）

- mousemove 处理器只写坐标缓存（passive listener），`elementFromPoint` 每帧至多一次。
- Overlay 持有 Element 引用，每帧仅 `getBoundingClientRect` + 少量 style 写入；无目标时 rAF 自动停止。
- 选取后（非 picking）没有任何循环开销。
- ScrubInput：pointermove 数值直写 DOM（绕过 React），`onPreview` 消息按 rAF 节流发出；拖动期间面板不重渲染。
- PreviewEngine 重写整段 CSS 文本前先比对，值未变不触 DOM。

## 4. 构建管线

Chrome 对产物的要求决定了一次 `vite build` 不够用，因此有**三个独立构建**，由 npm script 链式执行：

| 构建                        | 入口                      | 格式       | 原因                                 |
| --------------------------- | ------------------------- | ---------- | ------------------------------------ |
| `vite.config.sidepanel.ts`  | `sidepanel.html`          | ES（默认） | 扩展页面，正常 Vite 应用             |
| `vite.config.content.ts`    | `src/content/index.ts`    | **IIFE**   | MV3 content script 不能是 ES module  |
| `vite.config.background.ts` | `src/background/index.ts` | ES 单文件  | service worker（`"type": "module"`） |

关键约束：

- sidepanel 构建先执行且是唯一 `emptyOutDir: true` 的构建；content / background 以 `emptyOutDir: false` 追加。
- `public/manifest.json` 由 Vite `publicDir` 拷贝进 dist，引用固定文件名 `content.js` / `background.js` / `sidepanel.html`。
- protocol 与 inspector 包先经 `tsc` 构建出 `dist/`，扩展构建时由 Vite 打进产物（IIFE 内联）。turbo `^build` 保证顺序。

`pnpm dev` 并行跑三个 `vite build --watch`；改动后在 `chrome://extensions` 刷新扩展即可。

## 5. 协议（packages/protocol）

所有跨上下文消息唯一定义在 `@ui-tuner/protocol`（规则 6）。当前消息：

| type                              | 方向          | payload 要点                                                                                   |
| --------------------------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| `content.ready`                   | CS→SP         | url / title / connectedAt（连接即发）                                                          |
| `sidepanel.ping` / `content.pong` | SP→CS / CS→SP | RTT 探针（通道验收工具）                                                                       |
| `sidepanel.picking`               | SP→CS         | `{enabled}` 进入/退出选取模式                                                                  |
| `picker.state`                    | CS→SP         | `{enabled}` 实际状态（Esc 等以这里为准）                                                       |
| `selection.changed`               | CS→SP         | `{element, breadcrumb, styles, dom?, pickedAt}`；styles = 白名单 computed（§7/§18）            |
| `selection.cleared`               | CS→SP         | `{}`                                                                                           |
| `sidepanel.selectAncestor`        | SP→CS         | `{uiTunerId}` breadcrumb 回跳                                                                  |
| `sidepanel.stylePreview`          | SP→CS         | `{uiTunerId, property, value, committed}`；committed=false 拖动帧 / true 提交（§10/§11）       |
| `preview.changed`                 | CS→SP         | `{changes: StyleChange[]}` 页面侧变更记录全量回报（§12/§13）；重连时存量补发                   |
| `sidepanel.revertChange`          | SP→CS         | `{changeId}` 撤销单条修改（§14）                                                               |
| `sidepanel.revertElement`         | SP→CS         | `{elementId}` 撤销该元素全部修改（§14）                                                        |
| `sidepanel.resetChanges`          | SP→CS         | `{}` 清空全部 preview 修改（§13/§14）                                                          |
| `bridge.hello`                    | SP→Bridge     | `{extensionVersion, pageUrl}` WebSocket 握手（§16）                                            |
| `bridge.welcome`                  | Bridge→SP     | `{bridgeVersion, project{name,framework,root}, devServerUrl}`（§15）                           |
| `bridge.sync`                     | SP→Bridge     | `{selection, changes}` 页面状态镜像，selection/changes 变化即转发（M7 工具数据源）             |
| `bridge.sourceResolved`           | Bridge→SP     | `{elementId, confidence, componentName?, file?, line?}`（§19/§20）；inferred/unknown 不带 line |
| `agent.request`                   | SP→Bridge     | `{instruction, include, contextLevel, sentAt}`（§23/§24/§26）；MCP `ui_get_context` 数据源     |
| `bridge.agents`                   | Bridge→SP     | `{agents: AgentInfo[]}`（id/name/available），welcome 后推送（§44）                            |
| `agent.applied`                   | Bridge→SP     | `{files, summary, at}`，由 MCP `ui_notify_applied` 触发（§27）                                 |
| `agent.capture`                   | Bridge→SP     | `{captureId, withScreenshot}`，由 MCP `ui_capture` 触发（§27）                                 |
| `agent.captureResult`             | SP→Bridge     | `{captureId, selection, changes, screenshot?}` 截图 dataURL（§27）                             |
| `changes.apply`                   | SP→Bridge     | `{requestId, scope, element: ApplyElementContext, changes[]}`（§29）；只含选中元素的 changes   |
| `apply.result`                    | Bridge→SP     | `{requestId, success, files?, summary?, error?{code,message}}`（§31/§47）                      |
| `sidepanel.confirmApply`          | SP→CS         | `{changes[]}` 请求 HMR 后确认改动生效（§22/§29）                                               |
| `sidepanel.reloadPage`            | SP→CS         | `{}` 静态项目无 HMR，刷新页面让已写入源码的改动生效                                            |
| `apply.confirmed`                 | CS→SP         | `{appliedChangeIds, failedChangeIds, reidentified}` 确认结果（§31）                            |

约定：

- 每条消息 `{ type, payload }`，payload 恒为**非数组对象**；边界处 `isUiTunerMessage()` 收窄，非法消息在 `Channel.onMessage` / `BridgeChannel.onMessage` / BridgeServer 三处静默丢弃。
- MCP 不经 WS 协议——Agent 用标准 MCP over HTTP（`/mcp`），上表 `agent.*` 仅是 Bridge↔面板侧的配套消息。

## 6. 关键设计决策

| 决策                                                                                                      | 理由                                                           |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| TypeScript 锁 5.9（未用 TS 7）                                                                            | typescript-eslint 8.x 尚不支持 TS 7；稳定性优先（计划 §53）    |
| 手写 Vite 多构建，不用 CRXJS 插件                                                                         | 依赖少、行为可控、易排查                                       |
| Picker / Overlay / SelectionTracker / PreviewEngine 放独立包 `packages/inspector`，不 import chrome       | 对齐计划 §4 结构；jsdom 可单测；chrome 接线只在 content script |
| Overlay 用 Shadow DOM 隔离 + 样式只存在于 `styles/overlay.ts`                                             | 页面 CSS 无法破坏高亮层；样式单一来源                          |
| Overlay 每帧从 Element 引用重测 rect（而非缓存坐标/监听 scroll/resize）                                   | 滚动、resize、布局位移一次解决；无目标时 rAF 自动停            |
| 点击拦截用 document capture + preventDefault                                                              | 选取时页面不触发跳转/聚焦/拖选                                 |
| `picker.state` 以 content 回报为准（非面板乐观更新）                                                      | Esc 等面板外路径不会造成状态漂移                               |
| Preview 只走独立 `<style>` override（§11），永不写 `element.style`                                        | 可整块撤销、不动内联状态；Preview 与 Source 隔离（§2.3）       |
| 样式读写只经 `STYLE_PROPERTIES` 白名单（§7）                                                              | 永不读/写完整 computed style；engine 侧再校验一次              |
| ChangeSet 真相在 content（ChangeTracker），面板只镜像 `preview.changed`                                   | 页面刷新即清空（§37 in-memory）；面板崩溃不丢页面状态          |
| **Bridge 由 Side Panel 直连 WebSocket（不经 background SW）**                                             | MV3 SW 空闲回收会断 WS；content script 受页面 CSP 限制         |
| Bridge 只绑 127.0.0.1:47321 + host_permissions 补 ws://localhost、ws://127.0.0.1                          | §38 安全边界不变（仍只本机回环）                               |
| **Source Resolver 放 bridge 做 regex 级静态索引（不引 parser），exact 必须有文本命中，inferred 不给行号** | 浏览器无文件系统；§20 不伪造源码位置；Vite/React 常规结构优先  |
| 源码索引每次解析重建（上限 500 文件）                                                                     | dev 项目小，重建毫秒级；缓存/文件监听属 backlog                |
| 有 change 的元素转移选中时保留 id（`keepId`）                                                             | override CSS 按 `data-ui-tuner-id` 匹配，id 释放即失联         |
| ScrubInput 拖动数值直写 DOM + rAF 节流消息；store 只存提交值                                              | 60fps 拖动零面板重渲染（§33）                                  |
| 非数值（auto/normal/fit-content…）回退为文本输入                                                          | 覆盖 §9.3 CssDimension 全集，不做魔法猜测                      |
| 组件名不在 M3 显示（"Preview only" 徽标占位）                                                             | Source Resolver 属 M6；不得伪造（计划 §20）                    |
| 权限最小化：`activeTab`/`scripting`/`sidePanel`/`storage` + localhost host                                | 计划 §1.2/§38 安全边界                                         |
| **`codex exec` spawn 用 `stdio:["ignore","pipe","pipe"]`**                                                | 默认 pipe 的 stdin 不关闭会让 codex 阻塞读 stdin 永久挂起      |
| **Apply 改动检测用 mtime+size 快照比对（`fileDiff.ts`），不依赖 git**                                     | 用户项目未必是 git 仓库；§47 只报真实落盘的文件                |

## 7. 测试

- `packages/protocol`（20 例）：构造器、守卫（含数组 payload 拒绝）、按类型收窄（含 M3–M7 新消息）、`assembleAgentContext`（§26 布局/exact/unknown 降级/无选中/include 过滤/level 2·3 扩展）。
- `packages/inspector`（100 例，jsdom）：
  - identity：id 分配/释放、selector 唯一性回查（querySelector 往返）、文本预览、**domFingerprint（结构签名/忽略 ui-tuner 属性/上限截断）**
  - selection：payload 构建（含 styles）、breadcrumb、moveToParent/moveToAncestor（含失效 id 拒绝）、clear 清理属性、keepId 保留与 id 复用
  - snapshot：selected/parent/children 捕获、总预算截断
  - parse：px/rem/%/无单位解析、关键词拒绝、格式化去尾零、scrubMultiplier（§10 组合）、clamp
  - color：rgb/rgba（逗号与斜杠语法）/hex3/hex6 归一、transparent/命名色拒绝、**`colorKey` 同色不同写法归一（opaque→`#rrggbb`、半透明保留 alpha、8 位 hex ↔ rgba）**
  - computed：白名单过滤、空值跳过、遍历全部白名单属性
  - PreviewEngine：懒挂载复用、按元素分组 `!important` 规则、白名单外拒绝、null 移除/空块清理、同值 no-op、removeElement、unmount
  - ChangeTracker：首记录捕获原值、scrub 帧原位更新、revert(changeId)、revertProperty、revertElement（仅该元素）、hasChangesFor、按时间序列表
  - picker / overlay：同 M2
  - **confirm（M8 §22/§29）**：`cssValuesEqual`/`normalizeCssValue`（px 数值等价、关键词归一、**颜色感知**：`colorKey` 归一 rgb/rgba/hex/8 位 hex，opaque→`#rrggbb`、半透明保留 alpha；同色不同写法判等，`rgba(...,0.5)`≠`rgb(...)`）
- `chrome-extension`（48 例）：Channel 内存端口对（投递/丢弃/退订/断连）；store 状态机（连接、RTT、picking ack、selection+styleValues 路由、updateStyle 预览帧不改 store/提交更新/null 删除、preview.changed 镜像、elementNames 累积、revert/reset 动作出站消息、Bridge 握手 hello/welcome、selection/changes 自动 sync、断线 offline、sourceResolved 落库 + stale 守卫 + 重选/清除/断线置 null、M7：bridge.agents 落库/断线清空、agent.request 发送+sent 状态、离线 no-op、agent.applied 横幅/dismiss、agent.capture 往返含注入截图/无截图降级、**M8：applyChanges(scope) 只发选中元素 changes、apply.result 落库 + stale 守卫 + 成功发 sidepanel.confirmApply、apply.confirmed 计数、clearApplyState**、日志截断、reset）；**`ColorRow` 组件回归测试（jsdom + RTL，新增扩展组件测试基建）：拖动取色后父组件重渲染不得把受控 input 拨回原色、blur 提交选中色而非原色、未拖动开关则提交原色（真 no-op）**。
- `packages/bridge`（68 例，node env）：detectProject、probeDevServer、resolveCwd、BridgeServer（含 sourceResolved 集成、端口占用干净 reject、bridge.agents 推送、agent.request 存储、agent.captureResult 结算、ui_notify_applied 广播、**changes.apply→adapter→apply.result 路由**）、resolver/indexer、resolver/resolve、resolve.example（对真实 examples/react-vite 的 10 例锚定测试）、adapter（CLI 探测真/假、二进制名、Codex 优先、**CodexAdapter.applyChanges：无 source→SOURCE_NOT_FOUND、离线→AGENT_OFFLINE、exit≠0/无改动/超时→APPLY_FAILED、成功报 files**、ClaudeCode/Cursor 诚实 NOT_IMPLEMENTED、**buildCodexApplyPrompt §28 约束、fileDiff mtime 检测**）、mcp（五工具 list/空状态诚实/sync 镜像/context 组装含 agent.request/capture 往返+image content/无面板诚实失败/notify_applied 广播）。
- 真机 E2E（`/tmp/ui-tuner-e2e/`）：M6 9/9、M8 8/8（Select→Preview→Changes→§30 Dialog→codex 改源码→HMR 确认→✓ Applied→磁盘文件真实变更）。

## 8. 已知限制 / 风险

- 页面导航/刷新后 Port 断开需手动 Reconnect；自动重连与状态持久化（计划 §37）在 backlog（跨刷新恢复依赖 HMR 重定位 §22）。
- 预览修改与 ChangeSet 随页面刷新消失（预期行为）。
- 颜色提交写 `#rrggbb`，半透明色（rgba alpha）会丢失 alpha（V0.1 取舍，backlog 记录）。
- Bridge 只在 Side Panel 打开时在线（面板关 = Agent 通道断）；M7 若需后台常驻再评估。
- Bridge 无鉴权（仅本机回环可连，§38）；47321 被占用时 CLI 报错退出而非换端口（计划 §15 固定端口）。
- CLI 未发布 npm：`npx ui-tuner` 报 "could not determine executable to run"；本地开发用 `pnpm bridge --cwd <项目路径>`。面板 Offline 卡显示的 `npx ui-tuner` 是发布后目标文案（backlog）。
- 重连后 elementNames 需重新选中元素才有 tagName（此前 Changes 分组显示 ut 短码）。
- **MCP / Codex 集成（M7/M8）**：codex 需走本机代理（`HTTPS_PROXY=http://127.0.0.1:7892` + `NO_PROXY=localhost,127.0.0.1` 排除 loopback）否则模型流反复重连；codex exec 调 MCP 工具默认被 approval:never 自动取消（"user cancelled MCP tool call"），需 `--dangerously-bypass-approvals-and-sandbox`（backlog：研究免 flag 的 trusted-MCP 配置）；**bridge spawn codex 必须 stdin=ignore，否则 codex 阻塞读 stdin 挂起**（已修复）。`ui_capture` 截图当前是整页可视区，元素级裁剪顺延 backlog。
- **Apply 的 HMR 确认（M8 §22）**：confirmApply 轮询 8s——若 Agent 改了源码但 dev server HMR 未在该窗口内推到页面（慢构建/非 HMR 栈），该 change 会留在 failedChangeIds、Preview 覆盖保持，Result 卡仍显示 Applied（files 已落盘）但 confirmed 计数 < 总数。Apply 依赖元素有 linked source（§47 不猜源码）。
- Source Resolver V1（M6，M8 扩展）：覆盖 Vite/React 常规结构 + **纯静态 HTML**（`.html` 文件 + `class=` 提取；纯静态项目源码多在根 `index.html`，无 src/ 则扫根）；Next App Router 适配顺延。数据驱动文本（JS 计算/数组渲染的字符串，如 `` `当前:${y} 年` ``）无静态字面量 → 文本信号缺失，只能靠 id/class/tag 到 inferred，达不到 exact；`clsx(...)` 等函数调用形式的 className 只提取字符串参数之外不展开；索引每次 selection 重建，大项目（>500 源文件）截断（backlog）。
- **Bridge 项目根需 `--cwd` 匹配正在浏览的项目**，否则 Source Resolver 索引错树 → 全部 unknown（Preview only）、Apply 永久禁用；devServerUrl 探测也可能选中同机其它端口的服务（backlog：从已连接页面 origin 自动关联项目根/dev server）。
- Multi Select（Shift+Click）顺延（计划 Task 2.5，backlog）；`⌘↓` 未实现（backlog）。
- hover 高亮不进入 iframe / closed shadow root 内部元素（V0.1 边界，计划 §1.2）。
- `document.elementFromPoint` 命中纯文本节点的父元素即选中该元素；inline 文本片段的高亮框可能与预期略有出入。
- box-shadow / grid-template 只提供文本编辑（无专用可视化编辑器）；background-image / transform 只读。
- StrictMode 下开发环境会建立两次 Port（生产构建无此现象）。
