# 注释模式重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 sidepanel 改成「注释模式」直达体验：持续选取、改动即时在页面元素上留气泡、点气泡弹改动浮层、退出模式后按元素分组的改动列表 + 吸底复制/发给 Agent。

**Architecture:** 页面侧新增 Annotations 子系统（shadow DOM，与 Overlay 平行，changeTracker 为事实源）；Picker 放行注释层点击；协议新增一条 `sidepanel.clearSelection`；面板去 tab 改两态（picking ON = 编辑态 / OFF = 改动列表态）。

**Tech Stack:** TypeScript 5.9 / React 19 / zustand 5 / Tailwind 4 / vitest + jsdom。

**Spec:** `docs/superpowers/specs/2026-09-02-annotation-mode-design.md`

## Global Constraints

- TypeScript 锁 5.9，勿升级。
- 消息类型一律放 `packages/protocol`（计划规则 6）；inspector 包保持 chrome-free。
- 页面侧 overlay 类组件样式全部走 shadow DOM 内联 CSS（page CSS 不可达），调色板固定（沿用 Overlay 先例，不跟随面板主题）。
- TDD：每个行为先写失败测试，看到失败再实现。
- 验证命令统一：`pnpm test && pnpm typecheck && pnpm lint && pnpm build`（在 `apps/chrome-extension` 或对应包目录）。
- 分支：`feat/ui-ux-polish`（已基于 `feat/i18n-theme-toggle`，含语义 token 与 i18n 基建）。

---

### Task 1: 协议新增 `sidepanel.clearSelection` 消息

**Files:**
- Modify: `packages/protocol/src/index.ts`（interface 区 ~L202、union ~L501、MESSAGE_TYPES ~L524、guard 区 ~L624、creator 区 ~L750）
- Test: `packages/protocol/src/index.test.ts`

**Interfaces:**
- Produces: `SidepanelClearSelectionMessage`、`createSidepanelClearSelection()`、`isSidepanelClearSelectionMessage(value)` —— Task 4（store）与 Task 5（content）消费。

- [ ] **Step 1: 写失败测试**

在 `packages/protocol/src/index.test.ts` 的 `describe("creators")` 块中追加：

```ts
it("creates a sidepanel.clearSelection message", () => {
  const message = createSidepanelClearSelection();
  expect(message.type).toBe("sidepanel.clearSelection");
  expect(isSidepanelClearSelectionMessage(message)).toBe(true);
});
```

顶部 import 追加 `createSidepanelClearSelection, isSidepanelClearSelectionMessage`。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd packages/protocol && npx vitest run src/index.test.ts`
Expected: FAIL — `createSidepanelClearSelection is not a function`（或 import 报错）

- [ ] **Step 3: 最小实现**

在 `packages/protocol/src/index.ts` 加 4 处（严格仿照 `SidepanelResetChangesMessage` 的既有写法）：

```ts
/** Side Panel → Content. Clear the current selection (annotation mode "done with this element"); picking stays on. */
export interface SidepanelClearSelectionMessage {
  type: "sidepanel.clearSelection";
  payload: Record<string, never>;
}
```

- `UiTunerMessage` union 加 `| SidepanelClearSelectionMessage`
- `MESSAGE_TYPES` 数组加 `"sidepanel.clearSelection"`
- guard 与 creator：

```ts
export function isSidepanelClearSelectionMessage(
  value: UiTunerMessage,
): value is SidepanelClearSelectionMessage {
  return value.type === "sidepanel.clearSelection";
}

export function createSidepanelClearSelection(): SidepanelClearSelectionMessage {
  return { type: "sidepanel.clearSelection", payload: {} };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd packages/protocol && npx vitest run && pnpm typecheck`
Expected: PASS，typecheck clean

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src/index.ts packages/protocol/src/index.test.ts
git commit -m "feat(protocol): sidepanel.clearSelection 消息（注释模式「完成此元素」）"
```

---

### Task 2: Inspector 新增 Annotations 气泡/浮层子系统

**Files:**
- Create: `packages/inspector/src/styles/annotations.ts`
- Create: `packages/inspector/src/annotations/Annotations.ts`
- Test: `packages/inspector/src/annotations/Annotations.test.ts`
- Modify: `packages/inspector/src/index.ts`（加 export）

**Interfaces:**
- Consumes: `StyleChange`（@ui-tuner/protocol）、`UI_TUNER_ID_ATTR`（`../dom/identity`，值 `data-ui-tuner-id`）
- Produces: `Annotations` 类 —— Task 5（content）消费：
  - `Annotations.ROOT_ID = "ui-tuner-annotations-root"`
  - `new Annotations(labels: { revertElement: string; closeLabel: string }, callbacks?: { onRevertElement?(elementId: string): void })`
  - `mount() / unmount() / sync(changes: StyleChange[]) / isMounted / root`

- [ ] **Step 1: 写失败测试**

Create `packages/inspector/src/annotations/Annotations.test.ts`：

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StyleChange } from "@ui-tuner/protocol";
import { Annotations } from "./Annotations";

const LABELS = { revertElement: "还原此元素", closeLabel: "关闭" };

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function mockRect(element: Element, rect: { x: number; y: number; width: number; height: number }) {
  element.getBoundingClientRect = () =>
    ({
      ...rect,
      top: rect.y,
      left: rect.x,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
      toJSON: () => ({}),
    }) as DOMRect;
}

function makeChange(elementId: string, property = "height", nextValue = "52px"): StyleChange {
  return {
    id: `c-${elementId}-${property}`,
    elementId,
    property,
    previousValue: "38px",
    nextValue,
    source: "manual",
    createdAt: Date.now(),
  };
}

describe("Annotations", () => {
  let annotations: Annotations;
  let target: HTMLButtonElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    target = document.createElement("button");
    target.setAttribute("data-ui-tuner-id", "ut-1");
    document.body.appendChild(target);
    mockRect(target, { x: 10, y: 100, width: 120, height: 40 });
    annotations = new Annotations(LABELS);
    annotations.mount();
  });

  afterEach(() => {
    annotations.unmount();
  });

  function query<T extends HTMLElement>(selector: string): T {
    const el = annotations.root?.shadowRoot?.querySelector<T>(selector);
    expect(el).toBeTruthy();
    return el!;
  }

  it("mounts an isolated host with a shadow root", () => {
    const host = document.getElementById("ui-tuner-annotations-root");
    expect(host).toBe(annotations.root);
    expect(host?.shadowRoot).not.toBeNull();
  });

  it("shows a bubble with the change count for each changed element", async () => {
    annotations.sync([makeChange("ut-1"), makeChange("ut-1", "width", "200px")]);
    await nextFrame();
    const bubble = query<HTMLButtonElement>(".bubble");
    expect(bubble.style.display).toBe("block");
    expect(bubble.textContent).toBe("2");
  });

  it("removes the bubble when the element's changes are gone", async () => {
    annotations.sync([makeChange("ut-1")]);
    await nextFrame();
    annotations.sync([]);
    await nextFrame();
    expect(annotations.root?.shadowRoot?.querySelector(".bubble")).toBeNull();
  });

  it("hides the bubble when the element leaves the DOM", async () => {
    annotations.sync([makeChange("ut-1")]);
    await nextFrame();
    target.remove();
    await nextFrame();
    expect(query<HTMLButtonElement>(".bubble").style.display).toBe("none");
  });

  it("opens a popover listing the element's changes on bubble click", async () => {
    annotations.sync([makeChange("ut-1")]);
    await nextFrame();
    query<HTMLButtonElement>(".bubble").click();
    const popover = query(".popover");
    expect(popover.style.display).toBe("block");
    expect(popover.textContent).toContain("height: 38px → 52px");
  });

  it("revert button reports the element id", async () => {
    const onRevertElement = vi.fn();
    annotations.unmount();
    annotations = new Annotations(LABELS, { onRevertElement });
    annotations.mount();
    annotations.sync([makeChange("ut-1")]);
    await nextFrame();
    query<HTMLButtonElement>(".bubble").click();
    query<HTMLButtonElement>(".popover .revert").click();
    expect(onRevertElement).toHaveBeenCalledWith("ut-1");
  });

  it("closes the popover when the element's changes are reverted away", async () => {
    annotations.sync([makeChange("ut-1")]);
    await nextFrame();
    query<HTMLButtonElement>(".bubble").click();
    annotations.sync([]);
    expect(query(".popover").style.display).toBe("none");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd packages/inspector && npx vitest run src/annotations/Annotations.test.ts`
Expected: FAIL — `Cannot find module './Annotations'`

- [ ] **Step 3: 实现**

Create `packages/inspector/src/styles/annotations.ts`：

```ts
/**
 * Annotation layer styles. Applied inside a Shadow Root so page CSS cannot
 * reach the annotations — the only style surface is this file. Fixed dark
 * palette (same precedent as overlay.ts), independent of the panel theme.
 */

/** Host node: fixed, zero-size; children opt back into pointer events. */
export const ANNOTATIONS_HOST_STYLE =
  "position: fixed; top: 0; left: 0; width: 0; height: 0; " +
  "pointer-events: none; z-index: 2147483646;";

export const ANNOTATIONS_SHADOW_CSS = `
  .bubble {
    position: fixed;
    transform: translate(-50%, -50%);
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border: none;
    border-radius: 9px;
    background: #8b5cf6;
    color: #fff;
    font: 600 11px/18px ui-sans-serif, system-ui, sans-serif;
    text-align: center;
    cursor: pointer;
    pointer-events: auto;
    display: none;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  }
  .popover {
    position: fixed;
    pointer-events: auto;
    display: none;
    min-width: 180px;
    max-width: 260px;
    background: #18181b;
    color: #e4e4e7;
    border: 1px solid #3f3f46;
    border-radius: 8px;
    padding: 8px 10px;
    font: 11px/1.6 ui-sans-serif, system-ui, sans-serif;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }
  .popover ul {
    margin: 0 0 6px;
    padding: 0;
    list-style: none;
  }
  .popover li {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .popover .revert {
    border: 1px solid #3f3f46;
    border-radius: 4px;
    background: transparent;
    color: #e4e4e7;
    font-size: 10px;
    padding: 2px 8px;
    cursor: pointer;
  }
  .popover .revert:hover {
    background: #27272a;
  }
  .popover .close {
    position: absolute;
    top: 4px;
    right: 6px;
    border: none;
    background: transparent;
    color: #71717a;
    font-size: 10px;
    cursor: pointer;
    padding: 0 2px;
  }
  .popover .close:hover {
    color: #e4e4e7;
  }
`;
```

Create `packages/inspector/src/annotations/Annotations.ts`：

```ts
import type { StyleChange } from "@ui-tuner/protocol";
import { UI_TUNER_ID_ATTR } from "../dom/identity";
import { ANNOTATIONS_HOST_STYLE, ANNOTATIONS_SHADOW_CSS } from "../styles/annotations";

export interface AnnotationsLabels {
  revertElement: string;
  closeLabel: string;
}

export interface AnnotationsCallbacks {
  onRevertElement?(elementId: string): void;
}

/**
 * Change-annotation layer: one bubble per element with recorded changes,
 * pinned to the element's top-right corner; clicking a bubble toggles a
 * popover listing that element's changes. Bubbles re-measure every animation
 * frame while any is visible (same contract as Overlay), so scrolling and
 * layout shifts stay correct. Elements with changes keep their
 * `data-ui-tuner-id` (SelectionTracker keepId), which is how bubbles relocate
 * their element after re-renders.
 */
export class Annotations {
  static readonly ROOT_ID = "ui-tuner-annotations-root";

  private host: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private popover: HTMLDivElement | null = null;
  private bubbles = new Map<string, HTMLButtonElement>();
  private openFor: string | null = null;
  private changes: StyleChange[] = [];
  private rafId: number | null = null;

  constructor(
    private readonly labels: AnnotationsLabels,
    private readonly callbacks: AnnotationsCallbacks = {},
  ) {}

  /** Test/DI access to the mounted host. */
  get root(): HTMLDivElement | null {
    return this.host;
  }

  get isMounted(): boolean {
    return this.host?.isConnected ?? false;
  }

  mount(): void {
    if (this.host?.isConnected) return;

    const host = document.createElement("div");
    host.id = Annotations.ROOT_ID;
    host.style.cssText = ANNOTATIONS_HOST_STYLE;

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = ANNOTATIONS_SHADOW_CSS;
    shadow.appendChild(style);

    const popover = document.createElement("div");
    popover.className = "popover";
    shadow.appendChild(popover);

    document.documentElement.appendChild(host);
    this.host = host;
    this.shadow = shadow;
    this.popover = popover;
  }

  unmount(): void {
    this.stopLoop();
    this.bubbles.clear();
    this.openFor = null;
    this.changes = [];
    this.host?.remove();
    this.host = null;
    this.shadow = null;
    this.popover = null;
  }

  /** Re-render from the latest change records (call on every mutation). */
  sync(changes: StyleChange[]): void {
    this.changes = changes;
    if (!this.shadow) return;
    const elementIds = new Set(changes.map((change) => change.elementId));

    // Drop bubbles whose element no longer has changes.
    for (const [elementId, bubble] of this.bubbles) {
      if (!elementIds.has(elementId)) {
        bubble.remove();
        this.bubbles.delete(elementId);
      }
    }
    // Create bubbles for newly-changed elements.
    for (const elementId of elementIds) {
      if (!this.bubbles.has(elementId)) {
        const bubble = document.createElement("button");
        bubble.type = "button";
        bubble.className = "bubble";
        bubble.addEventListener("click", () => this.togglePopover(elementId));
        this.shadow.appendChild(bubble);
        this.bubbles.set(elementId, bubble);
      }
    }
    if (this.openFor && !elementIds.has(this.openFor)) this.closePopover();
    this.scheduleRender();
  }

  private togglePopover(elementId: string): void {
    if (this.openFor === elementId) {
      this.closePopover();
      return;
    }
    this.openFor = elementId;
    this.renderPopover();
    this.scheduleRender();
  }

  private closePopover(): void {
    this.openFor = null;
    if (this.popover) this.popover.style.display = "none";
  }

  private renderPopover(): void {
    const popover = this.popover;
    if (!popover || !this.openFor) return;
    const elementId = this.openFor;
    popover.textContent = "";

    const list = document.createElement("ul");
    for (const change of this.changes.filter((c) => c.elementId === elementId)) {
      const row = document.createElement("li");
      row.textContent = `${change.property}: ${change.previousValue || "—"} → ${change.nextValue}`;
      list.appendChild(row);
    }
    popover.appendChild(list);

    const revert = document.createElement("button");
    revert.type = "button";
    revert.className = "revert";
    revert.textContent = this.labels.revertElement;
    revert.addEventListener("click", () => this.callbacks.onRevertElement?.(elementId));
    popover.appendChild(revert);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "close";
    close.setAttribute("aria-label", this.labels.closeLabel);
    close.textContent = "✕";
    close.addEventListener("click", () => this.closePopover());
    popover.appendChild(close);

    popover.style.display = "block";
  }

  private scheduleRender(): void {
    if (this.rafId !== null || !this.host) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.render();
    });
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private render(): void {
    if (!this.host) return;
    let anyVisible = false;

    for (const [elementId, bubble] of this.bubbles) {
      const element = document.querySelector(`[${UI_TUNER_ID_ATTR}="${elementId}"]`);
      // Never paint a bubble for a detached/zero-size element (plan §22 spirit).
      const rect = element?.isConnected ? element.getBoundingClientRect() : null;
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        bubble.style.display = "none";
        if (this.openFor === elementId) this.closePopover();
        continue;
      }
      anyVisible = true;
      bubble.textContent = String(
        this.changes.filter((c) => c.elementId === elementId).length,
      );
      bubble.style.display = "block";
      bubble.style.left = `${rect.right}px`;
      bubble.style.top = `${rect.top}px`;

      if (this.openFor === elementId && this.popover) {
        this.popover.style.left = `${Math.max(8, rect.right - 12)}px`;
        this.popover.style.top = `${rect.top + 24}px`;
      }
    }

    if (anyVisible) {
      this.scheduleRender();
    } else {
      this.stopLoop();
    }
  }
}
```

在 `packages/inspector/src/index.ts` 追加：

```ts
export {
  Annotations,
  type AnnotationsLabels,
  type AnnotationsCallbacks,
} from "./annotations/Annotations";
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd packages/inspector && npx vitest run && pnpm typecheck`
Expected: 7 个新测试 PASS，全包测试绿，typecheck clean

- [ ] **Step 5: Commit**

```bash
git add packages/inspector/src/annotations packages/inspector/src/styles/annotations.ts packages/inspector/src/index.ts
git commit -m "feat(inspector): Annotations 气泡/浮层注释层（改动元素页面留痕）"
```

---

### Task 3: Picker 放行注释层点击

**Files:**
- Modify: `packages/inspector/src/picker/Picker.ts`
- Test: `packages/inspector/src/picker/Picker.test.ts`

**Interfaces:**
- Consumes: `Annotations.ROOT_ID`（Task 2 产出，content 在 Task 5 传入）
- Produces: `PickerOptions { passThroughHostIds?: string[] }`；`Picker` 构造器变为 `constructor(callbacks?: PickerCallbacks, options?: PickerOptions)`（向后兼容，第二参可选）

- [ ] **Step 1: 写失败测试**

在 `packages/inspector/src/picker/Picker.test.ts` 追加：

```ts
it("passes clicks on pass-through hosts through untouched", () => {
  const onSelect = vi.fn();
  const passThrough = new Picker({ onSelect }, { passThroughHostIds: ["anno-root"] });
  const host = document.createElement("div");
  host.id = "anno-root";
  const inner = document.createElement("button");
  host.appendChild(inner);
  document.body.appendChild(host);

  passThrough.start();
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  inner.dispatchEvent(event);

  expect(onSelect).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(false);
  passThrough.stop();
  host.remove();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd packages/inspector && npx vitest run src/picker/Picker.test.ts`
Expected: FAIL — 新测试构造器第二参类型报错或 `onSelect` 被调用

- [ ] **Step 3: 实现**

`Picker.ts` 修改：

```ts
export interface PickerOptions {
  /**
   * Host element ids of our own annotation UI (e.g. Annotations.ROOT_ID).
   * Clicks inside them pass through untouched while picking — otherwise the
   * annotation popover's buttons would be unclickable in annotation mode.
   */
  passThroughHostIds?: string[];
}

export class Picker {
  // 构造器改为：
  constructor(
    private readonly callbacks: PickerCallbacks = {},
    private readonly options: PickerOptions = {},
  ) {}
```

加私有方法并改三处：

```ts
private isPassThrough(event: Event): boolean {
  const ids = this.options.passThroughHostIds;
  if (!ids || ids.length === 0) return false;
  return event
    .composedPath()
    .some((node) => node instanceof Element && node.id !== "" && ids.includes(node.id));
}

private readonly onSuppressEvent = (event: Event) => {
  if (this.isPassThrough(event)) return;
  event.preventDefault();
};

private readonly onClick = (event: MouseEvent) => {
  if (this.isPassThrough(event)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const element = this.resolveElement(event.clientX, event.clientY);
  if (element) this.callbacks.onSelect?.(element);
};
```

`resolveElement` 尾部追加排除（hover 命中气泡 host 时不当作页面元素）：

```ts
private resolveElement(x: number, y: number): Element | null {
  const element = document.elementFromPoint(x, y);
  if (!element) return null;
  // Never resolve into our own overlay (defensive; it is pointer-events:none).
  if (element.closest?.("#ui-tuner-overlay-root")) return null;
  for (const id of this.options.passThroughHostIds ?? []) {
    if (element.closest?.(`#${id}`)) return null;
  }
  return element;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd packages/inspector && npx vitest run && pnpm typecheck`
Expected: 全新旧测试 PASS（构造器第二参可选，旧测试不受影响）

- [ ] **Step 5: Commit**

```bash
git add packages/inspector/src/picker/Picker.ts packages/inspector/src/picker/Picker.test.ts
git commit -m "feat(inspector): Picker 放行注释层点击（passThroughHostIds）"
```

---

### Task 4: Store 新增 `clearSelection` action

**Files:**
- Modify: `apps/chrome-extension/src/state/sidepanel-store.ts`
- Test: `apps/chrome-extension/src/state/sidepanel-store.test.ts`

**Interfaces:**
- Consumes: `createSidepanelClearSelection`（Task 1）
- Produces: `useSidepanelStore.getState().clearSelection()` —— Task 6 面板「完成此元素」按钮消费

- [ ] **Step 1: 写失败测试**

在 `sidepanel-store.test.ts` 追加（仿照现有 ping 测试的 spy-port 模式）：

```ts
it("clearSelection sends sidepanel.clearSelection", () => {
  const { port, sent } = createSpyPort();
  useSidepanelStore.getState().connect(Channel.accept(port));
  useSidepanelStore.getState().clearSelection();
  expect(sent).toEqual([{ type: "sidepanel.clearSelection", payload: {} }]);
});
```

import 无需新增（`Channel`/`createSpyPort` 已存在于测试文件）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/chrome-extension && npx vitest run src/state/sidepanel-store.test.ts`
Expected: FAIL — `clearSelection is not a function`

- [ ] **Step 3: 实现**

`sidepanel-store.ts`：
- import 加 `createSidepanelClearSelection`
- interface `SidepanelState` 加：

```ts
  /** Annotation mode "done with this element": clear the selection, keep picking. */
  clearSelection: () => void;
```

- store 实现（放在 `selectAncestor` 之后）：

```ts
  clearSelection: () => {
    if (!channel) return;
    const message = createSidepanelClearSelection();
    channel.send(message);
    set((state) => ({ log: appendLog(state.log, "out", message) }));
  },
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/chrome-extension && npx vitest run src/state/sidepanel-store.test.ts && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/chrome-extension/src/state/sidepanel-store.ts apps/chrome-extension/src/state/sidepanel-store.test.ts
git commit -m "feat(sidepanel): store.clearSelection action（完成此元素，保持注释模式）"
```

---

### Task 5: Content 接线（持续注释模式 + Annotations 挂载）

**Files:**
- Modify: `apps/chrome-extension/src/content/index.ts`

**Interfaces:**
- Consumes: `Annotations`（Task 2）、`PickerOptions.passThroughHostIds`（Task 3）、`isSidepanelClearSelectionMessage`（Task 1）
- Produces: 无新接口（页面侧闭环）

本任务是 chrome 耦合的薄接线，无单测（仓库既有模式：content 无测试，逻辑厚度都在 inspector）。每步修改后跑 `pnpm typecheck`。

- [ ] **Step 1: 实例化与挂载**

`content/index.ts` 顶部 import 追加：

```ts
import {
  Annotations,
  // …既有 import 保持不变
} from "@ui-tuner/inspector";
import {
  isSidepanelClearSelectionMessage,
  // …既有 import 保持不变
} from "@ui-tuner/protocol";
```

模块级变量区加：

```ts
let annotations: Annotations | null = null;
```

新增统一上报出口（把 preview.changed 与气泡 sync 绑在一起）：

```ts
/** Report the change list to the panel and re-render page annotations. */
function reportChanges(): void {
  send(createPreviewChanged(changeTracker.all()));
  annotations?.sync(changeTracker.all());
}
```

把以下 5 处 `send(createPreviewChanged(changeTracker.all()))` 全部替换为 `reportChanges()`：
1. `applyStylePreview` 中 `value === null` 分支
2. `applyStylePreview` 末尾
3. `syncAfterChanges` 开头
4. `confirmApply` 末尾
5. `onConnect` 里的 reconnect 重同步（`if (changeTracker.all().length > 0)` 块）

- [ ] **Step 2: 持续注释模式**

`onConnect` 里 Picker 构造改为：

```ts
picker = new Picker(
  {
    onHoverChange: (element) => overlay?.setHover(element),
    onSelect: (element) => {
      // Annotation mode persists: keep picking so the next click selects the
      // next element. Esc / the panel toggle stops the picker.
      selectElement(element);
    },
    onCancel: () => {
      overlay?.setHover(null);
      send(createPickerState(false));
    },
  },
  { passThroughHostIds: [Annotations.ROOT_ID] },
);
```

（删掉原 `onSelect` 里的 `picker?.stop()` 和 `send(createPickerState(false))`。）

- [ ] **Step 3: Annotations 挂载 + clearSelection 处理**

`onConnect` 中 `overlay = new Overlay(); overlay.mount();` 之后加：

```ts
// Page-side popover labels follow the panel locale (read once per connect;
// a mid-session locale switch refreshes on the next panel open).
annotations = null;
void chrome.storage.local
  .get("ui-tuner:prefs")
  .catch(() => ({}))
  .then((stored) => {
    const locale =
      (stored as Record<string, { locale?: unknown }>)["ui-tuner:prefs"]?.locale === "en"
        ? "en"
        : "zh";
    annotations = new Annotations(
      locale === "zh"
        ? { revertElement: "还原此元素", closeLabel: "关闭" }
        : { revertElement: "Revert this element", closeLabel: "Close" },
      { onRevertElement: (elementId) => revertElement(elementId) },
    );
    annotations.mount();
    annotations.sync(changeTracker.all());
  });
```

消息处理 switch 加分支（放在 resetChanges 分支后）：

```ts
    } else if (isSidepanelClearSelectionMessage(message)) {
      clearSelection();
    }
```

`port.onDisconnect` 里加：

```ts
    annotations?.unmount();
    annotations = null;
```

- [ ] **Step 4: 验证**

Run: `cd apps/chrome-extension && pnpm typecheck && npx vitest run`
Expected: clean / 全绿

- [ ] **Step 5: Commit**

```bash
git add apps/chrome-extension/src/content/index.ts
git commit -m "feat(content): 持续注释模式 + Annotations 挂载/sync 接线"
```

---

### Task 6: 面板两态重构 + i18n key 增删

**Files:**
- Modify: `apps/chrome-extension/src/sidepanel/App.tsx`（整体重写）
- Modify: `apps/chrome-extension/src/sidepanel/components/ChangesTab.tsx`（移除底部操作行与 ApplySection，Reset All 挪到标题行）
- Modify: `apps/chrome-extension/src/i18n/messages.ts`
- 不动：`AgentTab.tsx`、`ApplySection.tsx`、`StylePanel.tsx`、`rows.tsx`、`ScrubInput.tsx`

**Interfaces:**
- Consumes: `clearSelection`（Task 4）、既有 store 字段、`formatChangesetForCopy`、`AgentTab` / `ApplySection` / `StylePanel` / `ChangesTab` 组件
- Produces: 无（UI 终态）

- [ ] **Step 1: i18n key 增删**

`messages.ts` zh 与 en 同步修改（parity 测试会强制对齐）：

删除：`"tab.style"`、`"tab.agent"`、`"tab.changes"`

zh 新增：

```ts
  "pick.exit": "退出注释模式 (Esc)",
  "done.element": "✓ 完成此元素",
  "agent.advancedSettings": "Agent 高级设置",
  "footer.sendToAgent": "发给 Agent",
```

en 新增：

```ts
  "pick.exit": "Exit annotation mode (Esc)",
  "done.element": "✓ Done with this element",
  "agent.advancedSettings": "Agent Advanced Settings",
  "footer.sendToAgent": "Send to Agent",
```

Run: `cd apps/chrome-extension && npx vitest run src/i18n/messages.test.ts`
Expected: PASS（parity 保持）

- [ ] **Step 2: ChangesTab 精简**

`ChangesTab.tsx`：
- 删除 `ApplySection` 的 import 与末尾 `<div className="mt-2.5"><ApplySection /></div>`
- 删除 `copied` state、`copyChanges` 函数、`formatChangesetForCopy` import、底部操作行整体（`{changes.length > 0 && (<div className="mt-3 flex …` 到 `</div>)}`，含复制按钮/Reset All/待应用计数）
- 标题行改为含 Reset All（有改动时显示）：

```tsx
      <div className="flex items-center gap-2">
        <p className="text-[12px] font-semibold text-text">
          {t("changes.title", { count: changes.length })}
        </p>
        {changes.length > 0 && (
          <button
            type="button"
            onClick={resetChanges}
            className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium text-danger-text hover:bg-red-500/15"
          >
            {t("changes.resetAll")}
          </button>
        )}
      </div>
```

- `useState` import 删除（不再需要）；`selection`/`source` selector 若不再使用一并删除。

- [ ] **Step 3: App.tsx 整体重写为两态**

完整替换 `App.tsx`。要点结构（保留既有 `isLocalhostUrl`、`STATUS_META`、`BRIDGE_META`、`StatusPill`、`PrefsToggles`、`BridgeStatus`、`dialBridge` 不变；删除 `SelectionCard`、`TabId`、`Fragment` import 改用不到就删）：

```tsx
/** Slim one-line element header above the style editor (replaces SelectionCard). */
function EditorHeader() {
  const t = useT();
  const selection = useSidepanelStore((s) => s.selection);
  const source = useSidepanelStore((s) => s.source);
  if (!selection) return null;
  const { element } = selection;

  const badge =
    source?.confidence === "exact"
      ? { labelKey: "source.exact" as const, className: "bg-emerald-500/15 text-ok-text" }
      : source?.confidence === "inferred"
        ? { labelKey: "source.inferred" as const, className: "bg-amber-500/15 text-warn-text" }
        : { labelKey: "source.previewOnly" as const, className: "bg-control text-faint" };

  return (
    <div className="flex items-baseline gap-2 border-b border-edge pb-1.5">
      <span className="truncate font-mono text-[12px] font-semibold text-accent-text">
        {"<"}
        {element.tagName}
        {">"}
      </span>
      <span className="font-mono text-[10px] text-dim tabular-nums">
        {element.bounds.width} × {element.bounds.height}
      </span>
      <span className={`ml-auto rounded px-1 py-px text-[9px] ${badge.className}`}>
        {t(badge.labelKey)}
      </span>
    </div>
  );
}

/** Sticky footer (annotation mode OFF, changes exist): copy all + send to agent. */
function FooterActions() {
  const t = useT();
  const changes = useSidepanelStore((s) => s.changes);
  const elementNames = useSidepanelStore((s) => s.elementNames);
  const selection = useSidepanelStore((s) => s.selection);
  const source = useSidepanelStore((s) => s.source);
  const [copied, setCopied] = useState(false);

  const copyChanges = async () => {
    try {
      await navigator.clipboard.writeText(
        formatChangesetForCopy({ changes, elementNames, source, selection }),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <footer className="flex shrink-0 items-start gap-2 border-t border-edge px-3 py-2.5">
      <button
        type="button"
        onClick={() => void copyChanges()}
        title={t("changes.copyTitle")}
        className="shrink-0 rounded-md bg-sky-500/15 px-2.5 py-1.5 text-[11px] font-medium text-info-text ring-1 ring-sky-500/40 transition-colors hover:bg-sky-500/25"
      >
        {copied ? t("action.copied") : t("changes.copy")}
      </button>
      <div className="min-w-0 flex-1">
        <ApplySection />
      </div>
    </footer>
  );
}
```

`App` 主体（`openChannel`/`useEffect` 逻辑不变；store selector 改为 `status, statusError, picking, selection, changes, setPicking, clearSelection`；新增 `const [agentOpen, setAgentOpen] = useState(false)`）：

```tsx
  const pickButtonLabel = picking ? t("pick.exit") : t("pick.start");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-edge px-3 py-2.5">
        <h1 className="text-[13px] font-semibold tracking-tight">UI Tuner</h1>
        <span className="flex items-center">
          <PrefsToggles />
          <StatusPill status={status} />
        </span>
      </header>

      <main className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-2.5">
        {/* Status zone: connection errors and bridge state live here. */}
        {status === "disconnected" && (
          <section className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-danger-text">
            <p className="text-[12px] leading-relaxed">{statusError ?? t("error.notConnected")}</p>
            <button
              type="button"
              onClick={() => void openChannel()}
              className="mt-2 rounded border border-red-500/40 px-2.5 py-1 text-[11px] font-medium hover:bg-red-500/20"
            >
              {t("action.reconnect")}
            </button>
          </section>
        )}
        <BridgeStatus />

        <section>
          <button
            type="button"
            onClick={() => setPicking(!picking)}
            disabled={status !== "connected"}
            className={`w-full rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              picking
                ? "bg-sky-500/20 text-info-text ring-1 ring-sky-500/60"
                : "bg-inverse text-inverse-text enabled:hover:bg-inverse-hover disabled:opacity-40"
            }`}
          >
            {pickButtonLabel}
          </button>
          {picking && status === "connected" && !selection && (
            <p className="mt-1.5 text-center text-[10px] text-info-text/80">{t("pick.hint")}</p>
          )}
        </section>

        {/* Annotation mode ON + element selected: the editor. */}
        {picking && selection && (
          <>
            <section className="rounded-md border border-edge bg-surface px-3 py-2.5">
              <EditorHeader />
              <div className="mt-1.5">
                <StylePanel />
              </div>
            </section>
            <button
              type="button"
              onClick={clearSelection}
              className="w-full rounded-md border border-edge-strong px-3 py-1.5 text-[12px] font-medium text-text transition-colors hover:bg-control"
            >
              {t("done.element")}
            </button>
          </>
        )}

        {/* Annotation mode OFF: changes list + collapsed agent settings. */}
        {!picking && (
          <>
            <ChangesTab />
            <section className="rounded-md border border-edge bg-surface px-3 py-2.5">
              <button
                type="button"
                onClick={() => setAgentOpen(!agentOpen)}
                className="flex w-full items-center gap-1.5 text-[10px] font-medium tracking-wider text-faint uppercase"
              >
                <span
                  className={`inline-block transition-transform ${agentOpen ? "rotate-90" : ""}`}
                >
                  ▸
                </span>
                {t("agent.advancedSettings")}
              </button>
              {agentOpen && (
                <div className="mt-2">
                  <AgentTab />
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {!picking && changes.length > 0 && <FooterActions />}
    </div>
  );
}
```

需要的 import 调整：`Fragment` 删除；新增 `formatChangesetForCopy`（`../format-changeset`... 实际路径 `../sidepanel/format-changeset` → 在 App.tsx 中是 `./format-changeset`）、`AgentTab`、`ChangesTab`、`ApplySection`（`./components/ApplySection`）、`StylePanel` 保留。

注意：`ChangesTab` 组件名保留（文件不改名），虽然它不再是 tab——避免无谓的文件移动。

- [ ] **Step 4: 验证**

Run: `cd apps/chrome-extension && npx vitest run && pnpm typecheck && npx eslint src`
Expected: 61+ 测试全绿、typecheck/lint clean

- [ ] **Step 5: Commit**

```bash
git add apps/chrome-extension/src/sidepanel apps/chrome-extension/src/i18n/messages.ts
git commit -m "feat(sidepanel): 两态注释模式面板（去 tab/选中卡，吸底 footer，Agent 高级设置折叠）"
```

---

### Task 7: 全仓分步验证 + 推送

- [ ] **Step 1: 全仓验证**

Run（仓库根）: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: 全部通过

- [ ] **Step 2: Commit & push**

```bash
cd "/Users/lowenlau/Documents/WorkSpace/UI Tuner"
git push origin feat/ui-ux-polish
```

- [ ] **Step 3: 提示用户真机验收**

刷新扩展 → 刷新页面 → 重开面板，按 spec 流程走一遍：
1. 点「选取元素」→ 连续点两个元素各改一个属性 → 两个元素右上角都有计数气泡
2. 点气泡 → 浮层列出改动 → 「还原此元素」→ 气泡消失
3. 「✓ 完成此元素」→ 高亮消失但仍可点选下一个
4. Esc 退出 → 面板显示按元素分组的改动列表 + 吸底 [复制改动] [发给 Agent]
5. 中英切换 + 亮暗切换在两种面板状态下都正常

## Self-Review 记录

- Spec 覆盖：7 条决策 → 决策1/2/3 气泡浮层 = Task 2/3/5；决策4 两态 = Task 6；决策5 删选中卡 = Task 6 EditorHeader；决策6 Agent 折叠 = Task 6；决策7 已在上一提交完成。`sidepanel.clearSelection` = Task 1/4/5。✓
- 类型一致性：`AnnotationsLabels { revertElement, closeLabel }`、`PickerOptions.passThroughHostIds`、`createSidepanelClearSelection` 在 Task 1–6 间引用一致。✓
- 已知取舍：页面浮层文案在面板开着时切语言不即时更新（下次重开面板生效）——spec 已记录。
