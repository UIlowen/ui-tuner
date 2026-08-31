# UI Tuner — Architecture（Milestone 2）

> 状态：Milestone 2 完成（Element Picker）。本文档只描述**已实现**的部分，随每个 Milestone 更新。
> 完整产品规划见根目录 `UI_TUNER_EXECUTION_PLAN.md`。

## 1. 当前范围

Milestone 1 交付：pnpm + Turborepo + TypeScript monorepo、Chrome Extension（MV3）、React Side Panel、Content Script（仅 localhost）、双向消息通道。

Milestone 2 交付：

- **Element Picker**：Edit Mode 下 hover 高亮（≥30fps）、点击选中、`⌘↑` 选父级、Breadcrumb 回跳、Esc 取消/清除
- **Overlay**：独立层（Shadow DOM 隔离），显示边框 + `tag  W × H` 标签，滚动/resize/布局位移每帧自动校正
- **Selection 身份**：`data-ui-tuner-id`（ut-xxxxxx）+ 唯一 CSS selector + nearest-first Breadcrumb

**M2 验收标准**：可以稳定选择页面元素。

不在本阶段：Style Inspector / Scrub Input（M3）、ChangeSet（M4）、Bridge（M5）、Source Resolver（M6，组件名暂不显示）、Agent/MCP（M7）。

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
        sidepanel/               # React 应用（App.tsx / main.tsx）
        messaging/               # Channel：chrome.runtime.Port 类型化封装
        state/                   # zustand store（连接 + 选取状态）
        styles/                  # Tailwind 入口 + 基础样式
  packages/
    protocol/                    # 共享消息协议：类型 + 守卫 + 构造器
    inspector/                   # DOM 检查能力（chrome-free，可单测）
    ├ src/picker/Picker.ts       #   Edit Mode 控制器（rAF 合并 mousemove）
    ├ src/overlay/Overlay.ts     #   独立高亮层（Shadow DOM + rAF 跟踪）
    ├ src/dom/identity.ts        #   uiTunerId / 唯一 selector / 文本预览
    ├ src/dom/selection.ts       #   SelectionTracker（身份注册 + breadcrumb）
    ├ src/measurement/rect.ts    #   Bounds 快照
    └ src/styles/overlay.ts      #   Overlay 样式常量（唯一样式来源）
  docs/
    architecture.md              # 本文档
    handover.md                  # 交接文档（每里程碑更新）
    backlog.md                   # 顺延项 / scope 外需求
```

## 3. 运行时架构

```txt
┌───────────────────────────────── Chrome ─────────────────────────────────┐
│                                                                          │
│  localhost 页面                          Side Panel (React)              │
│  ┌───────────────────────────┐          ┌────────────────────┐           │
│  │ Content Script            │  port    │ zustand store      │           │
│  │ ├ Picker (edit mode)      │◄────────►│ picking/selection  │           │
│  │ ├ Overlay (shadow root)   │          │ Channel            │           │
│  │ └ SelectionTracker        │          └─────────▲──────────┘           │
│  └──────────┬────────────────┘                    │ tabs.connect         │
│             │ manifest 注入                        │                      │
│  ┌──────────┴──────────┐        ┌──────────────────┴─────────┐            │
│  │ background.js (SW)  │───────►│ action 点击 → open panel   │            │
│  └─────────────────────┘        └────────────────────────────┘            │
└──────────────────────────────────────────────────────────────────────────┘
```

### 选取流程（M2）

1. Side Panel 点「选取元素」→ `sidepanel.picking {enabled:true}` → Content Script 启动 Picker，回 `picker.state` 同步状态。
2. Picker rAF 循环：`elementFromPoint`（mousemove 只更新坐标缓存，一帧一次）→ hover 变化时 Overlay 画蓝框 + `tag  W × H` 标签。
3. 点击（capture 阶段拦截，阻止页面响应）→ Picker 停止 → `SelectionTracker.select()`：打 `data-ui-tuner-id`、生成唯一 selector、构建 breadcrumb → `selection.changed` → Side Panel 显示选中卡片，Overlay 画紫框。
4. `⌘↑` / breadcrumb 点击 → `SelectionTracker.moveToParent/moveToAncestor` → 新的 `selection.changed`。
5. Esc：picking 中 → Picker 自身处理取消；已选中 → Content Script 全局 keydown 清除 → `selection.cleared`。
6. 选中元素被移出 DOM（HMR 等）→ Overlay 检测 `isConnected` → 立即隐藏并发 `selection.cleared`（不静默错选）。
7. Port 断开（面板关闭/导航）→ Content Script 清理 Picker/Overlay/Tracker，面板重开时重建。

### 性能（计划 §33 红线）

- mousemove 处理器只写坐标缓存（passive listener），`elementFromPoint` 每帧至多一次。
- Overlay 持有 Element 引用，每帧仅 `getBoundingClientRect` + 少量 style 写入；无目标时 rAF 自动停止。
- 选取后（非 picking）没有任何循环开销。

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

| type                              | 方向          | payload 要点                                                                               |
| --------------------------------- | ------------- | ------------------------------------------------------------------------------------------ |
| `content.ready`                   | CS→SP         | url / title / connectedAt（连接即发）                                                      |
| `sidepanel.ping` / `content.pong` | SP→CS / CS→SP | RTT 探针（通道验收工具）                                                                   |
| `sidepanel.picking`               | SP→CS         | `{enabled}` 进入/退出选取模式                                                              |
| `picker.state`                    | CS→SP         | `{enabled}` 实际状态（Esc 等以这里为准）                                                   |
| `selection.changed`               | CS→SP         | `{element, breadcrumb, pickedAt}`；element 对齐计划 §18（id/tagName/selector/text/bounds） |
| `selection.cleared`               | CS→SP         | `{}`                                                                                       |
| `sidepanel.selectAncestor`        | SP→CS         | `{uiTunerId}` breadcrumb 回跳                                                              |

约定：

- 每条消息 `{ type, payload }`，payload 恒为**非数组对象**；边界处 `isUiTunerMessage()` 收窄，非法消息在 `Channel.onMessage` 静默丢弃。
- Bridge / Agent 消息（`preview.changed`、`changes.apply` 等，计划 §17）在 M5 扩展进同一个包。

## 6. 关键设计决策

| 决策                                                                                | 理由                                                                    |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| TypeScript 锁 5.9（未用 TS 7）                                                      | typescript-eslint 8.x 尚不支持 TS 7；稳定性优先（计划 §53）             |
| 手写 Vite 多构建，不用 CRXJS 插件                                                   | 依赖少、行为可控、易排查                                                |
| Picker / Overlay / SelectionTracker 放独立包 `packages/inspector`，不 import chrome | 对齐计划 §4 结构；jsdom 可单测（26 例）；chrome 接线只在 content script |
| Overlay 用 Shadow DOM 隔离 + 样式只存在于 `styles/overlay.ts`                       | 页面 CSS 无法破坏高亮层；样式单一来源                                   |
| Overlay 每帧从 Element 引用重测 rect（而非缓存坐标/监听 scroll/resize）             | 滚动、resize、布局位移一次解决；无目标时 rAF 自动停                     |
| 点击拦截用 document capture + preventDefault                                        | 选取时页面不触发跳转/聚焦/拖选                                          |
| `picker.state` 以 content 回报为准（非面板乐观更新）                                | Esc 等面板外路径不会造成状态漂移                                        |
| 组件名不在 M2 显示                                                                  | Source Resolver 属 M6；不得伪造（计划 §20）                             |
| 权限最小化：`activeTab`/`scripting`/`sidePanel`/`storage` + localhost host          | 计划 §1.2/§38 安全边界                                                  |

## 7. 测试

- `packages/protocol`（10 例）：构造器、守卫（含数组 payload 拒绝）、按类型收窄。
- `packages/inspector`（26 例，jsdom）：
  - identity：id 分配/释放、selector 唯一性回查（querySelector 往返）、文本预览
  - selection：payload 构建、breadcrumb、moveToParent/moveToAncestor（含失效 id 拒绝）、clear 清理属性
  - picker：hover 去重、mouseleave 置空、click 捕获且可 preventDefault、Esc 取消、stop 解绑、不解析进自身 overlay
  - overlay：mount/shadow root、绘制、清除、元素移出 DOM 即上报丢失并隐藏
- `chrome-extension`（11 例）：Channel 内存端口对（投递/丢弃/退订/断连）；store 状态机（连接、RTT、picking ack、selection 路由、日志截断、reset）。
- Playwright E2E（计划 §40 Test 01–07）见 backlog，能力齐备后统一补。

## 8. 已知限制 / 风险

- 页面导航/刷新后 Port 断开需手动 Reconnect；自动重连与状态持久化（计划 §37）在 backlog。
- Multi Select（Shift+Click）顺延（计划 Task 2.5，backlog）。
- `⌘↑` 连按会一路走到 `<body>` 即止（`<html>` 排除）；`⌘↓` 未实现（backlog）。
- hover 高亮不进入 iframe / closed shadow root 内部元素（V0.1 边界，计划 §1.2）。
- `document.elementFromPoint` 命中纯文本节点的父元素即选中该元素；inline 文本片段的高亮框可能与预期略有出入（M3 前不处理）。
- StrictMode 下开发环境会建立两次 Port（生产构建无此现象）。
