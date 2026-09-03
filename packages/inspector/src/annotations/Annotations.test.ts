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
