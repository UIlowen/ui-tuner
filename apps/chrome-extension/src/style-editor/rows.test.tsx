// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { ColorRow, ScrubField, SelectRow } from "./rows";
import { StyleEditContext, type StyleEditApi } from "./StyleEditContext";

beforeAll(() => {
  // jsdom does not implement pointer capture (the linked-pair drag tests need it).
  if (!("setPointerCapture" in Element.prototype)) {
    // @ts-expect-error test stub
    Element.prototype.setPointerCapture = () => {};
  }
  if (!("releasePointerCapture" in Element.prototype)) {
    // @ts-expect-error test stub
    Element.prototype.releasePointerCapture = () => {};
  }
});

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

/** In-memory StyleEditApi: static values snapshot + recorded updateStyle/revertStyle calls. */
function createApi(
  values: Record<string, string>,
  changed: string[] = [],
  dirty: string[] = [],
  linked: string[] = [],
): { api: StyleEditApi; calls: UpdateCall[]; reverts: string[] } {
  const calls: UpdateCall[] = [];
  const reverts: string[] = [];
  const api: StyleEditApi = {
    values,
    changed: new Set(changed),
    dirty: new Set(dirty),
    linked: new Set(linked),
    scrubbing: null,
    setScrubbing: () => {},
    updateStyle: (property, value, committed) => {
      calls.push({ property, value, committed });
    },
    revertStyle: (property) => {
      const properties = typeof property === "string" ? [property] : property;
      for (const p of properties) reverts.push(p);
    },
    toggleLinked: () => {},
  };
  return { api, calls, reverts };
}

function colorInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="color"]');
  if (!input) throw new Error("color input not found");
  return input as HTMLInputElement;
}

/** The editable value text next to the swatch. */
function valueInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input:not([type="color"])');
  if (!input) throw new Error("value input not found");
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

  it("shows the page's raw value in the text field", () => {
    const { api } = createApi({ color: "rgba(47, 109, 246, 0.5)" });
    const { container } = render(
      <StyleEditContext.Provider value={api}>
        <ColorRow property="color" label="Color" />
      </StyleEditContext.Provider>,
    );
    expect(valueInput(container).value).toBe("rgba(47, 109, 246, 0.5)");
  });

  it("typing a translucent rgba() commits it (alpha preserved via text)", () => {
    const { api, calls } = createApi({ color: "rgb(47, 109, 246)" });
    const { container } = render(
      <StyleEditContext.Provider value={api}>
        <ColorRow property="color" label="Color" />
      </StyleEditContext.Provider>,
    );
    const input = valueInput(container);

    fireEvent.change(input, { target: { value: "rgba(47, 109, 246, 0.5)" } });
    fireEvent.focusOut(input);

    expect(committedColorCalls(calls).at(-1)?.value).toBe("rgba(47, 109, 246, 0.5)");
  });

  it("typing a hex commits it as typed", () => {
    const { api, calls } = createApi({ color: "rgb(47, 109, 246)" });
    const { container } = render(
      <StyleEditContext.Provider value={api}>
        <ColorRow property="color" label="Color" />
      </StyleEditContext.Provider>,
    );
    const input = valueInput(container);

    fireEvent.change(input, { target: { value: "#ff0000" } });
    fireEvent.focusOut(input);

    expect(committedColorCalls(calls).at(-1)?.value).toBe("#ff0000");
  });

  it("typing the same color in another notation commits nothing (no-op)", () => {
    const { api, calls } = createApi({ color: "rgb(47, 109, 246)" });
    const { container } = render(
      <StyleEditContext.Provider value={api}>
        <ColorRow property="color" label="Color" />
      </StyleEditContext.Provider>,
    );
    const input = valueInput(container);

    fireEvent.change(input, { target: { value: "#2f6df6" } });
    fireEvent.focusOut(input);

    // Same color, different notation — dropping the draft keeps the page's
    // own notation; the content-side cssValuesEqual check would drop it anyway.
    expect(committedColorCalls(calls)).toEqual([]);
    expect(input.value).toBe("rgb(47, 109, 246)");
  });

  it("typing an invalid value reverts the field without committing", () => {
    const { api, calls } = createApi({ color: "rgb(47, 109, 246)" });
    const { container } = render(
      <StyleEditContext.Provider value={api}>
        <ColorRow property="color" label="Color" />
      </StyleEditContext.Provider>,
    );
    const input = valueInput(container);

    fireEvent.change(input, { target: { value: "not-a-color" } });
    fireEvent.focusOut(input);

    expect(committedColorCalls(calls)).toEqual([]);
    expect(input.value).toBe("rgb(47, 109, 246)");
  });

  it("picking a new color while alpha < 1 commits rgba with the new color", () => {
    const { api, calls } = createApi({ color: "rgba(47, 109, 246, 0.5)" });
    const { container } = render(
      <StyleEditContext.Provider value={api}>
        <ColorRow property="color" label="Color" />
      </StyleEditContext.Provider>,
    );
    const swatch = colorInput(container);

    // Pick a new color (red) while alpha is 0.5.
    fireEvent.input(swatch, { target: { value: "#ff0000" } });
    fireEvent.focusOut(swatch);

    // The commit should keep the existing alpha.
    expect(committedColorCalls(calls).at(-1)?.value).toBe("rgba(255,0,0,0.5)");
  });

  it("Enter in the text field commits the typed value", () => {
    const { api, calls } = createApi({ color: "rgb(47, 109, 246)" });
    const { container } = render(
      <StyleEditContext.Provider value={api}>
        <ColorRow property="color" label="Color" />
      </StyleEditContext.Provider>,
    );
    const input = valueInput(container);

    fireEvent.change(input, { target: { value: "rgba(255, 0, 0, 0.5)" } });
    // Enter blurs the field in a real browser; jsdom's blur() dispatches no
    // focusout for React, so the blur Enter produces is fired directly.
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.focusOut(input);

    expect(committedColorCalls(calls).at(-1)?.value).toBe("rgba(255, 0, 0, 0.5)");
  });
});

/**
 * A card reopened from a bubble faces the designer with ~40 property rows; the
 * ones an earlier step actually changed have to stand out on their own.
 */
describe("changed-property highlight", () => {
  it("marks the row whose property was changed", () => {
    const { api } = createApi({ height: "38px" }, ["height"]);
    const { container } = render(
      <StyleEditContext.Provider value={api}>
        <ScrubField property="height" label="Height" />
      </StyleEditContext.Provider>,
    );
    expect(container.querySelector('[data-changed="true"]')).not.toBeNull();
  });

  it("leaves a row for an untouched property unmarked", () => {
    const { api } = createApi({ height: "38px", color: "rgb(0, 0, 0)" }, ["color"]);
    const { container } = render(
      <StyleEditContext.Provider value={api}>
        <ScrubField property="height" label="Height" />
      </StyleEditContext.Provider>,
    );
    expect(container.querySelector("[data-changed]")).toBeNull();
  });
});

describe("per-property reset", () => {
  it("shows a reset button on a dirty row and calls revertStyle when clicked", () => {
    const { api, reverts } = createApi({ height: "38px" }, [], ["height"]);
    const { container } = render(
      <StyleEditContext.Provider value={api}>
        <ScrubField property="height" label="Height" />
      </StyleEditContext.Provider>,
    );
    const reset = container.querySelector("[aria-label='还原 Height']");
    expect(reset).not.toBeNull();
    fireEvent.click(reset!);
    expect(reverts).toEqual(["height"]);
  });

  it("hides the reset button for an unchanged row", () => {
    const { api } = createApi({ height: "38px" }, []);
    const { container } = render(
      <StyleEditContext.Provider value={api}>
        <ScrubField property="height" label="Height" />
      </StyleEditContext.Provider>,
    );
    expect(container.querySelector("[aria-label='还原 Height']")).toBeNull();
  });

  it("hides the reset button for a changed-only row (not dirty in current session)", () => {
    const { api } = createApi({ height: "38px" }, ["height"], []);
    const { container } = render(
      <StyleEditContext.Provider value={api}>
        <ScrubField property="height" label="Height" />
      </StyleEditContext.Provider>,
    );
    expect(container.querySelector("[aria-label='还原 Height']")).toBeNull();
  });
});

function selectOf(container: HTMLElement): HTMLSelectElement {
  const el = container.querySelector("select");
  if (!el) throw new Error("select not found");
  return el as HTMLSelectElement;
}

describe("SelectRow", () => {
  const options = [
    { value: "flex", label: "flex" },
    { value: "block", label: "block" },
  ];
  const displayRow = (api: StyleEditApi) => (
    <StyleEditContext.Provider value={api}>
      <SelectRow property="display" label="Display" options={options} />
    </StyleEditContext.Provider>
  );

  /** Re-picking what is already picked is not an edit — no change may go out. */
  it("commits nothing when the current value is picked again", () => {
    const { api, calls } = createApi({ display: "flex" });
    const { container } = render(displayRow(api));

    fireEvent.change(selectOf(container), { target: { value: "flex" } });
    expect(calls).toEqual([]);

    fireEvent.change(selectOf(container), { target: { value: "block" } });
    expect(calls).toEqual([{ property: "display", value: "block", committed: true }]);
  });

  it("offers the page's own value when the list does not contain it", () => {
    // A <select> matching no option silently shows its first one — the row would
    // claim `display: flex` for an element that is `inline`.
    const { api } = createApi({ display: "inline" });
    const { container } = render(displayRow(api));
    const select = selectOf(container);

    expect(select.value).toBe("inline");
    expect([...select.options].map((option) => option.value)).toEqual([
      "inline",
      "flex",
      "block",
    ]);
  });

  it("shows a dash for a property the page reports no value for", () => {
    const { api } = createApi({ display: "" });
    const { container } = render(displayRow(api));

    expect(selectOf(container).value).toBe("");
    expect(selectOf(container).options[0]?.textContent).toBe("—");
  });

  it("renders one control on the row instead of a button per option", () => {
    const { api } = createApi({ display: "flex" });
    const { container } = render(displayRow(api));

    // Whether the alternatives are actually *hidden* until opened is a painting
    // question — the real-browser harness asserts it (option rects are 0×0).
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("select")).toHaveLength(1);
  });
});

/**
 * The link toggle must be a real coupling, not an ornament: with the pair
 * locked, dragging width moves height by the aspect ratio (and vice versa),
 * and a locked spacing axis keeps both sides equal. Unlocked, the sibling
 * stays untouched.
 */
describe("linked pairs", () => {
  const widthField = (api: StyleEditApi) => (
    <StyleEditContext.Provider value={api}>
      <ScrubField
        property="width"
        label="宽"
        sync={{ pairKey: "width-height", sibling: "height", mode: "ratio" }}
      />
    </StyleEditContext.Provider>
  );

  it("ratio mode: scrubbing width scales height by the aspect ratio", async () => {
    const { api, calls } = createApi({ width: "100px", height: "50px" }, [], [], ["width-height"]);
    const { container } = render(widthField(api));
    const slider = container.querySelector('[role="slider"]') as HTMLElement;

    fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 110, pointerId: 1 });

    // Preview frames are rAF-throttled — wait a frame before asserting.
    // They drive both properties, so the page shows the pair moving.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(calls).toContainEqual({ property: "width", value: "110px", committed: false });
    expect(calls).toContainEqual({ property: "height", value: "55px", committed: false });

    fireEvent.pointerUp(slider, { pointerId: 1 });
    expect(calls).toContainEqual({ property: "width", value: "110px", committed: true });
    expect(calls).toContainEqual({ property: "height", value: "55px", committed: true });
  });

  it("ratio mode: scrubbing height scales width (the coupling is symmetric)", () => {
    const { api, calls } = createApi({ width: "100px", height: "50px" }, [], [], ["width-height"]);
    const { container } = render(
      <StyleEditContext.Provider value={api}>
        <ScrubField
          property="height"
          label="高"
          sync={{ pairKey: "width-height", sibling: "width", mode: "ratio" }}
        />
      </StyleEditContext.Provider>,
    );
    fireEvent.keyDown(container.querySelector('[role="slider"]') as HTMLElement, { key: "ArrowUp" });
    expect(calls).toContainEqual({ property: "height", value: "51px", committed: true });
    expect(calls).toContainEqual({ property: "width", value: "102px", committed: true });
  });

  it("equal mode: a locked spacing axis keeps both sides the same", () => {
    const { api, calls } = createApi(
      { "padding-top": "8px", "padding-bottom": "8px" },
      [],
      [],
      ["padding-top-bottom"],
    );
    const { container } = render(
      <StyleEditContext.Provider value={api}>
        <ScrubField
          property="padding-top"
          label="上"
          sync={{ pairKey: "padding-top-bottom", sibling: "padding-bottom", mode: "equal" }}
        />
      </StyleEditContext.Provider>,
    );
    fireEvent.keyDown(container.querySelector('[role="slider"]') as HTMLElement, { key: "ArrowUp" });
    expect(calls).toContainEqual({ property: "padding-top", value: "9px", committed: true });
    expect(calls).toContainEqual({ property: "padding-bottom", value: "9px", committed: true });
  });

  it("unlocked: the sibling is left alone", () => {
    const { api, calls } = createApi({ width: "100px", height: "50px" });
    const { container } = render(widthField(api));

    fireEvent.keyDown(container.querySelector('[role="slider"]') as HTMLElement, { key: "ArrowUp" });
    expect(calls).toEqual([{ property: "width", value: "101px", committed: true }]);
  });

  it("ratio mode with an unparseable sibling (auto) only moves the dragged side", () => {
    const { api, calls } = createApi({ width: "100px", height: "auto" }, [], [], ["width-height"]);
    const { container } = render(widthField(api));

    fireEvent.keyDown(container.querySelector('[role="slider"]') as HTMLElement, { key: "ArrowUp" });
    expect(calls).toEqual([{ property: "width", value: "101px", committed: true }]);
  });

  it("resetting a locked row reverts both properties", () => {
    const { api, reverts } = createApi(
      { width: "100px", height: "50px" },
      [],
      ["width"],
      ["width-height"],
    );
    const { container } = render(widthField(api));

    fireEvent.click(container.querySelector("[aria-label='还原 宽']") as HTMLElement);
    expect(reverts).toEqual(["width", "height"]);
  });
});
