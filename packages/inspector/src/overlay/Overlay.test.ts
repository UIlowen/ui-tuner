import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Overlay } from "./Overlay";

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

describe("Overlay", () => {
  let overlay: Overlay;
  let target: HTMLButtonElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    target = document.createElement("button");
    target.textContent = "cta";
    document.body.appendChild(target);
    mockRect(target, { x: 10, y: 100, width: 120, height: 40 });
    overlay = new Overlay();
    overlay.mount();
  });

  afterEach(() => {
    overlay.unmount();
  });

  function query(selector: string): HTMLElement {
    const el = overlay.root?.shadowRoot?.querySelector<HTMLElement>(selector);
    expect(el).toBeTruthy();
    return el!;
  }

  it("mounts an isolated host with a shadow root", () => {
    const host = document.getElementById("ui-tuner-overlay-root");
    expect(host).toBe(overlay.root);
    expect(host?.shadowRoot).not.toBeNull();
    expect(overlay.isMounted).toBe(true);
  });

  it("paints the hover box and label from the element rect", async () => {
    overlay.setHover(target);
    await nextFrame();

    const box = query(".hover-box");
    const label = query(".hover-label");
    expect(box.style.display).toBe("block");
    expect(box.style.left).toBe("10px");
    expect(box.style.top).toBe("100px");
    expect(box.style.width).toBe("120px");
    expect(label.style.display).toBe("block");
    expect(label.textContent).toBe("button  120 × 40");
  });

  it("hides boxes when the target clears", async () => {
    overlay.setHover(target);
    await nextFrame();
    overlay.setHover(null);
    await nextFrame();

    expect(query(".hover-box").style.display).toBe("none");
    expect(query(".hover-label").style.display).toBe("none");
  });

  it("reports lost selection when the element leaves the DOM", async () => {
    const onLost = vi.fn();
    overlay.setSelected(target, onLost);
    await nextFrame();
    expect(query(".selected-box").style.display).toBe("block");

    target.remove();
    await nextFrame();

    expect(onLost).toHaveBeenCalledTimes(1);
    expect(query(".selected-box").style.display).toBe("none");
  });

  it("unmount removes the host from the document", () => {
    overlay.unmount();
    expect(document.getElementById("ui-tuner-overlay-root")).toBeNull();
    expect(overlay.isMounted).toBe(false);
  });
});
