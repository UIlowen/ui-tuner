// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import {
  createSelectionChanged,
  isSidepanelStylePreviewMessage,
  type UiTunerMessage,
} from "@ui-tuner/protocol";
import { Channel, type PortLike } from "../../messaging/channel";
import { useSidepanelStore } from "../../state/sidepanel-store";
import { ColorRow } from "./rows";

/**
 * ColorRow regression test (M8 真机自测 3 暴露的 bug)。
 *
 * The native color input is a controlled component, but preview frames
 * (`committed:false`) never touch the store's `styleValues` — so the
 * store-derived hex lags behind the picker. Meanwhile App subscribes to
 * `changes` and re-renders the whole panel on every `preview.changed`, which
 * re-renders ColorRow and snaps the controlled input back to the ORIGINAL
 * color. On blur, `event.target.value` was therefore the original color, not
 * the picked one: the page reverted and the recorded change was a same-color
 * no-op. ColorRow must track the picked value locally and commit that.
 */

function createSpyPort(): { port: PortLike; sent: UiTunerMessage[] } {
  const sent: UiTunerMessage[] = [];
  const port: PortLike = {
    name: "ui-tuner",
    postMessage: (message) => sent.push(message as UiTunerMessage),
    onMessage: { addListener: () => {}, removeListener: () => {} },
    onDisconnect: { addListener: () => {}, removeListener: () => {} },
  };
  return { port, sent };
}

const SELECTED_ELEMENT = {
  id: "ut-000001",
  tagName: "span",
  selector: "#gRangeText",
  text: "2026 年 4 月",
  bounds: { x: 0, y: 0, width: 10, height: 10 },
};

/** Connect a spy port and select an element whose computed color is rgb blue. */
function selectColorElement(): UiTunerMessage[] {
  const { port, sent } = createSpyPort();
  useSidepanelStore.getState().connect(Channel.accept(port));
  useSidepanelStore.getState().receive(
    createSelectionChanged({
      element: SELECTED_ELEMENT,
      breadcrumb: [{ tagName: "span", id: "ut-000001" }],
      styles: { color: "rgb(47, 109, 246)" },
      pickedAt: 1,
    }),
  );
  return sent;
}

function colorInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="color"]');
  if (!input) throw new Error("color input not found");
  return input as HTMLInputElement;
}

describe("ColorRow", () => {
  beforeEach(() => {
    useSidepanelStore.getState().reset();
  });

  it("commits the picked color, not the original, after a parent re-render", () => {
    const sent = selectColorElement();
    const { container, rerender } = render(<ColorRow property="color" label="Color" />);
    const input = colorInput(container);

    // Initial swatch derives from the page's computed rgb() color.
    expect(input.value).toBe("#2f6df6");

    // Drag in the native picker: preview frames only (store styleValues untouched).
    fireEvent.input(input, { target: { value: "#ff0000" } });
    expect(input.value).toBe("#ff0000");

    // A parent re-render mid-drag (App re-renders on every preview.changed)
    // must NOT snap the swatch back to the original color.
    rerender(<ColorRow property="color" label="Color" />);
    expect(input.value).toBe("#ff0000");

    // Release: blur commits the PICKED color, not the original.
    fireEvent.focusOut(input);
    const commits = sent
      .filter(isSidepanelStylePreviewMessage)
      .filter((m) => m.payload.committed && m.payload.property === "color");
    expect(commits.at(-1)?.payload.value).toBe("#ff0000");
  });

  it("open-and-close without dragging commits the original (a true no-op)", () => {
    const sent = selectColorElement();
    const { container } = render(<ColorRow property="color" label="Color" />);
    const input = colorInput(container);

    // No input events — the user opened the picker and closed it unchanged.
    fireEvent.focusOut(input);
    const commits = sent
      .filter(isSidepanelStylePreviewMessage)
      .filter((m) => m.payload.committed && m.payload.property === "color");
    // Commits the original color; the content script's color-aware no-op drop
    // (cssValuesEqual) discards it so no spurious change is recorded.
    expect(commits.at(-1)?.payload.value).toBe("#2f6df6");
  });
});
