# UI Tuner 交接文档

> 用途：任何新会话（Claude / Codex / 其他 Agent）接手开发时，读完本文档即可获得完整上下文。
> 配合根目录 `UI_TUNER_EXECUTION_PLAN.md`（完整执行计划）与 `docs/architecture.md`（已实现架构）使用。
> 规则：**每完成一个 Milestone，更新本文档**。

---

## 1. 当前状态快照（2026-09-03）

| 项       | 状态                                                                                                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 里程碑   | **M1–M8 完成** + **注释模式重构**（2026-09-02）+ **页面侧编辑卡**（2026-09-03，SDD 14 任务）。核心闭环不变，但**样式编辑已从 Side Panel 迁到页面上的编辑卡**：面板只剩「选取/注释列表/Agent/Apply」 |
| 分支     | **`feat/ui-ux-polish`（30 commits，尚未推送，无 upstream）**，基于 `main`。远端 `origin` = GitHub 私有仓库 `UIlowen/ui-tuner`。**git 推送/拉取 GitHub 需走本机代理**：`HTTPS_PROXY=http://127.0.0.1:7892 git push`（与 codex 同坑） |
| 验证     | `pnpm build / test / typecheck / lint` 全绿（**311 例测试**：protocol 26 / inspector 121 / bridge 74 / extension 90）                                                                                                                                                |
| 已知限制 | 页面刷新/导航后需手动 Reconnect；预览修改随页面刷新消失（§37 跨刷新持久化依赖 HMR 重定位，backlog）；颜色提交丢失 alpha（V0.1）；**CLI 未发布 npm——`npx ui-tuner` 不可用**，本地用 `pnpm bridge --cwd <项目路径>`；codex exec 调 MCP 工具需 `--dangerously-bypass-approvals-and-sandbox`；**编辑卡输入框内按 Esc 会连带退出整个注释模式**（未修，backlog）；`docs/architecture.md` 仍描述注释模式之前的三 Tab 面板（未同步，读它时以本文档 §4/§6 为准） |

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
    architecture.md            已实现架构（**停留在 M8/三 Tab 面板，未同步注释模式与编辑卡**）
    handover.md                本文档
    backlog.md                 顺延项 / scope 外需求
    superpowers/specs/         2026-09-02-annotation-mode-design.md、2026-09-03-page-editor-card-design.md
    superpowers/plans/         同名实施计划（任务级 TDD 清单）
  dev/index.html               localhost 测试页（pnpm page 启动）
  examples/
    react-vite/                计划 §39 Example A（独立 npm 项目，不进 pnpm workspace）：
                               Navbar/Card/Button/Form/List，Source Resolver 验证对象
  packages/
    protocol/                  跨上下文消息类型（公共类型只放这里，规则 6）
    inspector/                 chrome-free DOM 能力：Picker / Overlay / Selection /
                               styles(白名单/解析/取色) / PreviewEngine / ChangeTracker /
                               InstructionStore(元素→自然语言指令) / StagingEngine(保存才记录) /
                               Annotations(页面气泡注释层) / snapshot / domFingerprint（§21）
    bridge/                    本地 Bridge：CLI(bin ui-tuner, :47321 仅 127.0.0.1) + WebSocket
                               服务 + 项目/dev server 检测 + resolver/(源码索引+打分定位)
                               + adapter/(Codex 真实现 + prompt/fileDiff) + mcp/(§27 五工具,
                               stateless StreamableHTTP 挂在同 server /mcp)；
                               不 import 浏览器 API（规则 8）
  apps/
    chrome-extension/
      public/manifest.json     MV3 manifest（content script 仅 localhost）
      sidepanel.html           Side Panel 入口
      vite.config.{sidepanel,content,background}.ts   三个独立构建
      src/
        background/            SW：点击图标开面板
        content/               内容脚本：接线 inspector ↔ Port（chrome 知识只在这里）
          card/                **页面侧编辑卡**：EditorCard.tsx（React）+ mount-card.tsx
                               （挂到 shadow root `ui-tuner-editor-card-root`）+ inject-styles.ts
                               （Tailwind token scoped 到 :host，adoptedStyleSheets）
        sidepanel/             React App（App.tsx = 两态注释面板，**已无 Style Tab**；
                               components/ = ChangesTab / AgentTab / ApplySection）
        style-editor/          样式控件（ScrubInput / rows / StylePanel / StyleEditContext）——
                               从 sidepanel 抽出，供**编辑卡**复用（面板不再直接编辑）
        i18n/                  messages.ts（zh/en，键必须齐平）+ use-t.ts
        messaging/channel.ts   Port 类型化封装（PortLike 结构接口）
        state/                 zustand store（sidepanel-store：连接/picking/selection/changes/
                               instructions/agent/apply；prefs：语言 + 主题）
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
| 有 change 记录**或有已保存指令**的元素在选中转移时保留 `data-ui-tuner-id`（SelectionTracker `keepId`）                                                                | Preview override CSS 与元素失联；气泡也要靠它定位「仅指令」元素（无 override）       |
| ScrubInput 拖动帧只发 `onPreview`（rAF 节流、DOM 直写不触发 React 渲染）；释放才 `onCommit`（计划 §10）                                                              | 拖拽 60fps 不重渲染面板                                                             |
| pnpm 11 + Turborepo 2；`onlyBuiltDependencies: [esbuild]` 在 pnpm-workspace.yaml                                                                                     | pnpm ≥10 默认拦截构建脚本                                                           |
| UI 风格：克制、高信息密度、Figma/Linear/Raycast 质感（计划 §48）；已用 zinc 暗色 + Tailwind 4                                                                        | 禁渐变堆砌/游戏化                                                                   |
| **样式编辑只在页面编辑卡里发生；Side Panel 不再有 Style Tab / 不再下发 `sidepanel.stylePreview`（该协议消息已删除）**                                                | 设计师在元素旁边调，所见即所得；面板只负责总览/Agent/Apply（注释模式设计）          |
| 编辑卡挂在 **shadow root**（host `ui-tuner-editor-card-root`，z-index 2147483645），Tailwind token scoped 到 `:host` / `:host(.dark)`，经 `adoptedStyleSheets` 注入 | 不污染宿主页面样式，也不被宿主样式污染                                              |
| **「保存才记录」`StagingEngine`**：拖动/输入只 `stage`→PreviewEngine（页面实时可见但不落账）；`commit` 才写 ChangeTracker；`rollback` 还原基线                          | 取消/删除能干净还原；避免 M8 那种「拖一下就产生一条记录」的噪声                     |
| **仅指令元素是一等公民**：`Annotations.sync(changes, instructions)` 取并集出气泡，`ChangesTab` 计数把无改动行但有指令的元素算 1 条，`applyChanges` 允许 `changes: []` + instruction | 只写自然语言（不动数值）也是有效诉求，此前会在气泡/计数/Apply 三处被当作「空」丢弃  |
| Picker 放行注释层点击（`passThroughHostIds`）；气泡点击派发 `onOpenEditor` 而不是只读浮层                                                                            | 点气泡要能重开该元素的编辑卡（含已存指令与序号）                                    |
| 面板两态注释模式：`picking` 只由 content 的 `picker.state` ack 决定，选中元素**不**退出注释模式；「完成此元素」走 `sidepanel.clearSelection`                           | 连续标注多个元素；避免面板乐观更新造成状态漂移                                      |

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

**M7**：Agent + MCP。

- protocol：新消息 `agent.request`（SP→Bridge：instruction + include 开关 + contextLevel）/ `bridge.agents`（AgentInfo 可用性，welcome 后推送）/ `agent.applied`（Bridge→SP，ui_notify_applied 触发）/ `agent.capture` + `agent.captureResult`（ui_capture 往返）；新类型 `ContextLevel`(1|2|3) / `AgentInclude` / `AgentInfo`；`assembleAgentContext()`（§26 纯文本组装，面板预览与 MCP ui_get_context 共用，杜绝漂移）。
- bridge `adapter/`（§44）：`AgentAdapter` 接口 {id,name,isAvailable(),applyChanges()}；Codex 优先，ClaudeCode/Cursor 占位——`isAvailable()` 真实探测 CLI（`<bin> --version` 3s 超时），`applyChanges()` 一律诚实返回 `NOT_IMPLEMENTED`（M8），**绝不假实现成功**。
- bridge `mcp/`（§27）：stateless StreamableHTTP 挂在同一 47321 server 的 `/mcp` 路径（与 WS 侧共享 lastSync/lastResolution/lastAgentRequest）；五工具 `ui_get_selection` / `ui_get_changes` / `ui_get_context{level}` / `ui_capture{withScreenshot}` / `ui_notify_applied{files,summary}`。空状态诚实回报（未选中/面板未连）；`ui_capture` 经 WS 往返面板拿新鲜 selection+changes+截图（截图作 MCP image content）。
- 扩展 AgentTab（§23）：Context 卡（元素 + 源码行 + 截图占位）/ Instruction textarea / Agent 行（Codex + ●available，§36 Offline 提示）/ Include 五开关 / Context Level 1/2/3 / §26 Prompt 实时预览 + Copy / 发送至 Bridge；store 增 agent 状态（agents/agentInstruction/agentInclude/agentContextLevel/agentSent/lastApplied），`registerCaptureHandler` 注入 `chrome.tabs.captureVisibleTab`（store 保持 chrome-free 可测）。
- 测试 187 例（inspector 84 / protocol 20 / bridge 56 / extension 27）。
- 真机验收通过（2026-09-01）：Codex CLI 经 `codex mcp add ui-tuner --url http://127.0.0.1:47321/mcp` 注册后，`ui_get_context` 真实返回选中元素 Context（组件 Card · src/components/Card.tsx:10 · 指令「整体紧凑一点，标题不要变小」）。**两个 codex 侧坑**：① codex 需走本机代理（`HTTPS_PROXY=http://127.0.0.1:7892`，且 `NO_PROXY=localhost,127.0.0.1` 排除 loopback）否则模型流反复重连；② codex exec 调 MCP 工具需 `--dangerously-bypass-approvals-and-sandbox`（approval:never 会把 tools/call 当需审批而自动取消——"user cancelled MCP tool call"，请求根本不到 bridge）。

**M8**：Apply to Code（§29 流程 / §30 Dialog / §31 Result / §34 applying / §44–§47）。

- protocol：`ApplyScope`(instance|component) / `ApplyErrorCode`(SOURCE_NOT_FOUND|AGENT_OFFLINE|APPLY_FAILED|NOT_IMPLEMENTED) / `ApplyElementContext` / `ApplyChangeRequest` / `ApplyChangeResult`；消息 `changes.apply`(SP→Bridge) / `apply.result`(Bridge→SP) / `sidepanel.confirmApply`(SP→content) / `apply.confirmed`(content→SP)。
- bridge `adapter/prompt.ts` `buildCodexApplyPrompt()`：§28 约束（Tailwind 改 utility class 不加 inline style；CSS Module/plain CSS 改类规则；组件库保 variant/size/token 语义；最小改动）。`CodexAdapter.applyChanges()` 真实现：无 source→`SOURCE_NOT_FOUND`、不可用→`AGENT_OFFLINE`、spawn `codex exec`→`fileDiff.ts`（`snapshotSourceFiles`/`detectChangedFiles`，mtime+size 签名，不依赖 git，上限 2000 文件）检测改动→成功报 files+summary；exit≠0/无改动/超时→诚实 `APPLY_FAILED`（§47 绝不假成功）。
- **关键修复**：`defaultCodexRunner` spawn 必须 `stdio:["ignore","pipe","pipe"]` —— 默认 pipe 的 stdin 永不关闭会让 codex 阻塞在 "Reading additional input from stdin…"（真机卡 7 分钟 CPU 0:00.06 的根因）。`codexEnv()` 透传代理并强制 `NO_PROXY` 含 loopback（模型流走代理、/mcp 不走）。env-gated 调试 `UI_TUNER_DEBUG_CODEX=1` 落盘 `/tmp/ui-tuner-codex-last.log`。
- 面板 `ApplySection.tsx`（ChangesTab 挂载）：idle「Apply to Code」按钮 → §30 Dialog（scope radio instance/component + agent + sourceUnknown 警告）→ §34 applying 态 → §31 Result 卡（✓ Applied  emerald / Unable to apply changes 红 + Retry）；store `applyState/applyResult/applyConfirmedCount` + `applyChanges(scope)`（只发选中元素的 changes）+ stale 守卫。
- HMR 重定位（§22）：content `locateAppliedElement`（data-ui-tuner-id → selector+fingerprint 回退）+ `confirmOneChange` 轮询（移除 override→读 computed→`cssValuesEqual` 比对→不匹配则恢复 override 重试，8s 超时）；确认后 drop override+记录（面板 Preview 计数归零）。
- 测试 224 例（protocol 21 / inspector 91 / bridge 71 / extension 41）。
- 真机验收通过（2026-09-01，自动化 E2E 8/8，`/tmp/ui-tuner-e2e/m8-acceptance.mjs`）：选中「查看详情」→ Height 38→52 页面实时 → Changes 记录 → §30 Dialog → codex 真实改源码（Card.tsx 加 `className="card-details-button"`、styles.css 加 `.card-details-button{height:52px}`，遵循 plain-CSS 约束未加 inline style；并给 Button 加 className prop）→ Vite HMR → confirmApply 验证源码 computed=52px → ✓ Applied 卡（1 changes · Card.tsx, styles.css）。
- **真机自测 2（2026-09-02，对用户真实纯静态项目 vehicle-dashboard :8080，E2E 11/11 `/tmp/ui-tuner-e2e/selftest-gRange.mjs`）**：选中 `#gRangeText`（数据驱动文本 → inferred `index.html`）→ font-size 12.5→20 → Apply → codex 精确改 `.filter-bar .fb-range`（**非** `.page-header .date`）→ 刷新后源码改动生效。暴露并修复两个真实缺陷：
  - **Apply prompt 缺精确定位** → codex 凭文本语义猜错元素。修复：prompt Target 段加 `css selector` + `domFingerprint` + 显式「按 id/selector grep 定位，勿猜」指令。
  - **静态 HTML 无 HMR** → codex 改盘后页面不刷新、确认轮询必超时。修复：framework==="Unknown" 时跳过 confirmApply、Result 卡提示「刷新页面查看」+ `sidepanel.reloadPage` 消息（content `location.reload()`）。
  - 配套：`formatStyleChangeLine` 抽到 protocol 统一 §26 与 Changes 复制的改动行渲染；source unknown 时 Apply 入口+对话框按钮禁用。
- **真机自测 3（2026-09-02，vehicle-dashboard :8080）——颜色改动「提交后页面恢复原值」修复**：用户操作链 选中→改色→页面实时变→松手→change+1→**页面又变回原色**，记录的 change 是 `color: rgb(47, 109, 246) → #2f6df6`（同色）。两层根因，都已修：
  - **主因（受控控件绑定滞后值，父级重渲染回拨）**：预览帧（`committed:false`）**不更新** store 的 `styleValues`，但会更新 `log`、且每帧 content 回 `preview.changed` 更新 `changes`；App 顶层订阅 `log`+`changes`（徽标）→ **每次拖动/取色整个面板都重渲染**。于是绑定滞后 `styleValues` 的受控控件被重渲染**拨回原值**：
    - `ColorRow` 颜色框 `value={hex}`（hex 由 `styleValues` 派生）→ 重渲染拨回原色 → blur 提交原色。修复：本地 `draft` state 跟踪拖动期实时色值，blur 提交 draft。
    - `ScrubInput`（**所有数字拖动**：宽高/间距/gap/字号等）原来每次渲染无条件执行 `currentValue.current = value`，拖动中被滞后 prop 重置 → `pointerUp` 提交原值 → 页面回退、change 成 no-op。修复：改为 `useEffect` 仅在「非拖动且非编辑」时同步 ref。**这是「改了数值又变回原来的 / 改了像没变化」的根因**（间距控件也走 ScrubInput，一并修复）。`TextRow`（每击键即 commit 同步更新 store）、`SegmentRow`（点击直接 commit）本无此问题。
  - **兜底（同色 no-op 不记录）**：即便真提交了同色（打开取色器没动就关），也不该记成改动。`inspector/styles/color.ts` 新增 `colorKey()`（保留 alpha 的颜色归一化：opaque→`#rrggbb`，半透明→`rgba(r,g,b,a)`；8 位 hex / rgb / rgba / 逗号 / 斜杠语法都归一）；`cssValuesEqual()`（confirm.ts）颜色感知——先字符串归一比较，不等再比 `colorKey`；content 的 commit no-op 丢弃（content/index.ts）改用 `cssValuesEqual`。注意 `rgba(...,0.5)` ≠ `rgb(...)`（alpha 不同仍算改动）。
  - 回归测试（jsdom + RTL，**新增扩展组件测试基建**）：`rows.test.tsx`（ColorRow）、`ScrubInput.test.tsx`——复现「父组件重渲染把受控值拨回原值」，未修复时分别断言 `expected '#2f6df6' to be '#ff0000'`、`onCommit to be called with 52` 如期失败。**加固**：`ScrubInput.endDrag` 把 `commit()` 提到 `releasePointerCapture` 之前并给后者加 try/catch（pointer 被隐式释放时 release 抛 NotFoundError 会吞掉 commit）。
  - **端到端验证（2026-09-02，vehicle-dashboard :8080，`/tmp/ui-tuner-e2e/selftest-revert.mjs`，8/8 全过）**：真实浏览器里 ① 取色 `#ff0000` → swatch 不被回拨、页面变红且**保持**、Changes 记录 `rgb(47,109,246) → #ff0000`、Reset 还原；② 合成 pointer 拖动 font-size +20 → 提交 32.5（非原值 12.5）、页面 override `font-size:32.5px !important` 生效且**不回退**、面板 slider 显示 32.5。注：Playwright 真实鼠标 + pointer capture 在 headed Chrome 会把 pointerup 误投（自动化怪癖，非产品 bug），故拖动改用页面内合成 pointer 事件驱动。
  - 修复后符合预期逻辑：改属性实时可见、**提交后保留**（override 不撤）直到 Apply；Apply 后 HMR 项目无缝换源、静态项目刷新生效。
  - 另：width/height 设在 `display:inline` 元素（如 `<span>`）、gap 设在非 flex/grid 容器上**本就无视觉效果**——这是 CSS 固有行为，不是 bug。
- 测试 242 例（protocol 21 / inspector 100 / bridge 71 / extension 50）。

**注释模式重构（2026-09-02，`docs/superpowers/{specs,plans}/2026-09-02-annotation-mode*`，7 任务；分支 `feat/ui-ux-polish`）**

- 面板去 Tab → **两态注释模式**：空闲态只有「选取元素」，选中态显示 Breadcrumb + 操作；footer 吸底；Agent 高级设置折叠。新增中英文切换与亮/暗/跟随系统主题（`state/prefs.ts` + `i18n/messages.ts`，zh/en 键必须齐平，有 parity 测试）。
- inspector `annotations/Annotations.ts`：页面侧注释层（shadow host `ui-tuner-annotations-root`），气泡为**蓝色序号圆点**，按注释先后编号、重置后重新计数；Picker 新增 `passThroughHostIds` 放行注释层点击（否则点气泡被 Picker 吃掉）。
- protocol 新增 `sidepanel.clearSelection`（「完成此元素」）+ store `clearSelection`；**选中元素不再退出注释模式**（`picking` 只认 content 回报的 `picker.state` ack，面板不做乐观更新）；编辑卡里也有「取消」= 还原此元素改动并取消选中，注释模式保持。
- 气泡点击语义从「只读浮层」改为派发 `onOpenEditor`（为编辑卡铺路）。

**页面侧编辑卡（2026-09-03，`docs/superpowers/{specs,plans}/2026-09-03-page-editor-card*`，SDD 14 任务全绿，过程台账在 `.superpowers/sdd/2026-09-03-page-editor-card/`）**

- inspector 新增 `staging/StagingEngine.ts`（**保存才记录**：stage 只写 PreviewEngine → 页面实时可见但不落账；commit 才写 ChangeTracker；rollback 还原基线）与 `changes/InstructionStore.ts`（elementId → 自然语言指令，页面侧存储）。
- 扩展 `content/card/`：`EditorCard.tsx`（属性/自然语言两页签 + 折叠 + 取消/保存/删除）、`mount-card.tsx`（挂 shadow root `ui-tuner-editor-card-root`）、`inject-styles.ts`（Tailwind token scoped 到 `:host` / `:host(.dark)`，`adoptedStyleSheets` 注入）。样式控件从 `sidepanel/` 抽到 **`src/style-editor/`**（ScrubInput / rows / StylePanel / StyleEditContext）供卡片复用，行为保持不变。
- protocol：`preview.changed` 增 `instructions`（elementId→指令，面板镜像）；**删除 `sidepanel.stylePreview`**——面板不再下发编辑，改由页面卡片就地编辑。
- 面板：删掉编辑区；`ChangesTab` 组头显示该元素的自然语言指令；复制 / Agent Context / Apply prompt 三处都把元素指令纳入上下文（**元素指令在前、Agent 页全局备注在后**，合并进已有的单个 `instruction` 字段，无需改协议 schema）。
- SDD 终审（1 Critical + 2 Important）已在 `4ce156a` 修完并复审通过：卡片 remount key、「仅指令」元素支持、apply 串联。
- 测试 305 例（protocol 26 / inspector 121 / bridge 72 / extension 86）。

**真机验收轮（2026-09-03，`f8cf5a4` + 本轮「仅指令元素走 Apply」）**

复现用户报的 5 个验收问题，4 个在 HEAD 已不复现（含带 stage/气泡重开/Esc 退出的完整序列复验）；真凶是**「只写自然语言、不动数值」的元素在四处被当成空**：

1. **页面没有气泡** —— `Annotations.sync` 只吃 changes，且 `SelectionTracker.keepId` 也只看 changes，选中一转移 `data-ui-tuner-id` 就被摘掉。修复：`sync(changes, instructions)` 取并集（非空指令即注释），`keepId` 同步放宽；content 每次 mutation 都传两份数据。
2. **面板计数 `Preview · 0`** —— 修复：无改动行但有指令的元素计 1 条，且与有改动的元素不重复计数。
3. **空态文案还指向已删除的面板 Style 面板** —— 修复：改指页面编辑卡（zh/en 同步）。
4. **Apply 入口完全不渲染** —— 修复：`applyChanges` 守卫从「无改动就 return」改为「**既无改动又无指令**才 return」；`ApplySection` 用 `hasWork = 有改动 ∨ 有指令` 门控（按钮渲染 / 两处 disabled / 两处 title）；弹窗文案改「仅自然语言指令（无视觉改动）」而不是「0 处视觉改动」；bridge `buildCodexApplyPrompt` 在 `changes` 为空时**不再输出空的**「Apply these exact style changes」列表，改声明「无实测属性改动，用户指令即全部诉求」；`CodexAdapter` summary 不再谎称 `Applied 0 change(s)`，改 `Applied the user instruction to <files>`。协议无需改动（`changes: StyleChange[]` 本就允许空数组，`instruction?` 已存在）。

- 验证：`pnpm build/test/typecheck/lint` 全绿（**311 例**）；mutation check（把 `hasWork` 强制为真 → 「无改动又无指令时按钮不渲染」用例如期失败）；真机浏览器 `.playwright-mcp/verify-instruction-only-apply.mjs`（仅指令保存 → `Preview · 1` → **「应用到代码」按钮出现**（此前完全不渲染）→ 弹窗显示「仅自然语言指令（无视觉改动）」且不再有「0 处视觉改动」）；真实 codex exec `.playwright-mcp/verify-instruction-only-codex.mjs`（`changes: []` + 指令「把这个按钮改成次要样式（ghost variant）」→ 142.7s → success，`files: ["src/components/Card.tsx"]`，summary 为 `Applied the user instruction to …`，盘上 diff **恰好一行** `<Button>` → `<Button variant="ghost">`，相邻「导出报表」按钮未被误改；验证后已还原 fixture）。
- 环境注意：验证时 47321 上跑着用户另一个项目（vehicle-dashboard）的 Bridge，**没有抢占端口**；因此浏览器侧源码解析为 unknown，端到端 Codex 那一程改用直连 `CodexAdapter` 的方式跑（同一份 prompt/runner/fileDiff 代码路径）。
- 未修（已进 backlog）：编辑卡 textarea 内按 Esc 会退出整个注释模式。

## 7. 项目状态：核心闭环完成，`feat/ui-ux-polish` 待推送 + 待合并决策

核心闭环 **Select → Tune → Prompt → Apply to Code** 已端到端打通并多轮真机验收（M8、注释模式、页面编辑卡）。无后续里程碑，剩余为 backlog 增强项。

**下一步待用户决策（截至 2026-09-03）**：
1. `feat/ui-ux-polish`（30+ commits）**从未推送**，无 upstream。推送需代理：`HTTPS_PROXY=http://127.0.0.1:7892 git push -u origin feat/ui-ux-polish`（`docs/superpowers/plans/2026-09-02-annotation-mode.md` Task 7 Step 2 就是这一步）。
2. 合并到 `main` 的决策（PR 还是直接 merge）尚未做。
3. `docs/architecture.md` 未同步注释模式 + 页面编辑卡（仍写三 Tab 面板与 `sidepanel.stylePreview`）；下次动架构文档时一并补。

**注意**：顺延项都在 `docs/backlog.md`（Next App Router 适配、数据驱动文本索引、索引缓存、HMR 跨刷新持久化 §37、颜色 alpha、CLI npm 发布、codex MCP 免 bypass flag、ui_capture 元素级裁剪、**编辑卡内 Esc 只关卡片**）。

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
