// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SelectionPayload, SourceResolution } from "@ui-tuner/protocol";
import { usePrefsStore } from "../../state/prefs";
import { useSidepanelStore } from "../../state/sidepanel-store";
import { ApplySection } from "./ApplySection";

const SELECTION: SelectionPayload = {
  element: {
    id: "ut-1",
    tagName: "button",
    selector: "body > button",
    text: "订阅",
    bounds: { x: 0, y: 0, width: 100, height: 40 },
  },
  breadcrumb: [{ tagName: "button", id: "ut-1" }],
  styles: { gap: "24px" },
  pickedAt: 1,
};

const RESOLVED: SourceResolution = {
  elementId: "ut-1",
  confidence: "exact",
  componentName: "Card",
  file: "src/Card.tsx",
  line: 3,
};

/** Bridge connected + source resolved: only the change/instruction gate matters. */
function ready(instructions: Record<string, string>) {
  useSidepanelStore.setState({
    selection: SELECTION,
    source: RESOLVED,
    bridgeStatus: "connected",
    agents: [{ id: "codex", name: "Codex", available: true }],
    changes: [],
    instructions,
  });
}

describe("ApplySection instruction-only gate", () => {
  beforeEach(() => {
    usePrefsStore.setState({ locale: "zh" });
  });

  afterEach(() => {
    cleanup();
    useSidepanelStore.getState().reset();
  });

  it("offers Apply for an element that only has a saved instruction", () => {
    ready({ "ut-1": "改成主按钮" });
    render(<ApplySection />);
    const button = screen.getByText("应用到代码");
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("stays hidden when the element has neither changes nor a usable instruction", () => {
    ready({ "ut-1": "   " });
    render(<ApplySection />);
    expect(screen.queryByText("应用到代码")).toBeNull();
  });

  it("enables the dialog confirm and says the request is instruction-only", () => {
    ready({ "ut-1": "改成主按钮" });
    render(<ApplySection />);
    fireEvent.click(screen.getByText("应用到代码"));

    expect(screen.queryByText("0 处视觉改动")).toBeNull();
    expect(screen.getByText(/仅自然语言指令/)).toBeTruthy();
    const confirm = screen.getByText("应用");
    expect(confirm.hasAttribute("disabled")).toBe(false);
  });
});
