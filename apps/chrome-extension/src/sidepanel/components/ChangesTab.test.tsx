// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { StyleChange } from "@ui-tuner/protocol";
import { usePrefsStore } from "../../state/prefs";
import { useSidepanelStore } from "../../state/sidepanel-store";
import { ChangesTab } from "./ChangesTab";

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

describe("ChangesTab", () => {
  beforeEach(() => {
    usePrefsStore.setState({ locale: "zh" });
  });

  afterEach(() => {
    cleanup();
    useSidepanelStore.getState().reset();
  });

  it("counts an instruction-only element in the header", () => {
    useSidepanelStore.setState({
      changes: [],
      instructions: { "ut-9": "圆角更大" },
      elementNames: { "ut-9": "button" },
    });
    render(<ChangesTab />);
    expect(screen.getByText("Preview · 1")).toBeTruthy();
  });

  it("counts changes plus instruction-only elements, without double-counting", () => {
    useSidepanelStore.setState({
      // ut-1 has two changes AND an instruction → counts as 2, not 3.
      // ut-9 is instruction-only → counts as 1.
      changes: [makeChange("ut-1"), makeChange("ut-1", "width", "200px")],
      instructions: { "ut-1": "紧凑一点", "ut-9": "圆角更大" },
      elementNames: { "ut-1": "div", "ut-9": "button" },
    });
    render(<ChangesTab />);
    expect(screen.getByText("Preview · 3")).toBeTruthy();
  });

  it("renders an instruction-only element (no property changes) as its own group", () => {
    useSidepanelStore.setState({
      changes: [],
      instructions: { "ut-9": "圆角更大" },
      elementNames: { "ut-9": "button" },
    });
    render(<ChangesTab />);

    // Group header: tagName (from elementNames) + elementId + per-element revert.
    expect(screen.getByText("button")).toBeTruthy();
    expect(screen.getByText("ut-9")).toBeTruthy();
    expect(screen.getByText("还原")).toBeTruthy();
    // The saved instruction shows even with zero change rows.
    expect(screen.getByText(/圆角更大/)).toBeTruthy();
    // This is NOT the empty state, and Reset All is offered (it clears instructions too).
    expect(screen.queryByText(/编辑卡里调整/)).toBeNull();
    expect(screen.getByText("全部重置")).toBeTruthy();
  });

  it("shows the empty hint only when there are neither changes nor instructions", () => {
    useSidepanelStore.setState({ changes: [], instructions: {} });
    render(<ChangesTab />);
    expect(screen.getByText(/编辑卡里调整/)).toBeTruthy();
  });

  it("falls back to the element id when the tagName was never seen", () => {
    useSidepanelStore.setState({
      changes: [],
      instructions: { "ut-42": "收紧一点" },
      elementNames: {},
    });
    render(<ChangesTab />);
    // Graceful fallback: id-derived label, instruction still visible.
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText(/收紧一点/)).toBeTruthy();
  });
});
