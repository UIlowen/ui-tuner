# UI Tuner

面向 AI Coding / Vibecoding 场景的 Chrome UI 调整插件。核心闭环：**Select → Tune → Prompt → Apply to Code**。

> 完整产品规划与执行计划见 [UI_TUNER_EXECUTION_PLAN.md](./UI_TUNER_EXECUTION_PLAN.md)，
> 当前架构说明见 [docs/architecture.md](./docs/architecture.md)。

## 当前状态

**Milestone 1 完成**：Monorepo + Chrome Extension（MV3）+ Side Panel + Content Script + 双向消息通道。

## 环境要求

- Node ≥ 20
- pnpm ≥ 10（`npm i -g pnpm`）
- Chrome ≥ 116（Side Panel API）

## 开发

```bash
pnpm install    # 安装依赖
pnpm build      # 构建所有包（protocol → extension 三个产物）
pnpm dev        # watch 模式构建扩展（Chrome 里加载的 dist 持续可用）
pnpm test       # vitest（turbo 编排）
pnpm typecheck  # tsc --noEmit
pnpm lint       # eslint
pnpm format     # prettier
```

## 在 Chrome 中加载扩展

1. `pnpm build`
2. 打开 `chrome://extensions`
3. 右上角开启 **开发者模式**
4. 点击 **加载已解压的扩展程序**，选择目录：

   ```txt
   apps/chrome-extension/dist
   ```

## 验收（Milestone 1）

1. 起一个本地测试页：仓库根目录执行 `pnpm page`（等价于 `python3 -m http.server 8000 --bind 127.0.0.1 --directory dev`），然后访问 `http://localhost:8000`。
2. 点击工具栏的 UI Tuner 图标 → 打开 Side Panel。
3. Side Panel 显示 **Connected**，并显示页面 title / URL。
4. 点击 **Ping page** → 显示 RTT（毫秒），Messages 列表出现 `→ sidepanel.ping` / `← content.pong`。

> 扩展只在 `http://localhost/*` 与 `http://127.0.0.1/*` 生效（安全边界，计划 §38）。
> 修改代码后回到 `chrome://extensions` 点击扩展卡片上的刷新按钮即可。

## Repo 结构

```txt
apps/chrome-extension   Chrome MV3 扩展（Side Panel / Content Script / Background）
packages/protocol       跨上下文共享消息协议
docs/                   架构文档
```

后续 Milestone（Element Picker → Style Inspector → ChangeSet → Bridge → Source Resolver → Agent/MCP → Apply to Code）见执行计划 §42。
