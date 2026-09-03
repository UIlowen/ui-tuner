# 页面侧编辑卡 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 注释模式下点击元素在页面侧弹出可拖动/可折叠的编辑卡（属性精调 / 自然语言切换，保存才记录，删除/取消/保存），改动与指令同步回 sidepanel。

**Architecture:** content script 在 shadow root 挂 React 根渲染 `<EditorCard>`，复用解耦后的 rows/StylePanel（改读 `StyleEditContext`）。inspector 新增 `StagingEngine`（stage 只预览、commit 落 ChangeTracker、rollback 还原基线）与 `InstructionStore`（元素→指令）。sidepanel 删除编辑区，协议 `preview.changed` 加 `instructions` 字段并删 `sidepanel.stylePreview`。

**Tech Stack:** TypeScript 5.9 / Vite 8 三构建 / React 19 / zustand 5 / Tailwind 4 / pnpm 11 + Turborepo 2 / vitest + jsdom + RTL。

**Spec:** `docs/superpowers/specs/2026-09-03-page-editor-card-design.md`

## Global Constraints

- TypeScript **5.9** 锁定，勿升级。
- 消息类型一律放 `packages/protocol`；**app 消费 protocol/inspector 的 dist —— 改完这两个包必须各自 `pnpm build`，否则 app typecheck 报 TS2305 无导出**。
- inspector 包保持 **chrome-free**（不 import chrome / sidepanel store）；可 jsdom 单测。
- 验证命令：仓库根 `pnpm build && pnpm test && pnpm typecheck && pnpm lint`；手动验收 = 改 app 源码后**先重建 app dist** 再「刷新扩展 → 刷新页面 → 重开面板」。
- i18n：zh 定义 key、en 全量对齐（parity 测试兜底）；新增 key 两边都加。
- 全程 TDD：先写失败测试、看它失败、再实现。

---

### Task 1: InstructionStore（inspector）

**Files:**
- Create: `packages/inspector/src/changes/InstructionStore.ts`
- Test: `packages/inspector/src/changes/InstructionStore.test.ts`
- Modify: `packages/inspector/src/index.ts`（导出）

**Interfaces:**
- Produces: `class InstructionStore { set(elementId, text): void; get(elementId): string | undefined; delete(elementId): void; clear(): void; all(): Record<string,string> }`。Task 8 content 接线、Task 4 协议字段使用。

- [ ] **Step 1: 写失败测试**

```ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { InstructionStore } from "./InstructionStore";

describe("InstructionStore", () => {
  it("sets and gets an element's instruction", () => {
    const store = new InstructionStore();
    store.set("ut-1", "整体紧凑一点");
    expect(store.get("ut-1")).toBe("整体紧凑一点");
  });

  it("treats an empty string as delete", () => {
    const store = new InstructionStore();
    store.set("ut-1", "x");
    store.set("ut-1", "  ");
    expect(store.get("ut-1")).toBeUndefined();
    expect(store.all()).toEqual({});
  });

  it("delete removes one element; clear removes all", () => {
    const store = new InstructionStore();
    store.set("ut-1", "a");
    store.set("ut-2", "b");
    store.delete("ut-1");
    expect(store.all()).toEqual({ "ut-2": "b" });
    store.clear();
    expect(store.all()).toEqual({});
  });
});
```

- [ ] **Step 2: 跑测试确认失败** `cd packages/inspector && npx vitest run InstructionStore` → 模块不存在报错。

- [ ] **Step 3: 实现**

```ts
/** Element → natural-language instruction, page-side, chrome-free (spec §C). */
export class InstructionStore {
  private readonly instructions = new Map<string, string>();

  /** Empty / whitespace-only text deletes the entry. */
  set(elementId: string, text: string): void {
    const trimmed = text.trim();
    if (trimmed === "") this.instructions.delete(elementId);
    else this.instructions.set(elementId, trimmed);
  }

  get(elementId: string): string | undefined {
    return this.instructions.get(elementId);
  }

  delete(elementId: string): void {
    this.instructions.delete(elementId);
  }

  clear(): void {
    this.instructions.clear();
  }

  all(): Record<string, string> {
    return Object.fromEntries(this.instructions);
  }
}
```

- [ ] **Step 4: 导出** — `packages/inspector/src/index.ts` 加 `export { InstructionStore } from "./changes/InstructionStore";`

- [ ] **Step 5: 跑测试确认绿 + 重建 dist**

Run: `cd packages/inspector && npx vitest run InstructionStore && pnpm build`
Expected: 3 测试通过；dist 重建。

- [ ] **Step 6: Commit**

```bash
git add packages/inspector/src/changes/InstructionStore.ts packages/inspector/src/changes/InstructionStore.test.ts packages/inspector/src/index.ts
git commit -m "feat(inspector): InstructionStore——元素→自然语言指令的页面侧存储"
```

---

### Task 2: StagingEngine（inspector）

**Files:**
- Create: `packages/inspector/src/staging/StagingEngine.ts`
- Test: `packages/inspector/src/staging/StagingEngine.test.ts`
- Modify: `packages/inspector/src/index.ts`（导出）

**Interfaces:**
- Consumes: `PreviewEngine`（`src/preview/PreviewEngine.ts`：`mount()`/`setOverride(elementId, property, value|null)`）、`ChangeTracker`（`src/changes/ChangeTracker.ts`：`record/find/revertProperty`）、`cssValuesEqual`（`src/changes/confirm.ts`）。
- Produces: `class StagingEngine { constructor(preview, changes); get isActive(): boolean; begin(elementId): void; stage(element, property, value): void; commit(element): boolean; rollback(): void; end(): void; staged(): {property,value}[] }`。Task 7/8 使用。

**核心语义（Spec §B）**：stage 只写 PreviewEngine + 内部暂存，绝不碰 ChangeTracker；originalValue 必须在**首次 override 落下前**从 computed style 捕获（commit 时 override 已生效，读不到页面原值）；rollback 从 ChangeTracker 还原「本次会话前」的 override（已保存值或无）。

- [ ] **Step 1: 写失败测试**

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { ChangeTracker } from "../changes/ChangeTracker";
import { PreviewEngine } from "../preview/PreviewEngine";
import { StagingEngine } from "./StagingEngine";

function makeElement(id: string): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("data-ui-tuner-id", id);
  document.body.appendChild(el);
  return el;
}

describe("StagingEngine", () => {
  let preview: PreviewEngine;
  let changes: ChangeTracker;
  let engine: StagingEngine;
  let el: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.getElementById(PreviewEngine.STYLE_ID)?.remove();
    preview = new PreviewEngine();
    changes = new ChangeTracker();
    engine = new StagingEngine(preview, changes);
    el = makeElement("ut-1");
  });

  it("stage previews without recording to the ChangeTracker", () => {
    engine.begin("ut-1");
    engine.stage(el, "height", "52px");
    expect(preview.cssText()).toContain("height: 52px");
    expect(changes.all()).toEqual([]); // 保存才记录
    expect(engine.staged()).toEqual([{ property: "height", value: "52px" }]);
  });

  it("commit records staged edits with the captured original value", () => {
    engine.begin("ut-1");
    engine.stage(el, "height", "52px");
    const recorded = engine.commit(el);
    expect(recorded).toBe(true);
    const change = changes.find("ut-1", "height");
    expect(change?.nextValue).toBe("52px");
    expect(change?.previousValue).toBe(el.style.height === "" ? change?.previousValue : ""); // 原值在 override 前捕获
    expect(engine.isActive).toBe(false); // commit 结束会话
  });

  it("commit drops a staged edit that lands back on the original (no-op)", () => {
    el.style.height = "38px";
    engine.begin("ut-1");
    engine.stage(el, "height", "38px"); // 等于原值
    const recorded = engine.commit(el);
    expect(recorded).toBe(false);
    expect(changes.find("ut-1", "height")).toBeUndefined();
  });

  it("rollback restores the pre-session override and leaves no trace", () => {
    engine.begin("ut-1");
    engine.stage(el, "height", "52px");
    engine.rollback();
    expect(preview.cssText()).not.toContain("height: 52px");
    expect(changes.all()).toEqual([]);
    expect(engine.isActive).toBe(false);
  });

  it("rollback keeps a previously-saved change's override", () => {
    changes.record("ut-1", "height", "40px", "38px"); // 之前已保存
    preview.setOverride("ut-1", "height", "40px");
    engine.begin("ut-1");
    engine.stage(el, "height", "52px");
    engine.rollback();
    expect(preview.cssText()).toContain("height: 40px"); // 还原到已保存值
    expect(changes.find("ut-1", "height")?.nextValue).toBe("40px"); // 已保存改动不动
  });

  it("end rolls back an unsaved session", () => {
    engine.begin("ut-1");
    engine.stage(el, "height", "52px");
    engine.end();
    expect(preview.cssText()).not.toContain("height: 52px");
    expect(changes.all()).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败** → 模块不存在。

- [ ] **Step 3: 实现**

```ts
import { cssValuesEqual } from "../changes/confirm";
import type { ChangeTracker } from "../changes/ChangeTracker";
import type { PreviewEngine } from "../preview/PreviewEngine";

export interface StagedEdit {
  property: string;
  value: string;
}

/**
 * "保存才记录" engine (spec §B). Edits only touch the PreviewEngine (live
 * !important override) plus an in-memory staged map — the ChangeTracker is
 * written solely on commit(). rollback() restores the pre-session override
 * (the previously-saved value, or none), so cancel never leaves a trace.
 */
export class StagingEngine {
  private elementId: string | null = null;
  /** property → staged value, this session. */
  private stagedEdits = new Map<string, string>();
  /** property → page original, captured before the first override lands. */
  private originals = new Map<string, string>();

  constructor(
    private readonly preview: PreviewEngine,
    private readonly changes: ChangeTracker,
  ) {}

  get isActive(): boolean {
    return this.elementId !== null;
  }

  begin(elementId: string): void {
    if (this.elementId === elementId) return;
    this.end(); // roll back any previous unsaved session
    this.elementId = elementId;
    this.stagedEdits.clear();
    this.originals.clear();
  }

  stage(element: Element, property: string, value: string): void {
    if (!this.elementId) return;
    const elementId = this.elementId;
    // Capture the page original BEFORE the first override for a property that
    // has no recorded change yet — once overridden, computed style is unreadable.
    if (!this.stagedEdits.has(property) && !this.changes.find(elementId, property)) {
      this.originals.set(property, getComputedStyle(element).getPropertyValue(property).trim());
    }
    this.preview.mount();
    this.preview.setOverride(elementId, property, value);
    this.stagedEdits.set(property, value);
  }

  /** Record every staged edit; returns true when at least one real change landed. */
  commit(element: Element): boolean {
    if (!this.elementId) return false;
    const elementId = this.elementId;
    let recordedAny = false;
    for (const [property, value] of this.stagedEdits) {
      const existing = this.changes.find(elementId, property);
      const original = existing ? existing.previousValue : (this.originals.get(property) ?? "");
      this.changes.record(elementId, property, value, original);
      const change = this.changes.find(elementId, property);
      if (change && cssValuesEqual(change.nextValue, change.previousValue)) {
        // Landed back on the original — not a change; drop it (color-aware).
        this.changes.revertProperty(elementId, property);
        this.preview.setOverride(elementId, property, null);
      } else {
        recordedAny = true;
      }
    }
    this.reset();
    return recordedAny;
  }

  /** Discard staged edits, restoring the pre-session override for each. */
  rollback(): void {
    if (!this.elementId) return;
    const elementId = this.elementId;
    for (const property of this.stagedEdits.keys()) {
      const recorded = this.changes.find(elementId, property);
      this.preview.setOverride(elementId, property, recorded ? recorded.nextValue : null);
    }
    this.reset();
  }

  /** Close the session; any unsaved staged edits are rolled back. */
  end(): void {
    this.rollback();
  }

  staged(): StagedEdit[] {
    return [...this.stagedEdits.entries()].map(([property, value]) => ({ property, value }));
  }

  private reset(): void {
    this.elementId = null;
    this.stagedEdits.clear();
    this.originals.clear();
  }
}
```

- [ ] **Step 4: 导出** — `packages/inspector/src/index.ts` 加 `export { StagingEngine } from "./staging/StagingEngine";` 和 `export type { StagedEdit } from "./staging/StagingEngine";`

- [ ] **Step 5: 跑测试确认绿 + 重建 dist**

Run: `cd packages/inspector && npx vitest run StagingEngine && pnpm build`
Expected: 6 测试通过。

注意：测试 `commit records ... captured original value` 里 jsdom 的 `getComputedStyle` 对未设置的 `height` 返回 `""`，`previousValue` 即为 `""`；断言改成 `expect(change?.previousValue).toBe("")` 更稳（jsdom 下原值为空串）。若真机原值非空也能捕获——测试只锁定「override 前捕获」这一行为。

- [ ] **Step 6: Commit**

```bash
git add packages/inspector/src/staging/ packages/inspector/src/index.ts
git commit -m "feat(inspector): StagingEngine——保存才记录（stage 预览/commit 落账/rollback 还原基线）"
```

---

### Task 3: Annotations 点气泡改派 onOpenEditor（inspector）

**Files:**
- Modify: `packages/inspector/src/annotations/Annotations.ts`
- Modify: `packages/inspector/src/styles/annotations.ts`（删 `.popover` CSS）
- Test: `packages/inspector/src/annotations/Annotations.test.ts`

**Interfaces:**
- Produces: `AnnotationsCallbacks` 增 `onOpenEditor?(elementId): void`；删 popover 渲染与 `revertElement`/`closeLabel` labels。Task 8 content 传 `onOpenEditor`。

- [ ] **Step 1: 改测试（先失败）** — 删两个 popover 用例（`opens a popover listing...`、`revert button reports...`、`closes the popover when...`），换成：

```ts
it("dispatches onOpenEditor when a bubble is clicked", async () => {
  const onOpenEditor = vi.fn();
  annotations.unmount();
  annotations = new Annotations({ onOpenEditor });
  annotations.mount();
  annotations.sync([makeChange("ut-1")]);
  await nextFrame();
  query<HTMLButtonElement>(".bubble").click();
  expect(onOpenEditor).toHaveBeenCalledWith("ut-1");
});
```

（`beforeEach` 的 `new Annotations(LABELS)` 改为 `new Annotations()`；删 `LABELS` 常量。）

- [ ] **Step 2: 跑测试确认失败** → 旧 popover 选择器 `.popover` 查不到 / 构造签名不符。

- [ ] **Step 3: 实现** — Annotations 改造：
  - `AnnotationsLabels` 接口删除；构造函数改 `constructor(private readonly callbacks: AnnotationsCallbacks = {})`。
  - `AnnotationsCallbacks` 改 `{ onOpenEditor?(elementId: string): void }`。
  - 删 `popover` 字段、`togglePopover`/`closePopover`/`renderPopover` 及 `openFor`；`mount()` 不再建 popover 节点。
  - 气泡 click 监听改 `bubble.addEventListener("click", () => this.callbacks.onOpenEditor?.(elementId))`。
  - `sync()`/`render()`/`unmount()` 删 popover 相关行（`openFor` 判断、render 里 popover 定位）。
  - `styles/annotations.ts` 删 `.popover` 及其子选择器 CSS。

- [ ] **Step 4: 跑测试确认绿 + 重建 dist**

Run: `cd packages/inspector && npx vitest run Annotations && pnpm build`
Expected: 剩余用例 + 新用例全绿。

- [ ] **Step 5: Commit**

```bash
git add packages/inspector/src/annotations/ packages/inspector/src/styles/annotations.ts
git commit -m "feat(inspector): 气泡点击改派 onOpenEditor，废弃只读浮层"
```

---

### Task 4: 协议 preview.changed 加 instructions 字段

**Files:**
- Modify: `packages/protocol/src/index.ts`
- Test: `packages/protocol/src/index.test.ts`

**Interfaces:**
- Produces: `PreviewChangedMessage.payload.instructions?: Record<string,string>`；`createPreviewChanged(changes, instructions?)`。Task 8 content、Task 9 store 使用。

- [ ] **Step 1: 改测试（先失败）** — 在 protocol round-trip 测试加：

```ts
it("preview.changed carries an optional instructions map", () => {
  const message = createPreviewChanged([], { "ut-1": "紧凑一点" });
  expect(message.payload.instructions).toEqual({ "ut-1": "紧凑一点" });
  expect(isPreviewChangedMessage(message)).toBe(true);
  // 缺省可省略
  expect(createPreviewChanged([]).payload.instructions).toBeUndefined();
});
```

- [ ] **Step 2: 跑测试确认失败** → `createPreviewChanged` 只收一个参数 / payload 无 instructions。

- [ ] **Step 3: 实现** — `packages/protocol/src/index.ts`：
  - `PreviewChangedMessage.payload` 加 `instructions?: Record<string, string>;`（注释：elementId → 自然语言指令）。
  - `createPreviewChanged` 改：
    ```ts
    export function createPreviewChanged(
      changes: StyleChange[],
      instructions?: Record<string, string>,
    ): PreviewChangedMessage {
      return { type: "preview.changed", payload: instructions ? { changes, instructions } : { changes } };
    }
    ```

- [ ] **Step 4: 跑测试确认绿 + 重建 dist**

Run: `cd packages/protocol && npx vitest run && pnpm build`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src/index.ts packages/protocol/src/index.test.ts
git commit -m "feat(protocol): preview.changed 携带 instructions（elementId→指令）"
```

---

### Task 5: 抽 StyleEditContext 解耦并搬迁样式控件（app）

**Files:**
- Create: `apps/chrome-extension/src/style-editor/StyleEditContext.tsx`
- Move: `sidepanel/components/rows.tsx` → `style-editor/rows.tsx`
- Move: `sidepanel/components/StylePanel.tsx` → `style-editor/StylePanel.tsx`
- Move: `sidepanel/components/ScrubInput.tsx` → `style-editor/ScrubInput.tsx`
- Move: `sidepanel/components/rows.test.tsx` → `style-editor/rows.test.tsx`
- Move: `sidepanel/components/ScrubInput.test.tsx` → `style-editor/ScrubInput.test.tsx`
- Modify: `apps/chrome-extension/src/sidepanel/App.tsx`（临时 provider，保持编辑区可用）

**Interfaces:**
- Produces: `StyleEditContext` + `useStyleEdit(): { values, updateStyle }`。Task 7 卡片使用。本任务**行为保持**：sidepanel 编辑区暂时仍可用（Task 10 才删）。

- [ ] **Step 1: 建 StyleEditContext**

```tsx
import { createContext, useContext } from "react";

export interface StyleEditApi {
  /** 当前（暂存或已提交）属性值快照。 */
  values: Record<string, string>;
  /** committed=false 仅预览；committed=true 暂存并刷新控件显示。 */
  updateStyle(property: string, value: string, committed: boolean): void;
}

export const StyleEditContext = createContext<StyleEditApi | null>(null);

export function useStyleEdit(): StyleEditApi {
  const api = useContext(StyleEditContext);
  if (!api) throw new Error("useStyleEdit must be used within StyleEditContext.Provider");
  return api;
}
```

- [ ] **Step 2: 用 git mv 搬迁五个文件**（保留历史）：

```bash
cd apps/chrome-extension/src
git mv sidepanel/components/rows.tsx style-editor/rows.tsx
git mv sidepanel/components/StylePanel.tsx style-editor/StylePanel.tsx
git mv sidepanel/components/ScrubInput.tsx style-editor/ScrubInput.tsx
git mv sidepanel/components/rows.test.tsx style-editor/rows.test.tsx
git mv sidepanel/components/ScrubInput.test.tsx style-editor/ScrubInput.test.tsx
```

- [ ] **Step 3: rows.tsx 改读 context** — 删 `import { useSidepanelStore } ...`，改 `import { useStyleEdit } from "./StyleEditContext";`。每个控件里：
  - `const raw = useSidepanelStore((s) => s.styleValues?.[property] ?? "");` → `const { values, updateStyle } = useStyleEdit(); const raw = values[property] ?? "";`
  - 删各行重复的 `const updateStyle = useSidepanelStore((s) => s.updateStyle);`（已并入上面解构）。
  - `useT` 导入路径 `../../i18n/use-t` → `../i18n/use-t`；`./ScrubInput` 路径不变（同目录）。

- [ ] **Step 4: StylePanel.tsx 同样改** — store 引用全换 `useStyleEdit()`（`AlignmentControl`/`SpacingGroup` 内的 `styleValues`→`values`、`updateStyle` 同样从 context 取）；`useT` 路径改 `../i18n/use-t`；`./rows` / `./ScrubInput` 不变。`ScrubInput.tsx` 仅 `useT` 路径改 `../i18n/use-t`，其余不动。

- [ ] **Step 5: 修测试 import 并包 provider** — 两个测试文件里组件渲染处包一层 `<StyleEditContext.Provider value={api}>`，api 用内存对象实现（`values` 用 `useState` 或直接可变对象 + `updateStyle` 记录调用）。旧的「reset store + render」改为「造 api + render」。断言不变（行为保持）。**跑测试确认绿**：

Run: `cd apps/chrome-extension && npx vitest run src/style-editor`
Expected: 全绿（解耦不改行为）。

- [ ] **Step 6: sidepanel 临时接回（保持可用）** — `App.tsx` 在包 `<StylePanel />` 处套 provider，把 store 的 `styleValues`/`updateStyle` 映射成 api：

```tsx
const styleValues = useSidepanelStore((s) => s.styleValues);
const updateStyle = useSidepanelStore((s) => s.updateStyle);
const styleEditApi = { values: styleValues ?? {}, updateStyle };
// ...
<StyleEditContext.Provider value={styleEditApi}>
  <StylePanel />
</StyleEditContext.Provider>
```

`App.tsx` 的 `import { StylePanel } from "./components/StylePanel"` 改 `from "../style-editor/StylePanel"`，并 import provider。

- [ ] **Step 7: 全量验证 + Commit**

Run: `cd apps/chrome-extension && npx vitest run && pnpm typecheck`
Expected: 全绿、类型干净（stylePreview 链路仍走 store，编辑区行为不变）。

```bash
git add apps/chrome-extension/src/style-editor apps/chrome-extension/src/sidepanel
git commit -m "refactor(sidepanel): 抽 StyleEditContext 解耦样式控件并迁至 style-editor/（行为保持）"
```

---

### Task 6: 卡片 CSS 入口 + shadow 注入机制（app/content）

**Files:**
- Create: `apps/chrome-extension/src/content/card/card.css`
- Create: `apps/chrome-extension/src/content/card/inject-styles.ts`
- Modify: `apps/chrome-extension/vite.config.ts`（如需把 card.css 编进 content 构建）

**Interfaces:**
- Produces: `cardStylesText: string`（`import cardStylesText from "./card.css?inline"`）+ `injectCardStyles(shadow: ShadowRoot): void`。Task 7/8 使用。

- [ ] **Step 1: 写 card.css** — 复制 `sidepanel.css` 的 `@import "tailwindcss";` + `@theme inline` 语义 token 块，但把 `:root` 选择器换成 `:host`、`.dark` 换成 `:host(.dark)`（shadow root 内 `:root` 不继承页面）。light 为 `:host` 默认值，dark 为 `:host(.dark)`。

- [ ] **Step 2: inject-styles.ts**

```ts
import cardStylesText from "./card.css?inline";

/** Inject the compiled card stylesheet into the editor card's shadow root. */
export function injectCardStyles(shadow: ShadowRoot): void {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(cardStylesText);
  shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
}
```

- [ ] **Step 3: 确认 content 构建能解析 `?inline` CSS** — Vite 默认支持 `?inline`；跑 `cd apps/chrome-extension && pnpm build`，确认 content bundle 内含 token 文本（`grep -c "color-accent-text\|--color" dist/content.js` 应 >0）。若 Turbo/vite 配置对 CSS 有特殊处理导致未内联，调整：在 content 入口顶部 `import "./card/card.css?inline"` 不行时，改用 `?raw` 导入未编译源码不可行（需 Tailwind 编译）——坚持用 `?inline` 并确保 Tailwind vite 插件作用于该 css。

- [ ] **Step 4: Commit**

```bash
git add apps/chrome-extension/src/content/card/card.css apps/chrome-extension/src/content/card/inject-styles.ts apps/chrome-extension/vite.config.ts
git commit -m "feat(content): 卡片 shadow root 样式注入（token scoped 到 :host）"
```

---

### Task 7: EditorCard 组件（app/content/card）

**Files:**
- Create: `apps/chrome-extension/src/content/card/EditorCard.tsx`
- Test: `apps/chrome-extension/src/content/card/EditorCard.test.tsx`

**Interfaces:**
- Consumes: `StyleEditContext`（Task 5）、`StylePanel`（Task 5）、`useT`。
- Produces: `<EditorCard {...} />` 受控组件（下方 props）。Task 8 mount 使用。

**Props：**
```ts
export interface EditorCardProps {
  tagName: string;
  number: number | null;                 // 气泡序号；null=未保存
  initialValues: Record<string, string>;
  initialInstruction: string;            // 之前已保存的指令（"" 无）
  onStage(property: string, value: string, committed: boolean): void;
  onSave(instruction: string): void;
  onCancel(): void;
  onDelete(): void;
}
```

- [ ] **Step 1: 写失败测试（RTL + jsdom）** — 覆盖：① 默认显示属性精调、切到自然语言显示 textarea；② 无暂存且无指令变更时保存禁用；③ 有指令输入后保存可用并回调 onSave(指令)；④ 点取消回调 onCancel；⑤ 折叠后只显示细条。

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditorCard } from "./EditorCard";

const base = {
  tagName: "button",
  number: null,
  initialValues: { height: "38px" },
  initialInstruction: "",
  onStage: vi.fn(),
  onSave: vi.fn(),
  onCancel: vi.fn(),
  onDelete: vi.fn(),
};

describe("EditorCard", () => {
  it("toggles between properties and natural-language views", () => { /* render(<EditorCard {...base}/>); 默认有属性区；点「自然语言」出现 textarea */ });
  it("disables save until something changes", () => { /* 保存 disabled；输入指令后 enabled */ });
  it("calls onSave with the instruction", () => { /* 输入→点保存→onSave("...") */ });
  it("calls onCancel and onDelete", () => { /* 点取消→onCancel；点删除→onDelete */ });
  it("collapses to a thin strip and expands back", () => { /* 点折叠→属性区消失；再点展开→回来 */ });
});
```

（注意：EditorCard 渲染 StylePanel 需 prefs store 已注水 locale——测试里 `usePrefsStore.setState({ locale: "zh" })` 或 mock `useT`。）

- [ ] **Step 2: 跑测试确认失败** → 组件不存在。

- [ ] **Step 3: 实现 EditorCard.tsx** — 结构：

```tsx
import { useState } from "react";
import { StyleEditContext, type StyleEditApi } from "../../style-editor/StyleEditContext";
import { StylePanel } from "../../style-editor/StylePanel";
import { useT } from "../../i18n/use-t";
import type { EditorCardProps } from "./types";

export function EditorCard(props: EditorCardProps) {
  const t = useT();
  const [mode, setMode] = useState<"properties" | "nl">("properties");
  const [collapsed, setCollapsed] = useState(false);
  const [values, setValues] = useState(props.initialValues);
  const [instruction, setInstruction] = useState(props.initialInstruction);
  const [dirtyProps, setDirtyProps] = useState(false);

  const api: StyleEditApi = {
    values,
    updateStyle: (property, value, committed) => {
      props.onStage(property, value, committed);
      if (committed) {
        setValues((v) => ({ ...v, [property]: value }));
        setDirtyProps(true);
      }
    },
  };

  const instructionDirty = instruction.trim() !== props.initialInstruction.trim();
  const canSave = dirtyProps || instructionDirty;

  // 头部（拖拽把手 + 序号徽标 + 折叠钮）、切换段、两视图、底部三键。
  // 拖拽逻辑在 mount 层（Task 8）通过 transform 实现，这里只管渲染与交互回调。
  // ...
}
```

要点：
- 保存按钮 `disabled={!canSave}`，主按钮样式。
- 删除按钮危险色，点击 `props.onDelete()`。
- 取消点击 `props.onCancel()`。
- 自然语言视图 = `<textarea value={instruction} onChange={e=>setInstruction(e.target.value)} placeholder={t("card.instructionPlaceholder")}>`。
- 保存点击 `props.onSave(instruction)`。

- [ ] **Step 4: 跑测试确认绿 + typecheck**

Run: `cd apps/chrome-extension && npx vitest run src/content/card && pnpm typecheck`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add apps/chrome-extension/src/content/card/EditorCard.tsx apps/chrome-extension/src/content/card/EditorCard.test.tsx apps/chrome-extension/src/content/card/types.ts
git commit -m "feat(content): EditorCard 组件（属性/自然语言切换 + 删除/取消/保存 + 折叠）"
```

---

### Task 8: content 接线（开卡 / 保存 / 取消 / 删除 / 指令同步）

**Files:**
- Create: `apps/chrome-extension/src/content/card/mount-card.tsx`
- Modify: `apps/chrome-extension/src/content/index.ts`

**Interfaces:**
- Consumes: `StagingEngine`/`InstructionStore`/`Annotations.onOpenEditor`（inspector）、`createPreviewChanged(changes, instructions)`（protocol）、`EditorCard`/`injectCardStyles`（Task 6/7）。
- Produces: content 侧 `openEditorCard(element)` / `closeEditorCard(save: boolean)`；reportChanges 带 instructions。

- [ ] **Step 1: mount-card.tsx** — 建 shadow host（id `EDITOR_CARD_ROOT_ID = "ui-tuner-editor-card-root"`，fixed、z-index 2147483646、pointer-events:none 由卡片自身开 auto）、injectCardStyles、`createRoot` 渲染。导出：

```tsx
export const EDITOR_CARD_ROOT_ID = "ui-tuner-editor-card-root";
export interface CardMount {
  show(props: EditorCardProps): void;
  hide(): void;
  readonly isOpen: boolean;
}
export function mountEditorCard(): CardMount { /* host + shadow + root.render；show 更新 props 重渲染，hide root.render(null) 或卸载 */ }
```

拖拽：host 上 pointerdown（头部把手）→ pointermove 改 host `style.transform`，钳制视口。

- [ ] **Step 2: content/index.ts 实例化与接线** — 在 connect listener 内（tracker/picker 建好后）：

```ts
stagingEngine = new StagingEngine(previewEngine, changeTracker);
instructionStore = new InstructionStore();
cardMount = mountEditorCard();
```

- `reportChanges()` 改 `send(createPreviewChanged(changeTracker.all(), instructionStore.all()));`
- Picker `onSelect`：`selectElement(element)` 后 `openEditorCard(element)`。
- Annotations 回调加 `onOpenEditor: (elementId) => { const el = document.querySelector('[data-ui-tuner-id="'+elementId+'"]'); if (el) openEditorCard(el); }`（Annotations 构造改传 `{ onOpenEditor }`，删旧 labels）。
- Picker `passThroughHostIds: [Annotations.ROOT_ID, EDITOR_CARD_ROOT_ID]`。

- [ ] **Step 3: openEditorCard / 回调实现**

```ts
function openEditorCard(element: Element): void {
  const elementId = readUiTunerId(element);
  if (!elementId || !tracker) return;
  stagingEngine.begin(elementId);
  const payload = tracker.select(element); // 已有；样式快照取自 selection
  cardMount.show({
    tagName: element.tagName.toLowerCase(),
    number: /* 该元素气泡序号，无则 null */,
    initialValues: collectWhitelistedStyles(element), // 同 selection.styles 来源
    initialInstruction: instructionStore.get(elementId) ?? "",
    onStage: (property, value, _committed) => stagingEngine.stage(element, property, value),
    onSave: (instruction) => {
      stagingEngine.commit(element);
      instructionStore.set(elementId, instruction);
      reportChanges();
      cardMount.hide();
    },
    onCancel: () => { stagingEngine.rollback(); cardMount.hide(); },
    onDelete: () => { revertElement(elementId); cardMount.hide(); }, // revertElement 内部已 reportChanges
  });
}
```

- `revertElement(elementId)` 内加 `instructionStore.delete(elementId)`；`resetChanges`（reset-all handler）内加 `instructionStore.clear()`。
- Esc / 退出注释 / 断开：`stagingEngine.end()` + `cardMount.hide()`。
- `collectWhitelistedStyles`：复用现有 selection 样式的采集逻辑（`withElementContext` 用的那套 whitelist computed 采集），抽成可复用函数。

- [ ] **Step 4: 气泡序号** — Annotations 目前不对外暴露序号。给 Annotations 加 `numberFor(elementId): number | null`（读内部 `numbers` map），content 传给卡片。inspector 加此方法 + 一条测试，重建 inspector dist。

- [ ] **Step 5: 手动联调准备 + 全量验证**

Run: `cd apps/chrome-extension && npx vitest run && pnpm typecheck && pnpm build`
Expected: 全绿；dist 重建。

- [ ] **Step 6: Commit**

```bash
git add apps/chrome-extension/src/content packages/inspector/src/annotations
git commit -m "feat(content): 接线编辑卡——点元素开卡、保存/取消/删除、指令随 preview.changed 同步"
```

---

### Task 9: sidepanel store——instructions 入 state + 删死动作

**Files:**
- Modify: `apps/chrome-extension/src/state/sidepanel-store.ts`
- Test: `apps/chrome-extension/src/state/sidepanel-store.test.ts`

**Interfaces:**
- Consumes: `PreviewChangedMessage.payload.instructions`（Task 4）。
- Produces: store state `instructions: Record<string,string>`；删 `updateStyle`/`cancelElement`/`clearSelection`。Task 10/11 使用。

- [ ] **Step 1: 改测试（先失败）** — 加：

```ts
it("stores instructions from preview.changed", () => {
  resetStore();
  useSidepanelStore.getState().receive(
    createPreviewChanged([], { "ut-1": "紧凑一点" }),
  );
  expect(useSidepanelStore.getState().instructions).toEqual({ "ut-1": "紧凑一点" });
});
```

并删/改引用 `updateStyle`/`cancelElement`/`clearSelection` 的旧用例（`updateStyle sends preview frames...`、`cancelElement ...`、`clearSelection sends ...`）。

- [ ] **Step 2: 跑测试确认失败** → `instructions` undefined / 旧动作不存在。

- [ ] **Step 3: 实现** — store：
  - state 接口 + 初始值加 `instructions: Record<string,string>`（初始 `{}`；`connect`/`reset`/`reportConnectFailure` 重置 `{}`）。
  - `isPreviewChangedMessage` 分支：`set({ changes: message.payload.changes, instructions: message.payload.instructions ?? {} });`
  - 删 `updateStyle`、`cancelElement`、`clearSelection` 动作及接口声明；删 `createSidepanelStylePreview`、`createSidepanelClearSelection` import（若不再用）。

- [ ] **Step 4: 跑测试确认绿 + typecheck**

Run: `cd apps/chrome-extension && npx vitest run src/state && pnpm typecheck`
（此时 typecheck 可能因 App.tsx 仍引用被删动作报错——Task 10 紧接着删 UI。为保持每个 commit 绿，Task 9 与 Task 10 可合并为一个 commit；若分开，先注释临时引用。）**建议：Task 9、10 合并提交。**

- [ ] **Step 5: Commit**（与 Task 10 一起）

---

### Task 10: sidepanel UI——删编辑区 + ChangesTab 显示指令

**Files:**
- Modify: `apps/chrome-extension/src/sidepanel/App.tsx`
- Modify: `apps/chrome-extension/src/sidepanel/components/ChangesTab.tsx`
- Test: 视情况加 ChangesTab 指令显示用例

**Interfaces:**
- Consumes: store `instructions`（Task 9）。

- [ ] **Step 1: App.tsx 删编辑区** — 删 `{picking && selection && (...)}` 整段（EditorHeader + StylePanel provider + 完成/取消按钮行）、`EditorHeader` 函数、相关 import（StylePanel/StyleEditContext/clearSelection/cancelElement）。`{!picking && ...}` 的条件渲染改为**始终显示** ChangesTab + 折叠 Agent（编辑区没了，两态合一）；保留选取按钮（`picking ? pick.exit : pick.start`）与 ON 无选中提示。

- [ ] **Step 2: ChangesTab 组头显示指令** — 读 `const instructions = useSidepanelStore((s) => s.instructions);`，在元素组（tagName 行下）若 `instructions[group.elementId]` 存在则渲染一行：

```tsx
{instructions[group.elementId] && (
  <p className="mt-1 text-[10px] text-dim">
    {t("changes.instruction")}：{instructions[group.elementId]}
  </p>
)}
```

- [ ] **Step 3: 全量验证**

Run: `cd apps/chrome-extension && npx vitest run && pnpm typecheck && pnpm lint`
Expected: 全绿。

- [ ] **Step 4: Commit（连同 Task 9）**

```bash
git add apps/chrome-extension/src/state apps/chrome-extension/src/sidepanel
git commit -m "feat(sidepanel): 删编辑区（编辑迁至页面卡片），ChangesTab 组头显示元素指令"
```

---

### Task 11: 上下文组装纳入指令（复制 / Agent / Apply）

**Files:**
- Modify: `packages/protocol/src/index.ts`（`AgentContextInput` + `assembleAgentContext`）
- Modify: `apps/chrome-extension/src/sidepanel/format-changeset.ts`（`FormatChangesetInput` + `formatChangesetForCopy`）
- Modify: `apps/chrome-extension/src/sidepanel/App.tsx`（FooterActions copy 传 instructions）、Agent/Apply 调用处
- Test: `packages/protocol/src/index.test.ts`、`apps/chrome-extension/src/sidepanel/format-changeset.test.ts`

**Interfaces:**
- Consumes: store `instructions`。
- Produces: `AgentContextInput.instructions?: Record<string,string>`；`FormatChangesetInput.instructions?: Record<string,string>`。

- [ ] **Step 1: 写/改测试（先失败）** — format-changeset：带 instructions 时元素块多一行 `指令：...`；assembleAgentContext：changes 块下按元素带指令行。

- [ ] **Step 2: 跑测试确认失败。**

- [ ] **Step 3: 实现**
  - `format-changeset.ts`：`FormatChangesetInput` 加 `instructions?: Record<string,string>`；元素块在 `改动（旧值 → 新值）：` 前，若 `instructions[group.elementId]` 存在则 `lines.push(\`指令：${instructions[group.elementId]}\`)`。
  - `assembleAgentContext`：`AgentContextInput` 加 `instructions?: Record<string,string>`；「User preview changes」块里按元素归组后附指令行（或在每元素首条改动前插 `instruction for <elementId>: ...`）。保持与 copy 渲染一致的措辞。
  - `App.tsx` FooterActions `formatChangesetForCopy({...})` 传 `instructions`；AgentTab/ApplySection 调 `assembleAgentContext` 处同样传。

- [ ] **Step 4: 跑测试确认绿 + 重建 protocol dist + 全量验证**

Run: `cd packages/protocol && npx vitest run && pnpm build && cd ../../apps/chrome-extension && npx vitest run && pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src apps/chrome-extension/src/sidepanel
git commit -m "feat(context): 复制/Agent/Apply 上下文纳入元素自然语言指令"
```

---

### Task 12: 删 sidepanel.stylePreview 消息（协议 + content handler）

**Files:**
- Modify: `packages/protocol/src/index.ts`
- Modify: `apps/chrome-extension/src/content/index.ts`
- Test: `packages/protocol/src/index.test.ts`

**Interfaces:**
- 前置：Task 9 已删 store.updateStyle（唯一发送方）、Task 8 已用 StagingEngine 接管编辑。本任务纯删除死代码。

- [ ] **Step 1: 改测试（先失败）** — 删 `createEveryMessage` round-trip 里 stylePreview 用例（若有）；确保其余全绿。

- [ ] **Step 2: 实现** — protocol 删 `SidepanelStylePreviewMessage` 接口、union 成员、`isSidepanelStylePreviewMessage`、`createSidepanelStylePreview`、MESSAGE_TYPES 里 `"sidepanel.stylePreview"`。content/index.ts 删 `isSidepanelStylePreviewMessage` import、`applyStylePreview` 函数、消息分发里 `else if (isSidepanelStylePreviewMessage(...))` 分支。

- [ ] **Step 3: 重建 protocol dist + 全量验证**

Run: `cd packages/protocol && pnpm build && cd ../.. && pnpm build && pnpm test && pnpm typecheck && pnpm lint`
Expected: 全绿。

- [ ] **Step 4: Commit**

```bash
git add packages/protocol/src apps/chrome-extension/src/content
git commit -m "refactor(protocol): 删除 sidepanel.stylePreview（编辑已迁至页面卡片）"
```

---

### Task 13: i18n key 补全

**Files:**
- Modify: `apps/chrome-extension/src/i18n/messages.ts`

- [ ] **Step 1: 加 key（zh + en 同步）**：

```ts
// zh
"card.properties": "属性精调",
"card.naturalLanguage": "自然语言",
"card.save": "保存",
"card.delete": "删除",
"card.collapse": "折叠",
"card.expand": "展开",
"card.dragHandle": "拖动卡片",
"card.unsaved": "未保存",
"card.instructionPlaceholder": "对这个元素的修改要求…",
"changes.instruction": "指令",
// en 对应翻译
```

（`card.cancel` 复用现有 `action.cancel`。）

- [ ] **Step 2: parity 测试自动兜底** — 跑 `cd apps/chrome-extension && npx vitest run src/i18n` 确认 zh/en key 对齐。

- [ ] **Step 3: Commit**

```bash
git add apps/chrome-extension/src/i18n/messages.ts
git commit -m "feat(i18n): 编辑卡与指令相关文案（中英）"
```

---

### Task 14: 控件视觉升级（Figma 密度）

**Files:**
- Modify: `apps/chrome-extension/src/style-editor/rows.tsx`、`StylePanel.tsx`、`ScrubInput.tsx`

- [ ] **Step 1: 对齐 Figma 密度** — 更紧行高/间距；scrub 数值 hover 显示 `ew-resize` 光标与可拖提示；分组标题层级统一（小号大写 + 分隔线）。沿用现有语义 token，不引入新色。

- [ ] **Step 2: 视觉走查 + 全量验证** — 重建 app dist，手动验收卡片视觉。

- [ ] **Step 3: Commit**

```bash
git add apps/chrome-extension/src/style-editor
git commit -m "style(style-editor): 控件视觉对齐 Figma 密度"
```

---

## Self-Review 记录

- **Spec 覆盖**：A(解耦)→Task5；B(StagingEngine)→Task2；C(InstructionStore)→Task1；D(卡片+CSS+穿透)→Task6/7/8；E(Annotations)→Task3/8；F(sidepanel)→Task9/10；G(协议)→Task4/11/12；H(content 接线)→Task8；I(i18n)→Task13；UI 升级→Task14。气泡序号 `numberFor` 在 Task8 Step4 补。
- **依赖顺序**：inspector(1-3) → protocol(4) → app 解耦(5) → 卡片(6-8) → sidepanel(9-10) → 上下文(11) → 清理(12) → i18n(13) → 视觉(14)。每个包改完即重建 dist。
- **Task 9/10 合并提交**：避免中间态 typecheck 断。
- **风险点**：Task6 的 `?inline` Tailwind 注入是最大不确定项，若 shadow 内样式不生效，优先排查 Tailwind 插件是否作用于 card.css；其次 `:host` token 是否被 utility 正确引用。
