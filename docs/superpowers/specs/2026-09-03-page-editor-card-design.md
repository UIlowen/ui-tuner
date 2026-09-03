# 页面侧编辑卡（Page-side Editor Card）设计

> 2026-09-03 · 状态：已确认（用户「可以」）
> 前置：`docs/superpowers/specs/2026-09-02-annotation-mode-design.md`（注释模式，已落地）
> 本设计取代其中「点气泡弹只读浮层」的部分，并把样式编辑从 sidepanel 迁到页面侧。

## 目标

注释模式下点击元素，**直接在页面侧弹出可拖动、可折叠的编辑卡**：既支持属性精调（现有全集控件），又支持自然语言指令（两者切换，不堆叠）。编辑实时预览，**保存才记录**成 Change（蓝色序号气泡留痕），取消回滚不留痕。改动与指令同步回 sidepanel，纳入复制 / 发 Agent / Apply 上下文。

## 锁定的决策（来自 brainstorming）

| 决策点 | 结论 |
|---|---|
| 架构 | **方案 B**：content 在 shadow root 挂 React 根，复用现有 rows/StylePanel；Tailwind 编译产物注入 shadow root |
| sidepanel 编辑区 | **完全移除**（EditorHeader + StylePanel + 完成/取消按钮全删）；页面卡片是唯一编辑入口 |
| 属性集 | **现有全集**（Layout/Size/Spacing/Typography/Fill/Border/Effects） |
| 属性 / 自然语言 | **切换逻辑**（分段二选一），不堆叠 |
| 记录语义 | **保存才记录**：编辑实时预览、保存才提交 ChangeTracker、取消回滚 |
| 同属性多次改 | 覆盖逻辑（沿用 ChangeTracker.record 的按 elementId+property 覆盖） |
| 气泡时机 | **保存后才出现**；序号按保存先后 |
| 气泡点击 | 重开该元素卡片；旧只读浮层废弃 |
| 卡片主题 | 亮/暗**跟随面板**（复用语义 token，`:host(.dark)`） |
| 盒模型间距图 | 可选增强，单列任务，v1 默认不做 |
| 不做 | 麦克风（codex 语音输入） |

## 架构总览

```
sidepanel (React)                content script (页面上下文)                inspector 包 (chrome-free)
─────────────────                ─────────────────────────────              ─────────────────────────
ChangesTab  ◄── preview.changed ── reportChanges() ──┐
 (含 instructions)                                   │
选取/退出按钮 ── sidepanel.picking ─► Picker (持续)    │
                                                     │
                          点击元素 ─► EditorCard (React, shadow root)
                                       │  StyleEditContext
                                       ▼
                                  StagingEngine ──► PreviewEngine (实时 !important override)
                                       │ 保存        ChangeTracker  (记录 StyleChange)
                                       ▼            InstructionStore (元素→指令)
                                  reportChanges() ─► preview.changed ─► sidepanel + Annotations.sync
```

**关键认知**：现在编辑是「panel store 发 `sidepanel.stylePreview` → content `applyStylePreview` → ChangeTracker/PreviewEngine」。迁移后编辑全在 content 上下文，卡片**直接调用**页面侧的 staging/preview/record，无需协议往返。`applyStylePreview` 的逻辑（首次捕获 originalValue → record → 颜色感知 no-op 检测）**迁移进 StagingEngine**，`sidepanel.stylePreview` 消息随之删除。

## 模块设计

### A. 共享样式控件解耦与搬迁（app）

**问题**：`rows.tsx` / `StylePanel.tsx` 每个控件都 `useSidepanelStore((s) => s.styleValues?.[prop])` + `useSidepanelStore((s) => s.updateStyle)`，标签靠 `useT()`。要在页面卡片复用，必须解耦 sidepanel store。

**做法**：
- 新建 `apps/chrome-extension/src/style-editor/StyleEditContext.tsx`：
  ```ts
  export interface StyleEditApi {
    /** 当前（暂存或已提交）属性值快照。 */
    values: Record<string, string>;
    /** committed=false 仅预览；committed=true 暂存（卡片语义下≠记录，见 StagingEngine）。 */
    updateStyle(property: string, value: string, committed: boolean): void;
  }
  export const StyleEditContext = createContext<StyleEditApi | null>(null);
  export function useStyleEdit(): StyleEditApi; // 从 context 取，缺省抛错
  ```
- `rows.tsx` 的 `useSidepanelStore(...)` 全部改为 `useStyleEdit()`：`raw = values[property] ?? ""`、`updateStyle(...)`。
- `StylePanel.tsx` 同样改读 context（`AlignmentControl`/`SpacingGroup`/`AxisScrub` 内的 store 引用一并改）。
- **搬迁**：`rows.tsx` / `StylePanel.tsx` / `ScrubInput.tsx`（及其测试 `rows.test.tsx` / `ScrubInput.test.tsx`）从 `src/sidepanel/components/` 移到 `src/style-editor/`。`ScrubInput` 本就只接 props 无 store 依赖，原样搬。
- sidepanel 不再使用这些组件（编辑区移除），故无需在 panel 侧提供 context；唯一提供者是页面卡片。
- `useT()` 保留（见「i18n」）。

### B. StagingEngine（inspector，新）`packages/inspector/src/staging/StagingEngine.ts`

页面侧「保存才记录」引擎，chrome-free，jsdom 可测。组合 PreviewEngine（实时预览）与 ChangeTracker（保存时记录）。

```ts
export interface StagedEdit { property: string; value: string; }

export class StagingEngine {
  constructor(
    private readonly preview: PreviewEngine,
    private readonly changes: ChangeTracker,
  ) {}

  /** 开卡：绑定元素，快照「编辑前」基线（该元素当前 override 值）。 */
  begin(elementId: string): void;
  /** 编辑：实时预览 + 暂存。committed=false 只预览不动 staged 快照外的状态。 */
  stage(element: Element, property: string, value: string): void;
  /** 保存：把 staged 逐个落 ChangeTracker（首次捕获 originalValue + 颜色感知 no-op 检测），返回是否有有效改动。 */
  commit(element: Element): boolean;
  /** 取消：staged 属性的 override 还原到基线，丢弃暂存，不留痕。 */
  rollback(): void;
  /** 当前暂存（卡片用来显示 dirty 状态 / 决定保存按钮可用性）。 */
  staged(): StagedEdit[];
  /** 结束会话（关卡）。未保存的暂存一律 rollback。 */
  end(): void;
}
```

语义要点：
- `stage` 只写 `preview.setOverride`（实时预览）+ 更新内部 `staged: Map<property, value>`，**绝不碰 ChangeTracker**。
- `commit` 对每条 staged 走现在 `applyStylePreview` 的记录路径：首次 touch 用 `getComputedStyle(element)` 捕获 `originalValue` → `changes.record(elementId, property, value, originalValue)` → 若 `cssValuesEqual(next, previous)` 则 `revertProperty` + 清 override（no-op）。commit 后调用方 `reportChanges()`。
- `rollback` 把 staged 属性 override 还原为 `begin` 时快照的基线值（基线无该属性则 `setOverride(null)`），清空 staged。
- `begin` 的基线 = 该元素**已记录改动对应的当前 override**，保证取消只回滚「本次会话」，不动之前已保存的。
- `end` 兜底：未 commit 的 staged 一律 rollback（防泄漏 override）。

### C. InstructionStore（inspector，新）`packages/inspector/src/changes/InstructionStore.ts`

元素 → 自然语言指令的页面侧持久存储，与 ChangeTracker 并列，chrome-free。

```ts
export class InstructionStore {
  set(elementId: string, text: string): void;   // 空串 = 删除
  get(elementId: string): string | undefined;
  delete(elementId: string): void;               // 还原此元素时一并清
  clear(): void;                                 // 全部重置时一并清
  all(): Record<string, string>;                 // 进 preview.changed payload
}
```

指令随卡片会话**暂存**（卡片本地 state），保存时写 InstructionStore，取消还原为已保存值。

### D. EditorCard + 挂载（app/content，新）

- `apps/chrome-extension/src/content/card/EditorCard.tsx`：卡片 React 组件。
  - **头部**：`<tag>` + 序号徽标（该元素的气泡序号，无则显示「未保存」）+ 拖拽把手 + 折叠钮。
  - **切换**：`属性精调` / `自然语言` 分段控件（`aria-pressed` 二选一）。
  - **属性精调视图**：`<StyleEditContext.Provider value={cardApi}><StylePanel /></StyleEditContext.Provider>`。
  - **自然语言视图**：多行 `<textarea>`，值为暂存指令。
  - **底部**：`删除`（危险色，=还原此元素）｜`取消`｜`保存`（主按钮，无暂存改动且无指令变更时禁用）。
- `apps/chrome-extension/src/content/card/mount-card.tsx`：建 shadow host（`ui-tuner-editor-card-root`，fixed、z-index 最高）、注入编译 CSS、`createRoot(shadow).render(<EditorCard …/>)`，并把 StagingEngine / InstructionStore / 拖拽 / 主题注水的 prefs 接进 context。
- **Picker 事件穿透（关键）**：注释模式会抑制页面交互。Picker 的 `passThroughHostIds` 必须同时包含 `Annotations.ROOT_ID` 和卡片 root（`ui-tuner-editor-card-root`），否则点卡片控件会被 pick 的 mousedown preventDefault / click stopImmediatePropagation 吞掉。
- **卡片 CSS 入口（关键）**：新建 `src/content/card/card.css`，`@import "tailwindcss"` + 与 sidepanel 相同的语义 token，但 token 定义在 `:host` / `:host(.dark)`（shadow root 内 `:root` 不继承页面）。Vite `import cssText from "./card.css?inline"` 取编译产物，挂 `adoptedStyleSheets` 或 `<style>` 注入 shadow root；dark class 由注水的 prefs 决定加在卡片根。
- **拖拽**：头部 pointerdown 起拖，transform 平移整卡，边界钳制在视口内。
- **折叠**：收成一条细条（只留元素名 + 展开钮），再点展开。

### E. Annotations 改造（inspector）

- 气泡保留「保存后出现 + 序号」，**点击行为改**：不再弹只读浮层，而是回调 `onOpenEditor(elementId)`（content 转而打开该元素的 EditorCard）。
- **删除只读 popover 渲染**（`renderPopover`/`togglePopover`/`closePopover` 及 `.popover` CSS），改派 `onOpenEditor`。
- 序号时机不变（首次保存 → 出现并编号；全清 → 重排从 1）。
- `AnnotationsCallbacks` 增加 `onOpenEditor?(elementId: string): void`；移除 popover 相关 labels（revertElement/closeLabel 不再需要，「还原」移到卡片「删除」）。

### F. sidepanel 改动（app）

- **删**：`App.tsx` 注释 ON+选中 的整个编辑 section（EditorHeader + StylePanel + 完成/取消按钮行）；`EditorHeader` 组件；`cancelElement` / `clearSelection` 动作（编辑区移除后无调用方）。
- **留**：`选取元素/退出注释` 按钮、ChangesTab、吸底 FooterActions、折叠 Agent。
- store：
  - `preview.changed` handler 增读 `payload.instructions` → 新 state `instructions: Record<string, string>`。
  - 移除 `updateStyle`（rows 不再走 store）、`cancelElement`、`clearSelection`。
  - ChangesTab 元素组头部显示该元素的指令（若有）。
- `formatChangesetForCopy` + Agent/Apply 上下文组装（protocol §26）：把 instructions 纳入。

### G. 协议改动（packages/protocol）

- `PreviewChangedMessage` payload 加可选 `instructions?: Record<string, string>`（elementId → 指令）。`createPreviewChanged` / guard 同步。
- **删** `SidepanelStylePreviewMessage`（type/creator/guard/union/MESSAGE_TYPES）——编辑区移除后无发送方。
- `sidepanel.clearSelection`：编辑区移除后面板不再发送；**保留**（卡片在 content 侧自管选中，此消息暂留作兼容，标记候选清理，不在本次删）。
- §26 上下文组装（`formatChangesetForCopy` / agent context）：签名加 instructions，元素块里带上指令行。

### H. content 接线（app/content/index.ts）

- 实例化 `StagingEngine(previewEngine, changeTracker)`、`InstructionStore`。
- `reportChanges()`：`createPreviewChanged` 带上 `instructions: instructionStore.all()`。
- Picker `onSelect`：除 `selectElement` 外，**打开该元素的 EditorCard**（StagingEngine.begin + mount/show）。
- Annotations 回调 `onOpenEditor(elementId)` → 打开对应卡片。
- 卡片回调：`onSave` → StagingEngine.commit + 写 InstructionStore + reportChanges；`onCancel` → StagingEngine.rollback；`onDelete` → revertElement 逻辑 + InstructionStore.delete + reportChanges + 关卡。
- `revertElement` / `resetChanges`：同步清 InstructionStore 对应条目。
- 关卡（Esc / 退出注释 / 选别的元素）→ StagingEngine.end() + 卸载卡片。

### I. i18n

新增 key（zh 定义、en 对齐，parity 测试兜底）：
- `card.properties`（属性精调）/ `card.naturalLanguage`（自然语言）
- `card.save`（保存）/ `card.cancel`（取消，可复用 `action.cancel`）/ `card.delete`（删除）
- `card.collapse`（折叠）/ `card.expand`（展开）/ `card.dragHandle`（拖动）
- `card.unsaved`（未保存）/ `card.instructionPlaceholder`（对该元素的修改要求…）
- sidepanel 改动组指令前缀 `changes.instruction`（指令）
- 复用：`action.cancel`、`group.*`、`style.*`、`color.rowTitle`、`scrub.hint`（rows 原有）。

## 数据流

**编辑会话生命周期**
```
点击元素 → selectElement + StagingEngine.begin(id) + 开卡(快照基线)
  拖控件 → StyleEditContext.updateStyle → StagingEngine.stage → PreviewEngine 实时预览（不动 ChangeTracker，无气泡）
  切到自然语言 → 输入暂存于卡片 state
保存 → StagingEngine.commit（落 ChangeTracker）+ InstructionStore.set + reportChanges
       → 气泡出现/更新序号 + sidepanel 改动列表与指令更新
取消 → StagingEngine.rollback（还原基线）+ 指令还原已存值 → 不留痕，关卡
删除 → revertElement + InstructionStore.delete + reportChanges → 气泡消失，关卡
```

**指令同步**：`InstructionStore.all()` 随每次 `reportChanges()` 进 `preview.changed.instructions` → sidepanel store.instructions → ChangesTab 组头 / 复制 / Agent / Apply。

## UI / 视觉方向

- 复用 rows，但**重做视觉密度**对齐 Figma：更紧行高与间距、scrub 数值 hover 显示左右拖拽光标（`ew-resize`）与可拖提示、分组标题层级（小号大写 + 分隔线）统一。
- 卡片本身：圆角 10、细边框、柔和投影、固定调色（亮/暗 token），宽 ~280px，属性区可滚动（max-height），头/底固定。
- 盒模型间距图（Webflow 式）：**可选增强**，单列任务，默认不在 v1。

## 边界情况

- 未保存就关卡通选别的元素/Esc → `StagingEngine.end()` 兜底 rollback。
- 元素被 HMR 重建 / 离 DOM → 卡片关闭（沿用 SelectionTracker keepId / §22 重定位）。
- 保存时全部 staged 都是 no-op（值等于原值）→ 不产生 Change、不出气泡、不加序号。
- 指令为空 + 无属性改动 → 保存按钮禁用。
- 「删除」对只有指令、无属性改动的元素同样有效（清指令）。
- reconnect：ChangeTracker/InstructionStore 均在内存（§37），重连后 reportChanges 重同步。

## 测试策略

- **inspector（jsdom + vitest）**
  - `StagingEngine.test.ts`：stage 只预览不记录；commit 落 ChangeTracker 且捕获 originalValue；commit no-op 检测（含颜色等价）；rollback 还原基线；end 兜底 rollback；基线不含已保存改动。
  - `InstructionStore.test.ts`：set/get/delete/clear/all；空串即删。
  - `Annotations.test.ts`：点气泡派 `onOpenEditor`（替换原 popover 用例）；序号时机不变。
- **app（jsdom + RTL + vitest）**
  - rows/StylePanel 解耦 context 后行为不变（搬迁的 rows.test.tsx / ScrubInput.test.tsx 继续绿）。
  - store：`preview.changed` 带 instructions 入 state；`updateStyle`/`cancelElement`/`clearSelection` 移除后相关旧用例删除。
  - EditorCard：切换属性/自然语言、保存禁用逻辑、折叠/展开。
- **protocol**：`createEveryMessage` guard round-trip 覆盖 preview.changed 新字段 + 删除 stylePreview。
- **E2E**：沿用 `/tmp/ui-tuner-e2e` Playwright 模式，验收「点元素开卡→改属性→保存→气泡序号→取消无痕→指令进复制」。

## 不做（Out of scope）

- 麦克风 / 语音输入。
- 盒模型间距图（可选增强，默认 v1 不做）。
- `sidepanel.clearSelection` 消息的物理删除（仅标记候选清理）。
- LLM 对话框（GLM/Kimi/MiniMax）——独立分支，与本设计无关。
