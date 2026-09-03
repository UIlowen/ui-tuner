# Backlog

> 顺延项与 scope 外需求统一记录在这里（计划 §1.2 / 规则 12）。不扩展当前 Milestone 范围。

## 顺延（计划内，后续 Milestone / MVP 后半段）

| 项                           | 说明                                                                                | 预计归属          |
| ---------------------------- | ----------------------------------------------------------------------------------- | ----------------- |
| Multi Select                 | Shift+Click 多选，max 10（计划 Task 2.5）                                           | M2 后半段 / M3 前 |
| ⌘↓ 选子级                    | 与 ⌘↑ 对称的向下导航                                                                | 待定              |
| 自动重连 / 状态持久化        | 页面导航刷新后自动恢复 Port 与选中态（计划 §37）。注：M8 已实现 Apply 链路的 HMR 重定位（§22 locateAppliedElement/confirmApply），跨**手动刷新**的持久化仍开放 | M5 后             |
| 颜色 alpha 保留              | 色板提交写 `#rrggbb` 丢失半透明 alpha（M3 取舍）                                    | 待定              |
| box-shadow / grid 可视化编辑 | M3 仅文本输入（§9.8/§9.2 合理最小实现）                                             | 待定              |
| Playwright E2E               | 计划 §40 Test 01–07（需 headed Chromium + --load-extension）                        | 能力齐备后统一补  |
| 完整 Undo Stack              | 计划 §14，V0.1 只需 Revert 单属性/元素/全部                                         | P1                |
| Variant Scope                | Apply Dialog 的第三种 scope（计划 §30）                                             | P1                |
| npm 发布 CLI                 | `npx ui-tuner`（计划 §15 正式入口）当前不可用——包未发布；Offline 卡文案为发布后目标 | 发布节点          |
| Next App Router 适配         | Source Resolver V1 只覆盖 Vite/React 常规结构 + 纯静态 HTML（M8 起支持 `.html`/`class=`） | M7+               |
| 数据驱动文本索引             | JS 计算/数组渲染的字符串（如 `` `当前:${y} 年 ${m} 月` ``）无静态文本字面量 → 文本信号缺失，只能靠 id/class/tag 到 inferred，达不到 exact | 待定              |
| Bridge 项目根自动关联        | 当前需 `--cwd` 手动匹配正在浏览的项目，指错根则解析全部 unknown（Preview only）；devServerUrl 探测也可能选中同机其它端口的服务。未来应从已连接页面的 origin 自动关联项目根/dev server | 待定              |
| 源码索引缓存/文件监听        | M6 每次 selection 重建索引（上限 500 文件）；大项目需要缓存或 watch                 | 待定              |
| codex MCP 免 bypass 配置     | codex exec 调 tools/call 默认被 approval:never 取消（"user cancelled MCP tool call"），需 `--dangerously-bypass-approvals-and-sandbox`；研究 trusted-MCP / 配置文件持久放行（M8 已用 flag 跑通，免 flag 仍开放） | 发布节点          |
| ui_capture 元素级裁剪        | M7 截图为整页可视区（captureVisibleTab）；元素级裁剪需面 offscreen canvas           | 待定              |
| 编辑卡内 Esc 只关卡片        | 焦点在页面编辑卡的自然语言 textarea 里按 Esc，会冒泡到 document 的 Picker 监听并**退出整个注释模式**（期望：只关闭/收起卡片，注释模式保持）。2026-09-03 真机验收发现，未修 | 待定              |

## Scope 外（V0.1 明确不做，计划 §1.2）

Figma Import · AI 生成整页 · Vue/Svelte/Angular · Animation Editor · 完整 Grid Editor · 自由拖拽布局 · Production CMS · Design System 自动生成 · Responsive 自动设计 · iframe 深度编辑 · Shadow DOM 深度编辑（说明：Overlay 自身用 Shadow DOM 做样式隔离不受此限） · 多页面视觉回归 · 云端账号 · 登录 · 团队协作
