// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { ColorRow } from "./rows";
import { StyleEditContext, type StyleEditApi } from "./StyleEditContext";

/**
 * ColorRow regression test (M8 真机自测 3 暴露的 bug)。
 *
 * The native color input is a controlled component, but preview frames
 * (`committed:false`) never touch the style values snapshot — so the
 * snapshot-derived hex lags behind the picker. Meanwhile the host re-renders
 * the whole panel on every `preview.changed`, which re-renders ColorRow and
 * snaps the controlled input back to the ORIGINAL color. On blur,
 * `event.target.value` was therefore the original color, not the picked one:
 * the page reverted and the recorded change was a same-color no-op. ColorRow
 * must track the picked value locally and commit that.
 */

interface UpdateCall {
  property: string;
  value: string;
  committed: boolean;
}

/** In-memory StyleEditApi: static values snapshot + recorded updateStyle calls. */
function createApi(values: Record<string, string>): { api: StyleEditApi; calls: UpdateCall[] } {
  const calls: UpdateCall[] = [];
  const api: StyleEditApi = {
    values,
    updateStyle: (property, value, committed) => {
      calls.push({ property, value, committed });
    },
  };
  return { api, calls };
}

function colorInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="color"]');
  if (!input) throw new Error("color input not found");
  return input as HTMLInputElement;
}

function committedColorCalls(calls: UpdateCall[]): UpdateCall[] {
  return calls.filter((c) => c.committed && c.property === "color");
}

describe("ColorRow", () => {
  it("commits the picked color, not the original, after a parent re-render", () => {
    // Selected element whose computed color is rgb blue.
    const { api, calls } = createApi({ color: "rgb(47, 109, 246)" });
    const row = (
      <StyleEditContext.Provider value={api}>
        <ColorRow property="color" label="Color" />
      </StyleEditContext.Provider>
    );
    const { container, rerender } = render(row);
    const input = colorInput(container);

    // Initial swatch derives from the page's computed rgb() color.
    expect(input.value).toBe("#2f6df6");

    // Drag in the native picker: preview frames only (values snapshot untouched).
    fireEvent.input(input, { target: { value: "#ff0000" } });
    expect(input.value).toBe("#ff0000");

    // A parent re-render mid-drag (App re-renders on every preview.changed)
    // must NOT snap the swatch back to the original color.
    rerender(row);
    expect(input.value).toBe("#ff0000");

    // Release: blur commits the PICKED color, not the original.
    fireEvent.focusOut(input);
    expect(committedColorCalls(calls).at(-1)?.value).toBe("#ff0000");
  });

  it("open-and-close without dragging commits the original (a true no-op)", () => {
    const { api, calls } = createApi({ color: "rgb(47, 109, 246)" });
    const { container } = render(
      <StyleEditContext.Provider value={api}>
        <ColorRow property="color" label="Color" />
      </StyleEditContext.Provider>,
    );
    const input = colorInput(container);

    // No input events — the user opened the picker and closed it unchanged.
    fireEvent.focusOut(input);
    // Commits the original color; the content script's color-aware no-op drop
    // (cssValuesEqual) discards it so no spurious change is recorded.
    expect(committedColorCalls(calls).at(-1)?.value).toBe("#2f6df6");
  });
});
