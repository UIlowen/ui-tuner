# UI Tuner

面向 AI Coding / Vibecoding 场景的 Chrome UI 调整插件。核心闭环：**Select → Tune → Prompt → Apply to Code**。

> 完整产品规划与执行计划见 [UI_TUNER_EXECUTION_PLAN.md](./UI_TUNER_EXECUTION_PLAN.md)，
> 当前架构说明见 [docs/architecture.md](./docs/architecture.md)，交接状态见 [docs/handover.md](./docs/handover.md)。

## 当前状态

- **Milestone 1 完成**：Monorepo + MV3 扩展 + Side Panel + Content Script + 双向消息通道（真机验收通过）
- **Milestone 2 完成**：Element Picker（hover 高亮 / 点击选中 / ⌘↑ 父级 / Breadcrumb / Esc）

## 环境要求

- Node ≥ 20
- pnpm ≥ 10（`npm i -g pnpm`）
- Chrome ≥ 116（Side Panel API）

## 开发

```bash
pnpm install    # 安装依赖
pnpm build      # 构建所有包（protocol/inspector → extension 三个产物）
pnpm dev        # watch 模式构建扩展（Chrome 里加载的 dist 持续可用）
pnpm test       # vitest（turbo 编排，47 例）
pnpm typecheck  # tsc --noEmit
pnpm lint       # eslint
pnpm format     # prettier
pnpm page       # 测试页 http://localhost:8000（绑定 127.0.0.1）
```

## 在 Chrome 中加载扩展

1. `pnpm build`
2. 打开 `chrome://extensions`
3. 右上角开启 **开发者模式**
4. 点击 **加载已解压的扩展程序**（⌘⇧G 可直接粘贴路径），选择：

   ```txt
   apps/chrome-extension/dist
   ```

> 扩展只在 `http://localhost/*` 与 `http://127.0.0.1/*` 生效（安全边界，计划 §38）。
> 修改代码后：`pnpm build` → `chrome://extensions` 点扩展卡片上的刷新。

## 验收

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
packages/inspector        Element Picker / Overlay / Selection（DOM 能力，chrome-free）
dev/                      localhost 测试页
docs/                     architecture / handover / backlog
```

后续 Milestone（Style Inspector → ChangeSet → Bridge → Source Resolver → Agent/MCP → Apply to Code）见执行计划 §42。
