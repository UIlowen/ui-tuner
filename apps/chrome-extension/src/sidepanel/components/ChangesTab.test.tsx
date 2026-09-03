// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { usePrefsStore } from "../../state/prefs";
import { useSidepanelStore } from "../../state/sidepanel-store";
import { ChangesTab } from "./ChangesTab";

describe("ChangesTab", () => {
  beforeEach(() => {
    usePrefsStore.setState({ locale: "zh" });
  });

  afterEach(() => {
    cleanup();
    useSidepanelStore.getState().reset();
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
    expect(screen.queryByText(/在 Style 面板调整样式后/)).toBeNull();
    expect(screen.getByText("全部重置")).toBeTruthy();
  });

  it("shows the empty hint only when there are neither changes nor instructions", () => {
    useSidepanelStore.setState({ changes: [], instructions: {} });
    render(<ChangesTab />);
    expect(screen.getByText(/在 Style 面板调整样式后/)).toBeTruthy();
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
