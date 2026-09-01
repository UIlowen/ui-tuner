# Backlog

> 顺延项与 scope 外需求统一记录在这里（计划 §1.2 / 规则 12）。不扩展当前 Milestone 范围。

## 顺延（计划内，后续 Milestone / MVP 后半段）

| 项                           | 说明                                                                            | 预计归属          |
| ---------------------------- | ------------------------------------------------------------------------------- | ----------------- |
| Multi Select                 | Shift+Click 多选，max 10（计划 Task 2.5）                                       | M2 后半段 / M3 前 |
| ⌘↓ 选子级                    | 与 ⌘↑ 对称的向下导航                                                            | 待定              |
| 自动重连 / 状态持久化        | 页面导航刷新后自动恢复 Port 与选中态（计划 §37；跨刷新恢复依赖 HMR 重定位 §22） | M5 后             |
| 颜色 alpha 保留              | 色板提交写 `#rrggbb` 丢失半透明 alpha（M3 取舍）                                | 待定              |
| box-shadow / grid 可视化编辑 | M3 仅文本输入（§9.8/§9.2 合理最小实现）                                         | 待定              |
| Playwright E2E               | 计划 §40 Test 01–07（需 headed Chromium + --load-extension）                    | 能力齐备后统一补  |
| 完整 Undo Stack              | 计划 §14，V0.1 只需 Revert 单属性/元素/全部                                     | P1                |
| Variant Scope                | Apply Dialog 的第三种 scope（计划 §30）                                         | P1                |

## Scope 外（V0.1 明确不做，计划 §1.2）

Figma Import · AI 生成整页 · Vue/Svelte/Angular · Animation Editor · 完整 Grid Editor · 自由拖拽布局 · Production CMS · Design System 自动生成 · Responsive 自动设计 · iframe 深度编辑 · Shadow DOM 深度编辑（说明：Overlay 自身用 Shadow DOM 做样式隔离不受此限） · 多页面视觉回归 · 云端账号 · 登录 · 团队协作
