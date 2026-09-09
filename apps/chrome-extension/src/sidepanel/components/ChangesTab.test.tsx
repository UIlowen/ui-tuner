// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    // 设计稿：「预览」白字 + 计数独立紫色 span（getByText 不跨嵌套元素匹配）。
    expect(screen.getByText("预览")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
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
    expect(screen.getByText("预览")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("renders an instruction-only element (no property changes) as its own card", () => {
    useSidepanelStore.setState({
      changes: [],
      instructions: { "ut-9": "圆角更大" },
      elementNames: { "ut-9": "button" },
    });
    render(<ChangesTab />);

    // Card header: tagName (from elementNames) + elementId + per-element revert.
    expect(screen.getByText("<button>")).toBeTruthy();
    expect(screen.getByText("ut-9")).toBeTruthy();
    expect(screen.getByText("还原")).toBeTruthy();
    // The saved instruction shows even with zero change rows — WITHOUT its own
    // ↺ (还原 already covers an instruction-only card).
    expect(screen.getByText(/圆角更大/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "撤销指令" })).toBeNull();
    // This is NOT the empty state, and 一键还原 is offered (it clears instructions too).
    expect(screen.queryByText(/编辑卡里调整/)).toBeNull();
    expect(screen.getByText("一键还原")).toBeTruthy();
  });

  it("offers the instruction ↺ only when the card also has property changes", () => {
    useSidepanelStore.setState({
      changes: [makeChange("ut-1")],
      instructions: { "ut-1": "紧凑一点" },
      elementNames: { "ut-1": "div" },
    });
    render(<ChangesTab />);

    const revertInstruction = screen.getByRole("button", { name: "撤销指令" });
    // No channel is wired in this test — the store action is a safe no-op.
    fireEvent.click(revertInstruction);
  });

  it("shows the empty hint only when there are neither changes nor instructions", () => {
    useSidepanelStore.setState({ changes: [], instructions: {} });
    render(<ChangesTab />);
    expect(screen.getByText(/编辑卡里调整/)).toBeTruthy();
    // The empty state carries the big pick button (the design's 图1).
    expect(screen.getByRole("button", { name: "选取元素" })).toBeTruthy();
  });

  it("falls back to the element id when the tagName was never seen", () => {
    useSidepanelStore.setState({
      changes: [],
      instructions: { "ut-42": "收紧一点" },
      elementNames: {},
    });
    render(<ChangesTab />);
    // Graceful fallback: id-derived label, instruction still visible.
    expect(screen.getByText("<42>")).toBeTruthy();
    expect(screen.getByText(/收紧一点/)).toBeTruthy();
  });
});
