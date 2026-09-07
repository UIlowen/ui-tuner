# 注释模式重构设计（Annotation Mode）

日期：2026-09-02 · 分支：`feat/ui-ux-polish`

## 目标

把 sidepanel 从「三 tab 工具台」改成「页面注释模式」的直达体验：进入注释模式 → 页面上连续点选元素、调样式（实时预览、改动即时留痕气泡）→ 点气泡看改动详情 → 退出注释模式 → 面板展示全部改动（按元素分组）→ 一键复制 / 发给 Agent 落源码。

## 已确认的决策（与用户逐项对齐）

1. **气泡即时出现**：改动一产生气泡就显示（所见即所得），不需确认门槛。「✓ 完成此元素」按钮语义 = 清除当前选中高亮、停留在注释模式等待点选下一个元素。
2. **点气泡 → 页面弹浮层**：浮层展示该元素完整改动列表（属性 旧值→新值）+「还原此元素」+ 关闭。
3. **注释模式持续到手动退出**：选中元素后不再自动退出 picking；Esc 或再按按钮退出。页面交互屏蔽沿用现状（Picker capture + preventDefault 已实现）。
4. **改动列表只在注释模式 OFF 时显示**：面板是两态界面，无 tab。
5. **删除选中卡**：tag+尺寸与页面高亮标签重复、selector 是调试信息。样式编辑区顶部保留一行精简信息：`<tag> W×H · ●源码徽标`。面包屑 chips 删除（⌘↑ 选父级快捷键保留，提示文案写明）。
6. **Agent 高级配置（指令框、上下文开关、Context Level、Prompt 预览）**：本分支保留为默认折叠的「Agent 高级设置」区（codex/Bridge 路径的配置）。**LLM 对话框（GLM/Kimi/MiniMax 直连接 API，定位=咨询/出代码片段）是独立子系统，另开分支做，不在本设计范围。**
7. 配色 token 不动；调试区（Page 卡/Ping/Messages）已在前一提交删除。

## 面板结构（两态）

```
注释模式 ON：
  header（标题 + 中/EN + 主题 + 状态灯）
  状态区（连接错误卡 / Bridge 离线卡或一行状态）
  [◉ 退出注释模式 (Esc)]        ← 激活态按钮
  编辑区（选中元素时）：
    一行精简头：<tag> W×H · ●徽标
    StylePanel（原样）
    [✓ 完成此元素]

注释模式 OFF：
  header + 状态区（同上）
  [选取元素]
  改动列表（按元素分组，含逐条 ↩ / 按元素还原，移植自现 ChangesTab）
  ▸ Agent 高级设置（折叠：指令 / 开关 / Level / Prompt 预览）
  ────────────────────────────
  吸底 footer：[复制改动] [发给 Agent]  ← OFF 态且改动 >0 时出现
```

- 删除 `TabId` state、tab 导航、SelectionCard 组件。
- ON 态且未选中元素时，编辑区位置显示「点击页面中的元素」提示（沿用现有 picking 提示）。
- 「发给 Agent」开现有 Apply 对话框（§30 scope+agent 不动）；ApplySection 从 ChangesTab 移入 footer 区。
- 「✓ 完成此元素」：`clearSelection`（发 selection.cleared、关高亮）但不退出 picking。

## 页面侧改动

### Picker（packages/inspector/src/picker/Picker.ts）

- content 的 `onSelect` 不再调 `picker.stop()` / 发 `picker.state false`——注释模式持续。
- Picker 的 document 级 mousedown/click 拦截需**放行注释层**：事件 `composedPath()` 穿过 Annotations host 时不 suppress、不触发选取（否则气泡/浮层点不动）。
- `resolveElement` 排除注释 host（同现有 overlay-root 排除）。

### Annotations（新增 packages/inspector/src/annotations/Annotations.ts）

- 独立 shadow-DOM host（`ui-tuner-annotations-root`），与 Overlay 平行；`pointer-events` 默认 none，气泡/浮层自身 `auto`。
- API：`sync(changes: StyleChange[])` —— content 在 changeTracker 每次变化后调用；内部按 elementId 分组，元素经 `[data-ui-tuner-id]` 定位（带改动的元素 keepId 已保证属性保留）。
- 气泡：元素右上角圆角计数徽标（`2`），rAF 重测跟随滚动/缩放（复用 Overlay 模式）；元素离开 DOM 时气泡隐藏（不画错的，§22 精神）。
- 浮层：点气泡切换；内容为该元素改动逐条 `property: 旧值 → 新值` + 「还原此元素」按钮（直接调 content 的 revertElement 路径）+ ✕ 关闭；同时只开一个浮层。
- Revert/Reset 后 sync 即时移除气泡；页面刷新一切消失（内存态，§37）。

### content/index.ts

- 实例化 Annotations；changeTracker 变化的所有出口（applyStylePreview / revertChange / revertElement / resetChanges / confirmApply）统一过 `syncAfterChanges` 补 `annotations.sync()`。
- `onSelect` 改为持续模式（见上）。
- reconnect 重同步 changes 时也 sync 气泡。

### 协议

新增**一条**消息：`sidepanel.clearSelection`（panel → content，空 payload）——「✓ 完成此元素」需要让 content 执行 clearSelection（关高亮 + 回 selection.cleared），现有消息没有面板主动清选中的路径。气泡/浮层本身零新增消息（changeTracker 是事实源，页面侧闭环）。

浮层文案（还原此元素 / 关闭）的本地化：content 在 port 连接时读 `chrome.storage.local` 的 `ui-tuner:prefs` 取 locale，解析出标签传给 Annotations 构造器。已知边界：面板开着时切语言，页面浮层文案要下次面板重开（新 port）才更新——可接受。

## i18n

新增约 10 个 key（中英双语，parity 测试保证对齐）：
`annotation.enter/exit/hint`、`doneElement`、`popover.revertElement/close`、`agent.advancedSettings`、`footer.sendToAgent` 等。
删除死 key：`tab.*`（3 个）。

## 测试

- **Annotations**（jsdom）：sync 生成气泡且计数正确；改动清空后气泡消失；点气泡出浮层且内容含改动行；还原此元素后气泡消失；元素离 DOM 后气泡隐藏。
- **Picker**：注释层上的点击不触发选取、不被 suppress。
- **回归**：现有 61 测试全绿；`pnpm test && pnpm typecheck && pnpm lint && pnpm build` 分步验证。
- 面板重构为纯 UI 重排，无新 store 逻辑；真机验收走 README 流程。

## 明确不做（YAGNI）

- LLM 对话框（下一分支）
- 浮层内编辑改动值
- 气泡拖拽/最小化、跨页面持久化
- 面包屑 chips 的替代 UI（⌘↑ 足够）
