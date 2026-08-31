# UI Tuner 交接文档

> 用途：任何新会话（Claude / Codex / 其他 Agent）接手开发时，读完本文档即可获得完整上下文。
> 配合根目录 `UI_TUNER_EXECUTION_PLAN.md`（完整执行计划）与 `docs/architecture.md`（已实现架构）使用。
> 规则：**每完成一个 Milestone，更新本文档**。

---

## 1. 当前状态快照（2026-08-31）

| 项       | 状态                                                                          |
| -------- | ----------------------------------------------------------------------------- |
| 里程碑   | **M1 完成**（含真机验收）；**M2 开发中**                                      |
| 分支     | `main`（本地仓库，无远端，直接提交 main）                                     |
| 最近提交 | `de053a1` M1 基础插件 · `1e92275` dev 测试页 ·（M2 提交见 git log）           |
| 验证     | `pnpm build / test / typecheck / lint` 全绿；真机：Connected + 页面信息回传 ✓ |
| 已知限制 | 页面刷新/导航后需手动 Reconnect（自动重连属后续，计划 §37）                   |

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
    architecture.md            已实现架构（每里程碑更新）
    handover.md                本文档
    backlog.md                 顺延项 / scope 外需求
  dev/index.html               localhost 测试页（pnpm page 启动）
  packages/
    protocol/                  跨上下文消息类型（公共类型只放这里，规则 6）
    inspector/                 [M2] Element Picker / Overlay（DOM 能力，chrome-free）
  apps/
    chrome-extension/
      public/manifest.json     MV3 manifest（content script 仅 localhost）
      sidepanel.html           Side Panel 入口
      vite.config.{sidepanel,content,background}.ts   三个独立构建
      src/
        background/            SW：点击图标开面板
        content/               内容脚本：接 Port、接线 inspector
        sidepanel/             React App（App.tsx）
        messaging/channel.ts   Port 类型化封装（PortLike 结构接口）
        state/                 zustand store
```

## 4. 技术决策与约束（勿推翻，除非有硬理由）

| 约束                                                                                                   | 原因                                                      |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| TypeScript **锁 5.9.x**                                                                                | typescript-eslint 8.x 不支持 TS 7；稳定性优先（计划 §53） |
| 三个 Vite 构建：sidepanel(ES) 先跑且唯一 `emptyOutDir`；content 必须 **IIFE**；background ES 单文件    | MV3 产物格式硬约束；详见 architecture.md §4               |
| Side Panel ↔ Content Script 用 `chrome.tabs.connect` **直连 Port**（`ui-tuner`），不经 background 中转 | 实时性 + 避免 SW 回收复杂度                               |
| 消息一律 `{ type, payload }`，边界处 `isUiTunerMessage()` 收窄，非法消息静默丢弃                       | protocol 包守卫，channel.ts 统一执行                      |
| `Channel` 依赖 `PortLike` 结构接口                                                                     | 单测免 mock chrome；新消息处理逻辑照此模式保持可测        |
| inspector 包不得 import chrome API；bridge 不得 import 浏览器 API（规则 7/8）                          | 包边界                                                    |
| pnpm 11 + Turborepo 2；`onlyBuiltDependencies: [esbuild]` 在 pnpm-workspace.yaml                       | pnpm ≥10 默认拦截构建脚本                                 |
| UI 风格：克制、高信息密度、Figma/Linear/Raycast 质感；禁止渐变堆砌/游戏化（计划 §48）                  | 已用 zinc 暗色体系 + Tailwind 4                           |

## 5. 常用命令

```bash
pnpm install
pnpm build        # 全部构建（turbo 保证 protocol/inspector 先于 extension）
pnpm test         # vitest（turbo 编排，每包各自跑）
pnpm typecheck
pnpm lint
pnpm dev          # 扩展三个构建并行 watch
pnpm page         # 测试页 http://localhost:8000（绑定 127.0.0.1）
```

**真机验证循环**：改代码 → `pnpm build` → Chrome `chrome://extensions` 点扩展卡片刷新 → 在 `http://localhost:8000` 上操作。加载目录：`apps/chrome-extension/dist`。

## 6. M1 交付摘要

- Monorepo + MV3 扩展骨架 + Side Panel(React 19/zustand/Tailwind 4) + Content Script + background SW。
- 消息：`content.ready` / `sidepanel.ping` / `content.pong`（通道验收工具）。
- 测试：protocol 守卫 8 例；channel 内存端口对 4 例；store 状态机 4 例。

## 7. 下一里程碑：M2 — Element Picker（进行中）

**范围（计划 §6 + §42）**：

1. Edit Mode：mousemove → `elementFromPoint` → Overlay（Hover 高亮，≥30fps）
2. Overlay：独立层 `ui-tuner-overlay-root`（Shadow DOM 隔离），pointer-events:none / fixed / 最高 z-index / 不影响布局 / 滚动 resize 后位置正确；标签显示 `Button  120 × 40`
3. Click 选中：锁定元素，Side Panel 显示 tag、尺寸、selector
4. `⌘↑` 选父级；Side Panel Breadcrumb 可点击回跳
5. Esc：取消 Pick / 清除选中
6. 顺延：Multi Select（Shift+Click，max 10）→ 已记 backlog

**验收**：可以稳定选择页面元素（hover 出框、点击选中、⌘↑ 走父级链、Esc 取消、刷新后 Reconnect 可用）。

**性能红线（计划 §33）**：mousemove 路径只做 `elementFromPoint` + `getBoundingClientRect` + overlay 绘制；禁止序列化 DOM / 截图 / 全量 computed style / 调 Bridge。用 rAF 合并 mousemove。

**实现指引**：

- 新逻辑进 `packages/inspector`（picker/ overlay/ dom/ measurement/ styles/ 子目录对齐计划 §4），chrome 接线留在 `src/content/`。
- protocol 新增消息（延续现有命名风格）：`sidepanel.picking`{enabled}（SP→CS）、`picker.state`{enabled}（CS→SP）、`selection.changed`{element,breadcrumb}（CS→SP，字段对齐计划 §18 ElementContext.element：id/tagName/selector/text/bounds）、`selection.cleared`（CS→SP）、`sidepanel.selectAncestor`{uiTunerId}（SP→CS）。
- 选中元素打 `data-ui-tuner-id="ut-######"`（计划 §11/§21 的 ElementIdentity 基础），换选/清除时摘掉旧属性。
- Overlay 跟踪 **Element 引用**每帧量 rect（天然处理滚动/resize/布局位移），无目标时停 rAF。
- 组件名（如 PricingCard）解析属 M6 Source Resolver，M2 标签只显示 tagName，不得伪造组件名。
- 选中的元素若被移出 DOM（如 HMR）：发 `selection.cleared`，不许静默错选（计划 §22 精神）。

**之后**：M3 Style Inspector（Size/Spacing/Layout/Typography/Fill/Border + ScrubInput，实时 Preview）→ M4 ChangeSet → M5 Bridge → M6 Source Resolver → M7 Agent+MCP → M8 Apply to Code。

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
