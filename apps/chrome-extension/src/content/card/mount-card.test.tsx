// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { usePrefsStore } from "../../state/prefs";
import { EDITOR_CARD_ROOT_ID, mountEditorCard } from "./mount-card";
import type { EditorCardProps } from "./types";

function baseProps(overrides: Partial<EditorCardProps> = {}): EditorCardProps {
  return {
    elementId: "ut-000001",
    tagName: "button",
    number: null,
    initialValues: { height: "38px" },
    initialInstruction: "",
    changedProperties: [],
    onStage: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onDelete: vi.fn(),
    onRevert: vi.fn(() => null),
    ...overrides,
  };
}

function hostEl(): HTMLElement | null {
  return document.getElementById(EDITOR_CARD_ROOT_ID);
}

const PLACEHOLDER = "这个元素要怎么改？";

/** The instruction field: a one-line input in the compact row, a textarea when expanded. */
function instructionField(shadow: ShadowRoot): HTMLInputElement | HTMLTextAreaElement {
  const field = shadow.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[placeholder="${PLACEHOLDER}"]`,
  );
  expect(field, "instruction field").toBeTruthy();
  return field!;
}

function clickByLabel(shadow: ShadowRoot, label: string): void {
  const button = [...shadow.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === label,
  );
  expect(button, `${label} button`).toBeTruthy();
  act(() => button!.click());
}

/**
 * jsdom has no ResizeObserver. The card mount uses one to pull the card back on
 * screen when it grows, so the stub records the callbacks and lets a test fire
 * them at the moment the size "changes".
 */
let resizeCallbacks: ResizeObserverCallback[] = [];

class ResizeObserverStub {
  constructor(callback: ResizeObserverCallback) {
    resizeCallbacks.push(callback);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function fireResize(): void {
  for (const callback of resizeCallbacks) callback([], {} as ResizeObserver);
}

describe("mountEditorCard", () => {
  beforeEach(() => {
    // React root.render is flushed via act(); opt into the act environment.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    usePrefsStore.setState({ locale: "zh", theme: "light" });
    // jsdom has no scrollIntoView; the card calls it to reveal a changed row.
    Element.prototype.scrollIntoView = vi.fn();
    resizeCallbacks = [];
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    // jsdom has no matchMedia; stub a light-mode one for the theme logic.
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    hostEl()?.remove();
    vi.unstubAllGlobals();
  });

  it("creates a fixed click-through host and shows/hides the card", () => {
    const mount = mountEditorCard();
    const host = hostEl();
    expect(host).not.toBeNull();
    expect(host?.style.position).toBe("fixed");
    expect(host?.style.pointerEvents).toBe("none");
    expect(host?.shadowRoot).not.toBeNull();
    expect(mount.isOpen).toBe(false);

    act(() => mount.show(baseProps({ number: 2 })));
    expect(mount.isOpen).toBe(true);
    const text = host?.shadowRoot?.textContent ?? "";
    expect(text).toContain("button"); // tag name in the header
    expect(text).toContain("2"); // sequence badge

    act(() => mount.hide());
    expect(mount.isOpen).toBe(false);
    expect(host?.shadowRoot?.textContent ?? "").not.toContain("保存");
  });

  it("places the card beside the anchor element instead of the viewport corner", () => {
    const mount = mountEditorCard();
    // jsdom measures the card as 0×0, so the placement follows the anchor:
    // right side, top-aligned, 12px gap.
    act(() =>
      mount.show(baseProps(), { left: 100, top: 200, right: 400, bottom: 340, width: 300, height: 140 }),
    );
    expect(hostEl()?.style.transform).toBe("translate(412px, 200px)");
    mount.unmount();
  });

  it("flips the card to the element's left when the right side is off-screen", () => {
    const mount = mountEditorCard();
    // jsdom's viewport is 1024 wide; an element ending at 1100 leaves no room
    // on the right, so the card goes to its left.
    act(() =>
      mount.show(baseProps(), { left: 900, top: 100, right: 1100, bottom: 150, width: 200, height: 50 }),
    );
    expect(hostEl()?.style.transform).toBe("translate(888px, 100px)");
    mount.unmount();
  });

  it("pulls the card back into the viewport when it grows after opening", () => {
    const mount = mountEditorCard();
    const host = hostEl()!;
    // The card container is the shadow root's first DIV — jsdom gets the <style>
    // fallback from injectCardStyles, so firstElementChild is the stylesheet.
    const container = host.shadowRoot!.querySelector("div")!;

    // Opened compact beside an element near the bottom edge: a one-line row fits
    // jsdom's 768px viewport at y=700, so placement leaves it there.
    act(() =>
      mount.show(baseProps(), {
        left: 100,
        top: 700,
        right: 300,
        bottom: 740,
        width: 200,
        height: 40,
      }),
    );
    expect(host.style.transform).toBe("translate(312px, 700px)");

    // Expanding grows the card to 396px: without a re-clamp the 取消/保存 footer
    // ends up below the fold, where nothing can click it.
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      x: 312,
      y: 700,
      width: 320,
      height: 396,
      top: 700,
      right: 632,
      bottom: 1096,
      left: 312,
      toJSON: () => ({}),
    } as DOMRect);
    act(fireResize);

    expect(host.style.transform).toBe(`translate(312px, ${768 - 396}px)`);
    mount.unmount();
  });

  it("applies the dark class to the host when the resolved theme is dark", () => {
    usePrefsStore.setState({ theme: "dark" });
    const mount = mountEditorCard();
    expect(hostEl()?.classList.contains("dark")).toBe(true);

    act(() => usePrefsStore.getState().setTheme("light"));
    expect(hostEl()?.classList.contains("dark")).toBe(false);
    mount.unmount();
  });

  it("unmount removes the host from the DOM", () => {
    const mount = mountEditorCard();
    act(() => mount.show(baseProps()));
    mount.unmount();
    expect(hostEl()).toBeNull();
  });

  it("remounts with fresh state when show() switches to a different element", () => {
    const mount = mountEditorCard();
    const shadow = (): ShadowRoot => hostEl()!.shadowRoot!;

    // Both elements carry a saved instruction, so both cards open expanded.
    act(() =>
      mount.show(
        baseProps({ elementId: "ut-A", tagName: "button", initialInstruction: "A的指令" }),
      ),
    );
    expect(instructionField(shadow()).value).toBe("A的指令");

    // Edit A's instruction. A reused card would carry this draft over to B, and
    // 保存 would then write A's words against B's element.
    act(() => {
      fireEvent.change(instructionField(shadow()), { target: { value: "A的草稿" } });
    });
    expect(instructionField(shadow()).value).toBe("A的草稿");

    act(() =>
      mount.show(baseProps({ elementId: "ut-B", tagName: "div", initialInstruction: "B的指令" })),
    );
    expect(shadow().textContent ?? "").toContain("div");
    expect(instructionField(shadow()).value).toBe("B的指令");
  });

  it("re-derives the opening state per element instead of inheriting the last card's", () => {
    const mount = mountEditorCard();
    const shadow = (): ShadowRoot => hostEl()!.shadowRoot!;

    // A is annotated, so it opens expanded — and the designer collapses it.
    act(() => mount.show(baseProps({ elementId: "ut-A", number: 1 })));
    expect(instructionField(shadow()).tagName).toBe("TEXTAREA");
    clickByLabel(shadow(), "收起");
    expect(instructionField(shadow()).tagName).toBe("INPUT");

    // B is annotated too. Inheriting A's collapse would hide B's changed rows —
    // the highlight this card exists to show — behind a one-line input.
    act(() =>
      mount.show(baseProps({ elementId: "ut-B", tagName: "div", changedProperties: ["height"] })),
    );
    expect(instructionField(shadow()).tagName).toBe("TEXTAREA");
    expect(shadow().querySelectorAll('[data-changed="true"]')).toHaveLength(1);
  });

  it("keeps the in-progress draft when show() re-renders the SAME element", () => {
    const mount = mountEditorCard();
    const shadow = (): ShadowRoot => hostEl()!.shadowRoot!;

    // A fresh pick opens on the compact one-liner; the draft goes there.
    act(() => mount.show(baseProps({ elementId: "ut-A", initialInstruction: "" })));
    expect(instructionField(shadow()).tagName).toBe("INPUT");
    act(() => {
      fireEvent.change(instructionField(shadow()), { target: { value: "未完成的草稿" } });
    });

    // Same element re-shown (e.g. re-picked): the session continues, draft kept.
    act(() => mount.show(baseProps({ elementId: "ut-A", initialInstruction: "" })));
    expect(instructionField(shadow()).value).toBe("未完成的草稿");
  });
});
