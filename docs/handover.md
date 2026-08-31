# UI Tuner 交接文档

> 用途：任何新会话（Claude / Codex / 其他 Agent）接手开发时，读完本文档即可获得完整上下文。
> 配合根目录 `UI_TUNER_EXECUTION_PLAN.md`（完整执行计划）与 `docs/architecture.md`（已实现架构）使用。
> 规则：**每完成一个 Milestone，更新本文档**。

---

## 1. 当前状态快照（2026-08-31）

| 项       | 状态                                                        |
| -------- | ----------------------------------------------------------- |
| 里程碑   | **M1 完成**（真机验收通过）；**M2 完成**（待真机验收）      |
| 分支     | `main`（本地仓库，无远端，直接提交 main）                   |
| 验证     | `pnpm build / test / typecheck / lint` 全绿（47 例测试）    |
| 已知限制 | 页面刷新/导航后需手动 Reconnect（自动重连属后续，计划 §37） |

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
    architecture.md            已实现架构（每里程碑更新，M2 版含选取流程图）
    handover.md                本文档
    backlog.md                 顺延项 / scope 外需求
  dev/index.html               localhost 测试页（pnpm page 启动）
  packages/
    protocol/                  跨上下文消息类型（公共类型只放这里，规则 6）
    inspector/                 Element Picker / Overlay / Selection（chrome-free，jsdom 单测）
  apps/
    chrome-extension/
      public/manifest.json     MV3 manifest（content script 仅 localhost）
      sidepanel.html           Side Panel 入口
      vite.config.{sidepanel,content,background}.ts   三个独立构建
      src/
        background/            SW：点击图标开面板
        content/               内容脚本：接线 inspector ↔ Port（chrome 知识只在这里）
        sidepanel/             React App（App.tsx）
        messaging/channel.ts   Port 类型化封装（PortLike 结构接口）
        state/                 zustand store（连接 + picking + selection）
```

## 4. 技术决策与约束（勿推翻，除非有硬理由）

| 约束                                                                                                                 | 原因                                                      |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| TypeScript **锁 5.9.x**                                                                                              | typescript-eslint 8.x 不支持 TS 7；稳定性优先（计划 §53） |
| 三个 Vite 构建：sidepanel(ES) 先跑且唯一 `emptyOutDir`；content 必须 **IIFE**；background ES 单文件                  | MV3 产物格式硬约束；详见 architecture.md §4               |
| Side Panel ↔ Content Script 用 `chrome.tabs.connect` **直连 Port**（`ui-tuner`），不经 background 中转               | 实时性 + 避免 SW 回收复杂度                               |
| 消息一律 `{ type, payload }`（payload 非数组对象），边界处 `isUiTunerMessage()` 收窄，非法消息静默丢弃               | protocol 包守卫，channel.ts 统一执行                      |
| `Channel` 依赖 `PortLike` 结构接口；inspector 不 import chrome                                                       | 单测免 mock chrome；新逻辑照此模式保持可测                |
| bridge 不得 import 浏览器 API（规则 8）                                                                              | 包边界                                                    |
| Overlay：Shadow DOM 隔离 + 持 Element 引用每帧重测 rect + 无目标即停 rAF；样式只在 `inspector/src/styles/overlay.ts` | 滚动/resize/布局位移天然正确（计划 §2.2/§33）             |
| Picker：mousemove 只写坐标缓存（passive），`elementFromPoint` 每帧至多一次；点击在 document capture 拦截             | 计划 §33 性能红线                                         |
| 选取状态以 content 回报的 `picker.state` 为准（面板不做乐观更新）                                                    | Esc 等面板外路径不产生状态漂移                            |
| pnpm 11 + Turborepo 2；`onlyBuiltDependencies: [esbuild]` 在 pnpm-workspace.yaml                                     | pnpm ≥10 默认拦截构建脚本                                 |
| UI 风格：克制、高信息密度、Figma/Linear/Raycast 质感（计划 §48）；已用 zinc 暗色 + Tailwind 4                        | 禁渐变堆砌/游戏化                                         |

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

**真机验证循环**：改代码 → `pnpm build` → `chrome://extensions` 点扩展卡片刷新 → **刷新 localhost 页面**（content script 只在页面加载时注入，旧页面不会换新脚本）→ 重开 Side Panel → 在 `http://localhost:8000` 上操作。加载目录：`apps/chrome-extension/dist`（⌘⇧G 粘贴路径最快）。

## 6. 已交付摘要

**M1**：Monorepo + MV3 扩展骨架 + Side Panel(React 19/zustand/Tailwind 4) + Content Script + background SW + 双向 Port 通道（`content.ready` / `sidepanel.ping` / `content.pong`）。真机验收通过。

**M2**：`packages/inspector`（Picker / Overlay / SelectionTracker / identity）+ protocol 新消息（`sidepanel.picking` / `picker.state` / `selection.changed` / `selection.cleared` / `sidepanel.selectAncestor`）+ content 接线 + Side Panel 选取卡片与 Breadcrumb。验收：hover 出框（`tag  W × H`）、点击选中、⌘↑/Breadcrumb 父级导航、Esc 取消/清除、元素移出 DOM 即 `selection.cleared`。测试 47 例（inspector 26 / protocol 10 / extension 11）。

## 7. 下一里程碑：M3 — Style Inspector

**范围（计划 §8/§9 + §10 + §11）**：

1. Side Panel 三 Tab：`Style`（默认）/ `Agent` / `Changes`（M3 只实现 Style 可用，另两个占位）
2. Style 分组：Layout（display/flex 对齐/ wrap / gap）、Size、Spacing（padding/margin，Simple+Advanced）、Typography、Fill、Border、Effects
3. **ScrubInput（P0）**：Drag ±1 / Shift ±10 / Option ±0.1 / 方向键 / 双击输入文本；拖动只 `onPreview`，释放才 `onCommit`
4. **Preview CSS Engine（计划 §11）**：不写 `element.style`，用 `<style id="ui-tuner-preview-style">` 生成 `[data-ui-tuner-id="ut-xxxxxx"] { prop: value !important }`
5. **Element Context（计划 §3/§7）**：选中后抓 computed style —— 只取 §7 白名单（display/尺寸/margin/padding/gap/flex/grid/字体/颜色/背景/边框/阴影/opacity/transform），DOM Snapshot（selected/parent/children，`MAX_HTML_LENGTH = 12000` 截断）

**验收**：修改实时 Preview（如 gap 24 → 16 页面立即变化，且改动记录进 ChangeSet 结构——完整 Changes Tab 属 M4）。

**实现指引**：

- 白名单与 CSS 值解析（px/rem/%/auto 解析为数值+单位）放 `packages/inspector/src/styles/`（chrome-free 可单测）；computed style 抓取在 content script（`getComputedStyle` + 白名单过滤）。
- Preview 引擎放 inspector（生成 CSS 文本 + 管理 `<style>` 标签），content 只接线。
- protocol 扩展：`selection.changed` 的 payload 增加 `styles: Record<string, string>`（对齐计划 §18）；新增 `preview.changed {changeSet}`（M4 完整 ChangeSet 前可先发轻量变更列表）。
- Side Panel 用 Tab 切换 Style/Agent/Changes；Inspector 控件密度高、宽度 360px 目标（计划 §48）。
- 数值 Scrub 拖动节流走 rAF；preview 只 patch 变化的 CSS 规则文本。
- **禁止**：Element Picker 范围内的新功能（multi-select 在 backlog）、Bridge、Agent。

**之后**：M4 ChangeSet（记录/Revert/Reset/Changes Tab）→ M5 Bridge → M6 Source Resolver → M7 Agent+MCP → M8 Apply to Code。

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
