# UI Tuner

面向 AI Coding / Vibecoding 场景的 Chrome UI 调整插件。核心闭环：**Select → Tune → Prompt → Apply to Code**。

> 完整产品规划与执行计划见 [UI_TUNER_EXECUTION_PLAN.md](./UI_TUNER_EXECUTION_PLAN.md)，
> 当前架构说明见 [docs/architecture.md](./docs/architecture.md)，交接状态见 [docs/handover.md](./docs/handover.md)。

## 当前状态

- **Milestone 1 完成**：Monorepo + MV3 扩展 + Side Panel + Content Script + 双向消息通道（真机验收通过）
- **Milestone 2 完成**：Element Picker（hover 高亮 / 点击选中 / ⌘↑ 父级 / Breadcrumb / Esc，真机验收通过）
- **Milestone 3 完成**：Style Inspector（三 Tab / ScrubInput 拖拽调值 / 实时 Preview / 变更记录，真机验收通过）
- **Milestone 4 完成**：ChangeSet（单条 Revert / 元素 Revert / Reset All / Changes Tab 完整化，真机验收通过）
- **Milestone 5 完成**：Local Bridge（本地服务 + WebSocket + 项目检测 + Bridge Offline 提示；CLI 正式名 `ui-tuner`，发布 npm 前用 `pnpm bridge`，真机验收通过）

## 环境要求

- Node ≥ 20
- pnpm ≥ 10（`npm i -g pnpm`）
- Chrome ≥ 116（Side Panel API）

## 开发

```bash
pnpm install    # 安装依赖
pnpm build      # 构建所有包（protocol/inspector → extension 三个产物）
pnpm dev        # watch 模式构建扩展（Chrome 里加载的 dist 持续可用）
pnpm test       # vitest（turbo 编排，133 例）
pnpm typecheck  # tsc --noEmit
pnpm lint       # eslint
pnpm format     # prettier
pnpm page       # 测试页 http://localhost:8000（绑定 127.0.0.1）
pnpm bridge     # 启动 Local Bridge ws://127.0.0.1:47321（--cwd <项目路径> 指定目标项目）
```

> Bridge CLI 的正式命令是 `npx ui-tuner`（计划 §15，在用户项目目录执行）——**当前包未发布 npm，npx 不可用**。本地开发用 `pnpm bridge --cwd <你的项目路径>`（仓库根执行），或 `cd` 进项目目录后 `node "<仓库>/packages/bridge/dist/cli.js"`。

## 在 Chrome 中加载扩展

1. `pnpm build`
2. 打开 `chrome://extensions`
3. 右上角开启 **开发者模式**
4. 点击 **加载已解压的扩展程序**（⌘⇧G 可直接粘贴路径），选择：

   ```txt
   apps/chrome-extension/dist
   ```

> 扩展只在 `http://localhost/*` 与 `http://127.0.0.1/*` 生效（安全边界，计划 §38）。
> 修改代码后的完整循环：`pnpm build` → `chrome://extensions` 点扩展卡片刷新 → **刷新 localhost 页面**（content script 只在页面加载时注入）→ 重开 Side Panel。

## 验收

### Milestone 5 — Local Bridge

1. `pnpm build` → `chrome://extensions` 刷新扩展 → 刷新 localhost 页面 → 重开 Side Panel。
2. 不启动 Bridge 时：面板显示 **Bridge · Offline** 卡（`npx ui-tuner` 提示 + Reconnect），选取/调样式全部正常（§35）。
3. 另开终端启动 Bridge（二选一，`<项目路径>` 换成你的项目目录）：

   ```bash
   # a) 仓库根执行（推荐）
   pnpm bridge --cwd <项目路径>
   # b) 或 cd 进项目目录，直接跑仓库里的 CLI
   node "/Users/lowenlau/Documents/WorkSpace/UI Tuner/packages/bridge/dist/cli.js"
   ```

   终端打印 §15 横幅（框架 / root / dev server / 监听地址）。面板 Offline 卡上的 `npx ui-tuner` 是发布后的正式命令，当前未发布不可用。

4. 面板点 **Reconnect**（或重开面板）→ Bridge 卡变为 `Bridge · Connected`，显示框架名 + dev server 地址。
5. 选取元素、改几处样式 → Bridge 终端不报错；`curl http://127.0.0.1:47321/health` 返回项目 JSON。
6. Ctrl-C 停掉 Bridge → 面板回到 Offline，Preview 依旧可编辑。

### Milestone 4 — ChangeSet

1. `pnpm build` → `chrome://extensions` 刷新扩展 → 刷新 localhost 页面 → 重开 Side Panel。
2. 选取元素，改 3+ 处样式（如 Height、Padding、Radius），可再选另一个元素改 1-2 处。
3. 切到 **Changes** Tab → 按元素分组展示全部修改，标签显示元素名。
4. 点某条行尾 **↩** → 页面该属性恢复原值，Style Tab 数值同步回原值，该条从列表消失。
5. 点某元素组 **Revert** → 该元素全部修改恢复。
6. 点底部 **Reset All** → 所有预览修改清空，页面回到原始状态（无需刷新页面）。
7. 关闭再重开 Side Panel（不刷新页面）→ Changes 列表恢复显示。

### Milestone 3 — Style Inspector

1. `pnpm build` → `chrome://extensions` 刷新扩展 → 刷新 localhost 页面 → 重开 Side Panel。
2. 选取「立即订阅」按钮 → 面板出现 **Style / Agent / Changes** 三 Tab，Style 默认展开各分组。
3. **Size → Height**：按住数值左右拖动 → 页面按钮高度实时变化（Shift 拖 ×10，Option 拖 ×0.1，↑↓ 键 ±1，双击可键入 `36px`）。
4. **Typography → Size / Color**：拖字号、点色板换文字色，实时生效。
5. 切到 **Changes** Tab → 每次提交的修改都列出（`height 41px → 36px` 等），Tab 标签显示计数。
6. DevTools Elements 里可见 `<style id="ui-tuner-preview-style">`，规则形如 `[data-ui-tuner-id="ut-000001"] { height: 36px !important; }`（不写元素内联样式）。
7. 刷新页面 → 预览修改全部消失（Preview 只在浏览器，不动源码）。

### Milestone 2 — Element Picker

1. 仓库根目录 `pnpm page`，访问 `http://localhost:8000`。
2. 点工具栏 UI Tuner 图标打开 Side Panel，确认 **Connected**。
3. 点 **选取元素** → 鼠标在页面上移动，元素出现蓝色高亮框 + `tag  宽 × 高` 标签。
4. 点击「立即订阅」按钮 → 紫色选中框，Side Panel 显示 `<button>`、尺寸、selector、文本预览。
5. 按 **⌘↑** 数次 → 选中沿 `button → div.actions → section.card → body` 上移，Breadcrumb 同步。
6. 点击 Breadcrumb 中任意 chip → 跳回对应祖先元素。
7. 按 **Esc** → 选中清除；再点 **选取元素** 后按 **Esc** → 取消选取模式。

### Milestone 1 — 通道

Ping page 出现 RTT 与 `→ sidepanel.ping` / `← content.pong` 日志。

## Repo 结构

```txt
apps/chrome-extension     Chrome MV3 扩展（Side Panel / Content Script / Background）
packages/protocol         跨上下文共享消息协议
packages/inspector        Picker / Overlay / Selection / PreviewEngine / ChangeTracker（chrome-free）
packages/bridge           Local Bridge：WebSocket 服务 + 项目检测（CLI bin: ui-tuner）
dev/                      localhost 测试页
docs/                     architecture / handover / backlog
```

后续 Milestone（Style Inspector → ChangeSet → Bridge → Source Resolver → Agent/MCP → Apply to Code）见执行计划 §42。
