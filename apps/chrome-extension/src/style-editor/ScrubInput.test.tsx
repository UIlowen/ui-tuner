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

/**
 * Selecting a control is not editing it. Every path that can end without moving
 * the value has to commit nothing, because a commit is what marks the row dirty
 * and reveals its reset button — the designer would see "changed" on a property
 * they only clicked.
 */
describe("ScrubInput no-op interactions", () => {
  it("commits nothing when the pointer is released without movement", () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    const { container } = render(
      <ScrubInput value={38} unit="px" onPreview={onPreview} onCommit={onCommit} />,
    );
    const slider = sliderOf(container);

    fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(slider, { clientX: 100, pointerId: 1 });

    expect(onPreview).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits nothing when an arrow key is already at its clamp limit", () => {
    const onCommit = vi.fn();
    const { container } = render(
      <ScrubInput value={1} min={1} max={10} onPreview={vi.fn()} onCommit={onCommit} />,
    );

    fireEvent.keyDown(sliderOf(container), { key: "ArrowDown" });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.keyDown(sliderOf(container), { key: "ArrowUp" });
    expect(onCommit).toHaveBeenCalledWith(2);
  });

  it("commits nothing when the typed value equals the current one", () => {
    const onCommit = vi.fn();
    const { container } = render(
      <ScrubInput value={38} unit="px" onPreview={vi.fn()} onCommit={onCommit} />,
    );
    fireEvent.doubleClick(sliderOf(container));

    const input = container.querySelector("input");
    if (!input) throw new Error("editor input not found");
    fireEvent.change(input, { target: { value: "38px" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe("ScrubInput drag lifecycle", () => {
  it("fires onDragStart on pointer down and onDragEnd on release — the card collapses to this row", () => {
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    const { container } = render(
      <ScrubInput
        value={38}
        unit="px"
        onPreview={vi.fn()}
        onCommit={vi.fn()}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />,
    );
    const slider = sliderOf(container);

    expect(onDragStart).not.toHaveBeenCalled();
    fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1 });
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDragEnd).not.toHaveBeenCalled();

    fireEvent.pointerUp(slider, { pointerId: 1 });
    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });

  it("fires onDragEnd even when the drag is cancelled (pointercancel)", () => {
    const onDragEnd = vi.fn();
    const { container } = render(
      <ScrubInput value={38} onPreview={vi.fn()} onCommit={vi.fn()} onDragEnd={onDragEnd} />,
    );
    const slider = sliderOf(container);

    fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1 });
    fireEvent.pointerCancel(slider, { pointerId: 1 });
    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });
});

describe("ScrubInput edit mode auto-select", () => {
  it("selects the draft only once — typing multi-digit values is possible", () => {
    const selectSpy = vi.spyOn(HTMLInputElement.prototype, "select");
    const onCommit = vi.fn();
    const { container } = render(
      <ScrubInput value={38} unit="px" onPreview={vi.fn()} onCommit={onCommit} />,
    );
    fireEvent.doubleClick(sliderOf(container));

    const input = container.querySelector("input");
    if (!input) throw new Error("editor input not found");
    expect(selectSpy).toHaveBeenCalledTimes(1);

    // Each keystroke re-renders the controlled input; the ref callback must
    // NOT re-select, or the next keystroke would replace the whole draft.
    fireEvent.change(input, { target: { value: "100px" } });
    expect(selectSpy).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(100);
    selectSpy.mockRestore();
  });
});
