// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StyleChange } from "@ui-tuner/protocol";
import { Annotations } from "./Annotations";

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
    annotations = new Annotations();
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

  it("numbers bubbles in annotation order, not change count", async () => {
    const second = document.createElement("div");
    second.setAttribute("data-ui-tuner-id", "ut-2");
    document.body.appendChild(second);
    mockRect(second, { x: 200, y: 100, width: 80, height: 30 });

    annotations.sync([
      makeChange("ut-1"),
      makeChange("ut-1", "width", "200px"),
      makeChange("ut-2"),
    ]);
    await nextFrame();

    const bubbles = [
      ...(annotations.root?.shadowRoot?.querySelectorAll<HTMLButtonElement>(".bubble") ?? []),
    ];
    // Identify bubbles by their pinned corner (rect.right): ut-1 → 130px, ut-2 → 280px.
    const byLeft = new Map(bubbles.map((b) => [b.style.left, b.textContent]));
    expect(byLeft.get("130px")).toBe("1"); // two changes, but the number is the sequence
    expect(byLeft.get("280px")).toBe("2");
  });

  it("restarts numbering after all changes are reset", async () => {
    annotations.sync([makeChange("ut-1")]);
    await nextFrame();
    annotations.sync([]);
    await nextFrame();
    annotations.sync([makeChange("ut-1")]);
    await nextFrame();
    expect(query<HTMLButtonElement>(".bubble").textContent).toBe("1");
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
});
