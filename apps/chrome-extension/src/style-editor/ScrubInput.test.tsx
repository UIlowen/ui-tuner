// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { ScrubInput } from "./ScrubInput";

/**
 * ScrubInput drag regression test (same bug class as ColorRow, M8 真机自测 3).
 *
 * `currentValue.current = value` ran on EVERY render, so a parent re-render
 * mid-drag (App subscribes to `changes`/`log` and re-renders the whole panel
 * on every preview.changed / preview frame) reset the live drag value back to
 * the STALE prop — preview frames never update the store, so `value` lags.
 * pointerUp then committed the ORIGINAL value: the page snapped back and the
 * recorded change was a no-op. The live value must not be re-synced from the
 * prop while dragging.
 */

beforeAll(() => {
  // jsdom does not implement pointer capture.
  if (!("setPointerCapture" in Element.prototype)) {
    // @ts-expect-error test stub
    Element.prototype.setPointerCapture = () => {};
  }
  if (!("releasePointerCapture" in Element.prototype)) {
    // @ts-expect-error test stub
    Element.prototype.releasePointerCapture = () => {};
  }
});

function sliderOf(container: HTMLElement): HTMLElement {
  const el = container.querySelector('[role="slider"]');
  if (!el) throw new Error("slider not found");
  return el as HTMLElement;
}

describe("ScrubInput drag", () => {
  it("commits the dragged value, not the stale prop, when a parent re-renders mid-drag", () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    const { container, rerender } = render(
      <ScrubInput value={38} unit="px" onPreview={onPreview} onCommit={onCommit} />,
    );
    const slider = sliderOf(container);

    fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1 });
    // Drag +14px → 38 + 14 = 52. currentValue becomes 52 synchronously.
    fireEvent.pointerMove(slider, { clientX: 114, pointerId: 1 });

    // A parent re-render mid-drag delivers the STALE prop (preview frames
    // never update the store). This must NOT clobber the live drag value.
    rerender(<ScrubInput value={38} unit="px" onPreview={onPreview} onCommit={onCommit} />);

    fireEvent.pointerUp(slider, { pointerId: 1 });
    expect(onCommit).toHaveBeenCalledWith(52); // not 38
  });

  it("still syncs the live value from the prop when idle (external revert/re-select)", () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    const { container, rerender } = render(
      <ScrubInput value={38} unit="px" onPreview={onPreview} onCommit={onCommit} />,
    );
    // Not dragging: a new prop (e.g. a revert) should take over the display.
    rerender(<ScrubInput value={40} unit="px" onPreview={onPreview} onCommit={onCommit} />);
    // The value span carries tabular-nums (the hover drag-affordance glyph
    // is a separate span and must not be mistaken for the value).
    expect(sliderOf(container).querySelector("span.tabular-nums")?.textContent).toBe("40");
  });
});
