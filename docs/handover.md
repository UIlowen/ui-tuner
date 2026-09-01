# UI Tuner 交接文档

> 用途：任何新会话（Claude / Codex / 其他 Agent）接手开发时，读完本文档即可获得完整上下文。
> 配合根目录 `UI_TUNER_EXECUTION_PLAN.md`（完整执行计划）与 `docs/architecture.md`（已实现架构）使用。
> 规则：**每完成一个 Milestone，更新本文档**。

---

## 1. 当前状态快照（2026-09-01）

| 项       | 状态                                                                                                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 里程碑   | **M1–M6 完成**（真机验收通过）                                                                                                                                                                                                          |
| 分支     | `main`（本地仓库，无远端，直接提交 main）                                                                                                                                                                                                                          |
| 验证     | `pnpm build / test / typecheck / lint` 全绿（162 例测试）                                                                                                                                                                                                          |
| 已知限制 | 页面刷新/导航后需手动 Reconnect；预览修改随页面刷新消失（§37 跨刷新持久化依赖 HMR 重定位，backlog）；颜色提交丢失 alpha（V0.1）；**CLI 未发布 npm——`npx ui-tuner` 不可用**，本地用 `pnpm bridge --cwd <项目路径>`（面板 Offline 卡的 `npx ui-tuner` 是发布后文案） |

## 2. 三十秒上下文

UI Tuner = Chrome Extension + Local Bridge + MCP Server。核心闭环：**Select → Tune → Prompt → Apply to Code**。让设计师在本地 React/Next/Vite 页面上直接点元素、实时调样式、把调整交给 Coding Agent 落到真实源码。

- 浏览器只负责 **Preview**（不写源码）；Agent 只负责 **Source Change**（计划 §2）。
- V0.1 只支持 `http://localhost/*` 与 `http://127.0.0.1/*`（安全边界，计划 §38，勿放宽）。
- 严格按 Milestone 推进，**一次只做一个**（计划 §42/§43）；Scope 外需求记入 `docs/backlog.md`。

## 3. 仓库结构与关键文件

```txt
UI Tuner/
  UI_TUNER_EXECUTION_PLAN.md   执行计划（唯一需求来源）
  docs/
    architecture.md            已实现架构（每里程碑更新，M4 版含选取/样式/撤销流程）
    handover.md                本文档
    backlog.md                 顺延项 / scope 外需求
  dev/index.html               localhost 测试页（pnpm page 启动）
  examples/
    react-vite/                计划 §39 Example A（独立 npm 项目，不进 pnpm workspace）：
                               Navbar/Card/Button/Form/List，Source Resolver 验证对象
  packages/
    protocol/                  跨上下文消息类型（公共类型只放这里，规则 6）
    inspector/                 chrome-free DOM 能力：Picker / Overlay / Selection /
                               styles(白名单/解析/取色) / PreviewEngine / ChangeTracker / snapshot /
                               domFingerprint（§21 结构指纹）
    bridge/                    本地 Bridge：CLI(bin ui-tuner, :47321 仅 127.0.0.1) + WebSocket
                               服务 + 项目/dev server 检测 + resolver/(源码索引+打分定位)；
                               不 import 浏览器 API（规则 8）
  apps/
    chrome-extension/
      public/manifest.json     MV3 manifest（content script 仅 localhost）
      sidepanel.html           Side Panel 入口
      vite.config.{sidepanel,content,background}.ts   三个独立构建
      src/
        background/            SW：点击图标开面板
        content/               内容脚本：接线 inspector ↔ Port（chrome 知识只在这里）
        sidepanel/             React App（App.tsx = 三 Tab；components/ = ScrubInput/StylePanel/rows/ChangesTab）
        messaging/channel.ts   Port 类型化封装（PortLike 结构接口）
        state/                 zustand store（连接 + picking + selection + styleValues + changes）
```

## 4. 技术决策与约束（勿推翻，除非有硬理由）

| 约束                                                                                                                                                                 | 原因                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| TypeScript **锁 5.9.x**                                                                                                                                              | typescript-eslint 8.x 不支持 TS 7；稳定性优先（计划 §53）                           |
| 三个 Vite 构建：sidepanel(ES) 先跑且唯一 `emptyOutDir`；content 必须 **IIFE**；background ES 单文件                                                                  | MV3 产物格式硬约束；详见 architecture.md §4                                         |
| Side Panel ↔ Content Script 用 `chrome.tabs.connect` **直连 Port**（`ui-tuner`），不经 background 中转                                                               | 实时性 + 避免 SW 回收复杂度                                                         |
| 消息一律 `{ type, payload }`（payload 非数组对象），边界处 `isUiTunerMessage()` 收窄，非法消息静默丢弃                                                               | protocol 包守卫，channel.ts 统一执行                                                |
| `Channel` 依赖 `PortLike` 结构接口；inspector 不 import chrome                                                                                                       | 单测免 mock chrome；新逻辑照此模式保持可测                                          |
| bridge 不得 import 浏览器 API（规则 8）                                                                                                                              | 包边界                                                                              |
| Overlay：Shadow DOM 隔离 + 持 Element 引用每帧重测 rect + 无目标即停 rAF；样式只在 `inspector/src/styles/overlay.ts`                                                 | 滚动/resize/布局位移天然正确（计划 §2.2/§33）                                       |
| Picker：mousemove 只写坐标缓存（passive），`elementFromPoint` 每帧至多一次；点击在 document capture 拦截                                                             | 计划 §33 性能红线                                                                   |
| 选取状态以 content 回报的 `picker.state` 为准（面板不做乐观更新）                                                                                                    | Esc 等面板外路径不产生状态漂移                                                      |
| **Preview 只走 `<style id="ui-tuner-preview-style">` 生成 `[data-ui-tuner-id=…] { prop: value !important }`，禁止写 `element.style`（计划 §11）**                    | 可整块撤销、不动页面内联状态；与源码隔离（§2.3）                                    |
| 样式读写只走 `STYLE_PROPERTIES` 白名单（计划 §7）；PreviewEngine 拒绝白名单外属性                                                                                    | 永不读/写完整 computed style                                                        |
| ChangeSet 真相在 content script（ChangeTracker）；面板只镜像 `preview.changed` 回报                                                                                  | 页面刷新即清空，符合 §37 in-memory 原则                                             |
| **Side Panel 直连 Bridge WebSocket（ws://127.0.0.1:47321），不经 background SW**；manifest host_permissions 含 ws://localhost、ws://127.0.0.1                        | MV3 SW 空闲回收会断 WS；content script 受页面 CSP 限制不能连；面板开 = Agent 通道活 |
| Bridge 只绑 127.0.0.1、固定端口 47321（§15/§38）；`/health` JSON 端点                                                                                                | 安全边界；npx ui-tuner / pnpm bridge 启动                                           |
| **Source Resolver 在 bridge（Node 侧）做 regex 级静态扫描**（不在浏览器里跑）：`src/**/*.{tsx,jsx,ts,js}` 建索引（组件名/JSX 文本/className/标签/id，上限 500 文件） | 浏览器没有文件系统；V1 无 parser 依赖，Vite/React 常规结构优先（handover M6 指引）  |
| **置信度纪律（§20）：exact 必须有 JSX 文本命中且唯一领先（给 file:line）；inferred 只给文件不给行号；unknown 不伪造**                                                | 「查看详情」按钮 → Card.tsx 调用点（与 React JSX 语义一致）                         |
| 源码索引每次 selection 解析时重建（无缓存/无文件监听）                                                                                                               | dev 项目小，重建为毫秒级；大项目缓存属 backlog                                      |
| 有 change 记录的元素在选中转移时保留 `data-ui-tuner-id`（SelectionTracker `keepId`）                                                                                 | 否则 Preview override CSS 与元素失联                                                |
| ScrubInput 拖动帧只发 `onPreview`（rAF 节流、DOM 直写不触发 React 渲染）；释放才 `onCommit`（计划 §10）                                                              | 拖拽 60fps 不重渲染面板                                                             |
| pnpm 11 + Turborepo 2；`onlyBuiltDependencies: [esbuild]` 在 pnpm-workspace.yaml                                                                                     | pnpm ≥10 默认拦截构建脚本                                                           |
| UI 风格：克制、高信息密度、Figma/Linear/Raycast 质感（计划 §48）；已用 zinc 暗色 + Tailwind 4                                                                        | 禁渐变堆砌/游戏化                                                                   |

## 5. 常用命令

```bash
pnpm install
pnpm build        # 全部构建（turbo 保证 protocol/inspector 先于 extension）
pnpm test         # vitest（turbo 编排，每包各自跑）
pnpm typecheck
pnpm lint
pnpm dev          # 扩展三个构建并行 watch
pnpm page         # 测试页 http://localhost:8000（绑定 127.0.0.1）
pnpm bridge       # Local Bridge（--cwd <项目路径> 指定目标项目；npx ui-tuner 为发布后命令）
```

**真机验证循环**：改代码 → `pnpm build` → `chrome://extensions` 点扩展卡片刷新 → **刷新 localhost 页面**（content script 只在页面加载时注入，旧页面不会换新脚本）→ 重开 Side Panel → 在 `http://localhost:8000` 上操作。加载目录：`apps/chrome-extension/dist`（⌘⇧G 粘贴路径最快）。

## 6. 已交付摘要

**M1**：Monorepo + MV3 扩展骨架 + Side Panel(React 19/zustand/Tailwind 4) + Content Script + background SW + 双向 Port 通道（`content.ready` / `sidepanel.ping` / `content.pong`）。真机验收通过。

**M2**：`packages/inspector`（Picker / Overlay / SelectionTracker / identity）+ protocol 新消息（`sidepanel.picking` / `picker.state` / `selection.changed` / `selection.cleared` / `sidepanel.selectAncestor`）+ content 接线 + Side Panel 选取卡片与 Breadcrumb。真机验收通过（在用户真实项目上验证）。

**M3**：Style Inspector。

- inspector 新增：`styles/whitelist`（§7 白名单）、`styles/computed`（pickStyles）、`styles/parse`（CSS 值解析 + scrubMultiplier）、`styles/color`（rgb→hex）、`dom/snapshot`（§3.1，总预算 12000 截断）、`preview/PreviewEngine`（§11 override CSS 引擎）、`changes/ChangeTracker`（§12 记录）。
- protocol：`SelectionPayload` 增加 `styles`（必填）与 `dom?`；新增 `sidepanel.stylePreview`（面板→页面，`committed` 区分拖动帧/提交）与 `preview.changed`（页面→面板，回报 StyleChange 列表）。
- content：选中时抓白名单 computed style + DOM snapshot；处理 stylePreview（首帧捕获原始值 → engine.setOverride → commit 时记录/回报；拖回原值则丢弃记录与 override）；PreviewEngine/ChangeTracker 模块级、跨重连存活、随页面刷新消亡。
- Side Panel：三 Tab（Style 默认 / Agent 占位 / Changes 列表）；StylePanel 分组 Layout(display/flex 3×3 对齐/wrap/gap)/Size/Spacing(Simple V/H + Advanced T/R/B/L)/Typography/Fill/Border/Effects；**ScrubInput（P0）**：拖动 ±step/Shift ×10/Option ×0.1、方向键、双击输入。
- 测试 106 例（inspector 79 / protocol 11 / extension 16）。

**M4**：ChangeSet。

- protocol 新增：`sidepanel.revertChange {changeId}` / `sidepanel.revertElement {elementId}` / `sidepanel.resetChanges`。
- inspector：`ChangeTracker.revert(changeId)` / `revertElement(elementId)`。
- content：`syncAfterChanges()` —— revert/reset 后移除受影响 override、回报 `preview.changed`，若当前选中元素受影响则**重发 selection.changed**（面板 styleValues 恢复页面真值）；重连时（content.ready 后）若有存量记录主动补发 `preview.changed`（面板 Changes 列表恢复）。
- 面板 store：`revertChange/revertElement/resetChanges` 动作 + `elementNames`（elementId→tagName，从 selection 累积，Changes 分组标签用）。
- ChangesTab（§13 格式）：按元素分组（tagName + ut-id）、每条 `prop prev → next ↩` 单条 Revert、每组 Revert、底部 **Reset All**；「Apply · M8」占位计数。
- 测试 111 例（inspector 81 / protocol 12 / extension 18）。

**M5**：Local Bridge。

- 新包 `packages/bridge`：`BridgeServer`（node:http + ws，127.0.0.1:47321，`/health` 端点，hello→welcome 握手，存最新 `bridge.sync`）、`detectProject`（package.json 依赖判定 Next.js/Vite/CRA/…）、`probeDevServer`（3000/5173/8080/4000/8000 探活）、CLI `cli.ts`（bin `ui-tuner`，§15 启动横幅）。tsc 直出 ESM（相对导入带 .js），无浏览器 API（规则 8）。
- protocol：`bridge.hello` / `bridge.welcome`（含 BridgeProject {name, framework, root} + devServerUrl）/ `bridge.sync`（selection + changes 镜像，服务 M7 的 ui_get_selection / ui_get_changes）。
- 扩展：`messaging/bridge-channel.ts`（WebSocketLike 结构接口 + 边界守卫，同 Channel 模式）；manifest host_permissions 加 `ws://localhost/*`、`ws://127.0.0.1/*`；store `attachBridge`（hello/welcome/断线 offline）+ selection/changes 变化自动 `bridge.sync` 转发；面板 BridgeCard（§35：offline 不阻塞 Preview，提示 `npx ui-tuner` + Reconnect）。
- 测试 133 例（inspector 81 / protocol 13 / bridge 20 / extension 19）。
- 验收后修正：CLI 增加 `--cwd <项目路径>`（未发布 npm 期间从仓库根启动 Bridge 指向用户项目；`npx ui-tuner` 为发布后命令）；修复 BridgeServer 端口占用时 ws 转发 `error` 事件导致的裸崩（现友好报错退出）。
- 真机验收通过（静态 HTML 项目：框架显示 Unknown 为正确答案；root/dev server 检测与 selection+changes 镜像均验证）。

**M6**：Source Resolver。

- 新示例项目 `examples/react-vite`（计划 §39 Example A，**独立 npm 项目不进 pnpm workspace**）：Navbar/Card/Button/Form/List + 普通 CSS；README 内含各元素预期解析结果表（已自动化为锚定测试）。
- bridge 新增 `resolver/`：`indexer`（扫 `src/**/*.{tsx,jsx,ts,js}`，regex 级提取默认导出组件名 / JSX 文本字面量（跨行）/ className token（含模板串静态部分与表达式内字符串）/ 小写 JSX 标签 / id，每命中带行号；跳过 node_modules/dist 等，上限 500 文件 200KB/文件）+ `resolve`（信号打分：文本 4(+唯一1)/class 1(≤3)/标签 1/id 3；exact 需文本命中且领先 ≥2 → file:line；≥3 → inferred（只文件不行号）；否则 unknown）。BridgeServer 收到带 selection 的 `bridge.sync` 即解析并回发 `bridge.sourceResolved`；解析异常降级 unknown 不影响 sync 通道。
- protocol：`SourceConfidence` / `ElementIdentity`（§21）/ `SourceResolution` / `bridge.sourceResolved` 消息；`SelectionElement` 增 `domFingerprint`（inspector `domFingerprintFor`：`tag#id.cls>[子标签]` 结构签名，§22 重定位地基）。
- 扩展：store `source` 状态（stale 守卫：elementId 不匹配当前选中则丢弃；重选/清除/断线置 null）；SelectionCard 按 §20 三态渲染（● Source linked 绿 + `组件 · file:line` / ● Source inferred 黄 + `Possible: file` / Preview only）。
- 测试 162 例（inspector 84 / protocol 14 / bridge 43 / extension 21）；含 `resolve.example.test.ts` 对真实 examples/react-vite 的 10 例锚定测试（M6 验收的自动化形态）。
- 真机验收通过（2026-09-01，自动化 E2E 9/9：Chrome for Testing + 真实扩展 + live Bridge —— 品牌 Chrome 152 禁 `--load-extension`；`sidePanel.open()` 有手势门禁，自动化用面板后台标签页等价。脚本 `/tmp/ui-tuner-e2e/acceptance.mjs` 是 §40 E2E 地基）。

## 7. 下一里程碑：M7 — Agent + MCP

**范围（计划 §23–§27）**：Agent Tab（Prompt Context §24/§25/§26）+ MCP Server（§27：ui_get_selection / ui_get_changes / ui_get_context / ui_capture / ui_notify_applied）+ Codex Adapter（§44）。**验收**：Codex 可以获取当前元素 Context。**禁止**：Apply to Code（M8）。

**注意**：M6 顺延项在 backlog（Next App Router 适配、数据驱动文本索引、索引缓存、HMR 重定位 §22 依赖）。

## 8. 新会话启动模板（计划 §52）

```txt
Read UI_TUNER_EXECUTION_PLAN.md 和 docs/handover.md.

Milestone N-1 is complete.

Now implement only Milestone N.

Before editing:
1. inspect the existing implementation;
2. reuse existing architecture;
3. identify any mismatch with the execution plan.

After editing:
1. run typecheck; 2. run tests; 3. run build;
4. summarize changed files; 5. list remaining risks;
6. do not start the next milestone.
```
