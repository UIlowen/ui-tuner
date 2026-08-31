import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { Picker } from "./Picker";

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function mouse(type: string, x: number, y: number) {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
}

describe("Picker", () => {
  let target: HTMLButtonElement;
  let onHoverChange: Mock<(element: Element | null) => void>;
  let onSelect: Mock<(element: Element) => void>;
  let onCancel: Mock<() => void>;
  let elementFromPoint: Mock<(x: number, y: number) => Element | null>;

  beforeEach(() => {
    document.body.innerHTML = "";
    target = document.createElement("button");
    target.textContent = "cta";
    document.body.appendChild(target);
    onHoverChange = vi.fn();
    onSelect = vi.fn();
    onCancel = vi.fn();
    // jsdom does not implement elementFromPoint — install a stub on the document.
    elementFromPoint = vi.fn(() => target);
    document.elementFromPoint = elementFromPoint as unknown as typeof document.elementFromPoint;
  });

  afterEach(() => {
    Reflect.deleteProperty(document, "elementFromPoint");
    document.body.innerHTML = "";
  });

  it("tracks hover via elementFromPoint, deduped per element", async () => {
    const picker = new Picker({ onHoverChange, onSelect, onCancel });
    picker.start();

    document.dispatchEvent(mouse("mousemove", 10, 10));
    await nextFrame();
    expect(onHoverChange).toHaveBeenCalledTimes(1);
    expect(onHoverChange).toHaveBeenLastCalledWith(target);

    // Same element under a moved pointer → no extra callbacks.
    document.dispatchEvent(mouse("mousemove", 30, 30));
    await nextFrame();
    expect(onHoverChange).toHaveBeenCalledTimes(1);

    picker.stop();
  });

  it("reports hover null when the pointer leaves the document", async () => {
    const picker = new Picker({ onHoverChange, onSelect, onCancel });
    picker.start();

    document.dispatchEvent(mouse("mousemove", 10, 10));
    await nextFrame();
    document.dispatchEvent(new MouseEvent("mouseleave"));
    expect(onHoverChange).toHaveBeenLastCalledWith(null);

    picker.stop();
  });

  it("click is intercepted in capture phase and reports the element", () => {
    const picker = new Picker({ onHoverChange, onSelect, onCancel });
    picker.start();

    const click = mouse("click", 10, 10);
    target.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(target);

    picker.stop();
  });

  it("Esc stops the picker and reports cancel", () => {
    const picker = new Picker({ onHoverChange, onSelect, onCancel });
    picker.start();

    const esc = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    document.dispatchEvent(esc);

    expect(esc.defaultPrevented).toBe(true);
    expect(picker.isEnabled).toBe(false);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("stop detaches all listeners", async () => {
    const picker = new Picker({ onHoverChange, onSelect, onCancel });
    picker.start();
    picker.stop();

    document.dispatchEvent(mouse("mousemove", 10, 10));
    await nextFrame();
    target.dispatchEvent(mouse("click", 10, 10));

    expect(onHoverChange).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("never resolves into its own overlay root", () => {
    const overlayHost = document.createElement("div");
    overlayHost.id = "ui-tuner-overlay-root";
    document.body.appendChild(overlayHost);

    const picker = new Picker({ onHoverChange, onSelect, onCancel });
    elementFromPoint.mockReturnValue(overlayHost);
    picker.start();
    const click = mouse("click", 0, 0);
    overlayHost.dispatchEvent(click);
    expect(onSelect).not.toHaveBeenCalled();

    picker.stop();
  });
});
