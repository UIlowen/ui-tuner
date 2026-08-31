# UI Tuner — Architecture（Milestone 1）

> 状态：Milestone 1 完成（基础插件）。本文档只描述**已实现**的部分，随每个 Milestone 更新。
> 完整产品规划见根目录 `UI_TUNER_EXECUTION_PLAN.md`。

## 1. 当前范围

Milestone 1 交付：

- pnpm + Turborepo + TypeScript monorepo
- Chrome Extension（Manifest V3）
- React Side Panel
- Content Script（仅 localhost）
- Side Panel ⇄ Content Script 双向消息通道

**验收标准**：Side Panel 可以和页面通信（connect → 页面信息，ping → pong + RTT）。

不在本阶段：Element Picker、Overlay、Style Inspector、ChangeSet、Bridge、Source Resolver、Agent/MCP（M2–M8）。

## 2. Repo 结构

```txt
ui-tuner/
  apps/
    chrome-extension/        # MV3 扩展（本阶段唯一应用）
      public/manifest.json   # 静态 manifest，构建时拷贝到 dist
      sidepanel.html         # Side Panel HTML 入口（包根，保证输出在 dist 根）
      vite.config.*.ts       # 三个独立构建配置（见 §4）
      scripts/dev.mjs        # 并行 watch 三个构建
      src/
        background/          # service worker：点击图标打开 Side Panel
        content/             # 内容脚本：接受端口、应答 ping
        sidepanel/           # React 应用（App.tsx / main.tsx）
        messaging/           # Channel：对 chrome.runtime.Port 的类型化封装
        state/               # zustand store（sidepanel-store.ts）
        styles/              # Tailwind 入口 + 基础样式
  packages/
    protocol/                # 共享消息协议：类型 + 类型守卫 + 构造器
  docs/
    architecture.md          # 本文档
```

后续 Milestone 将增加 `apps/bridge`、`packages/inspector`、`packages/change-set`、`packages/source-resolver`、`examples/*`（见执行计划 §4）。

## 3. 运行时架构

```txt
┌─────────────────────────── Chrome ───────────────────────────┐
│                                                              │
│  localhost 页面          Side Panel (React)                  │
│  ┌────────────────┐      ┌──────────────────────┐            │
│  │ Content Script │◄────►│ zustand store        │            │
│  │ content.js     │ port │ Channel              │            │
│  └────────────────┘      └──────────▲───────────┘            │
│           ▲                          │ tabs.connect(tabId)   │
│           │ manifest 注入            │                        │
│  ┌────────┴─────────┐     ┌──────────┴───────────┐            │
│  │ background.js    │     │ action 点击 →        │            │
│  │ (service worker) │────►│ setPanelBehavior     │            │
│  └──────────────────┘     └──────────────────────┘            │
└──────────────────────────────────────────────────────────────┘
```

### 消息流（M1）

1. 用户点击工具栏图标 → background `setPanelBehavior({ openPanelOnActionClick: true })` 打开 Side Panel。
2. Side Panel 挂载 → `chrome.tabs.query` 找到当前 tab → 校验 localhost → `Channel.connectToTab(tabId)` 建立 `chrome.runtime.Port`（名称 `ui-tuner`）。
3. Content Script 收到 `onConnect` → 立即发送 `content.ready`（url / title）→ Side Panel 状态变为 **Connected** 并显示页面信息。
4. 用户点击 "Ping page" → Side Panel 发送 `sidepanel.ping`（带 `sentAt`）→ Content Script 回 `content.pong` → Side Panel 计算并显示 RTT。

M1 的 Ping 是通道验收工具；M2 起 `selection.changed` 等消息沿用同一条 Port 通道。

### 为什么不经 background 中转

Side Panel 与 Content Script 之间用 `chrome.tabs.connect` 直连 Port：

- 少一跳中转，实时性更好（符合性能要求 §33 的方向）；
- background service worker 会被 Chrome 闲置回收，作为常驻中转会引入掉线复杂度；
- background 只承担"打开面板"等生命周期职责。

## 4. 构建管线

Chrome 对产物的要求决定了一次 `vite build` 不够用，因此有**三个独立构建**，由 npm script 链式执行：

| 构建                        | 入口                      | 格式       | 原因                                 |
| --------------------------- | ------------------------- | ---------- | ------------------------------------ |
| `vite.config.sidepanel.ts`  | `sidepanel.html`          | ES（默认） | 扩展页面，正常 Vite 应用             |
| `vite.config.content.ts`    | `src/content/index.ts`    | **IIFE**   | MV3 content script 不能是 ES module  |
| `vite.config.background.ts` | `src/background/index.ts` | ES 单文件  | service worker（`"type": "module"`） |

关键约束：

- sidepanel 构建先执行且是唯一 `emptyOutDir: true` 的构建；content / background 以 `emptyOutDir: false` 追加，避免互相清空。
- `public/manifest.json` 由 Vite `publicDir` 拷贝进 dist，引用固定的 `content.js` / `background.js` / `sidepanel.html` 文件名。
- protocol 包先经 `tsc` 构建出 `dist/`，扩展构建时由 Vite 打进产物（IIFE 内联）。

`pnpm dev`（`scripts/dev.mjs`）并行跑三个 `vite build --watch`，Chrome 里加载的 `dist/` 保持可用，改动后回到 `chrome://extensions` 点刷新即可。

## 5. 协议（packages/protocol）

所有跨上下文消息的类型唯一定义在 `@ui-tuner/protocol`（执行计划规则 6）。M1 消息：

```ts
type UiTunerMessage =
  | { type: "content.ready"; payload: { url; title; connectedAt } } // Content → SidePanel
  | { type: "sidepanel.ping"; payload: { sentAt } } // SidePanel → Content
  | { type: "content.pong"; payload: { sentAt; receivedAt; url; title; userAgent } };
```

约定：

- 每条消息都是 `{ type, payload }`，`payload` 恒为对象。
- 边界处用 `isUiTunerMessage()` 收窄：`Channel.onMessage` 丢弃一切非法消息，业务代码只见类型化消息。
- Bridge / Agent 消息（`preview.changed`、`changes.apply` 等，计划 §17）在 M5 扩展进同一个包。

## 6. 关键设计决策

| 决策                                                                                         | 理由                                                                  |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| TypeScript 锁 5.9（未用 TS 7）                                                               | typescript-eslint 8.68 尚不支持 TS 7；稳定性优先（计划 §53）          |
| 手写 Vite 多构建，不用 CRXJS 插件                                                            | 依赖少、行为可控；插件链路出问题时易排查                              |
| Content Script 用 manifest 静态注入，不用 `scripting.executeScript`                          | localhost match patterns 即可覆盖；M2 Picker 需要 content script 常驻 |
| 权限最小化：`activeTab` / `scripting` / `sidePanel` / `storage` + localhost host permissions | 计划 §1.2/§38 安全边界                                                |
| zustand 管理 Side Panel 状态                                                                 | 计划技术栈 §3.2；M3 Style Inspector 状态会显著增长                    |
| `Channel` 依赖 `PortLike` 结构接口而非 chrome 类型                                           | 单测无需 mock 全局 chrome（channel.test.ts 用内存假端口对测）         |

## 7. 测试

- `packages/protocol`：消息构造器 + 类型守卫（8 个用例）。
- `chrome-extension`：
  - `messaging/channel.test.ts`：内存端口对验证双向投递、非法消息丢弃、退订、断连通知。
  - `state/sidepanel-store.test.ts`：连接状态机、RTT 计算、日志截断、reset。
- Playwright E2E（计划 §40 Test 01–07）在后续 Milestone 引入对应能力后补充。
- 真机验收：加载扩展到 Chrome，在 localhost 页面确认 Connected + Ping RTT（见 README）。

## 8. 已知限制 / 风险

- 页面导航或刷新后 Port 断开，Side Panel 显示 Disconnected，需手动 Reconnect。自动重连与状态持久化（计划 §37）放后续 Milestone。
- Side Panel 打开在非 localhost 页面时会显示引导信息（host permission 之外拿不到 url，也无法连接）。
- `chrome.tabs.query` 在多窗口场景取 `currentWindow`；标签页切换后需 Reconnect。
- StrictMode 下开发环境会建立两次 Port（生产构建无此现象）。
