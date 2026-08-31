import { describe, expect, it } from "vitest";
import {
  createContentPong,
  createContentReady,
  createPickerState,
  createSelectionChanged,
  createSelectionCleared,
} from "@ui-tuner/protocol";
import { useSidepanelStore } from "./sidepanel-store";

function resetStore() {
  useSidepanelStore.getState().reset();
}

describe("sidepanel store", () => {
  it("becomes connected and records page info on content.ready", () => {
    resetStore();
    useSidepanelStore
      .getState()
      .receive(
        createContentReady({ url: "http://localhost:5173/", title: "Demo", connectedAt: 1 }),
      );

    const state = useSidepanelStore.getState();
    expect(state.status).toBe("connected");
    expect(state.pageTitle).toBe("Demo");
    expect(state.pageUrl).toBe("http://localhost:5173/");
    expect(state.log).toHaveLength(1);
    expect(state.log[0]?.direction).toBe("in");
  });

  it("computes RTT from content.pong", () => {
    resetStore();
    useSidepanelStore.getState().receive(
      createContentPong({
        sentAt: Date.now() - 5,
        receivedAt: Date.now(),
        url: "",
        title: "",
        userAgent: "",
      }),
    );
    expect(useSidepanelStore.getState().lastRttMs).toBeGreaterThanOrEqual(4);
  });

  it("tracks pick mode via picker.state acks", () => {
    resetStore();
    useSidepanelStore.getState().receive(createPickerState(true));
    expect(useSidepanelStore.getState().picking).toBe(true);
    useSidepanelStore.getState().receive(createPickerState(false));
    expect(useSidepanelStore.getState().picking).toBe(false);
  });

  it("stores the selection and exits picking on selection.changed", () => {
    resetStore();
    useSidepanelStore.getState().receive(createPickerState(true));

    useSidepanelStore.getState().receive(
      createSelectionChanged({
        element: {
          id: "ut-000001",
          tagName: "button",
          selector: "body > button:nth-of-type(1)",
          text: "立即订阅",
          bounds: { x: 10, y: 20, width: 120, height: 40 },
        },
        breadcrumb: [
          { tagName: "button", id: "ut-000001" },
          { tagName: "body", id: "ut-000002" },
        ],
        pickedAt: 1_000,
      }),
    );

    const state = useSidepanelStore.getState();
    expect(state.picking).toBe(false);
    expect(state.selection?.element.tagName).toBe("button");
    expect(state.selection?.breadcrumb).toHaveLength(2);
  });

  it("clears the selection on selection.cleared", () => {
    resetStore();
    useSidepanelStore.getState().receive(
      createSelectionChanged({
        element: {
          id: "ut-000001",
          tagName: "div",
          selector: "#app",
          bounds: { x: 0, y: 0, width: 10, height: 10 },
        },
        breadcrumb: [{ tagName: "div", id: "ut-000001" }],
        pickedAt: 1,
      }),
    );
    expect(useSidepanelStore.getState().selection).not.toBeNull();

    useSidepanelStore.getState().receive(createSelectionCleared());
    expect(useSidepanelStore.getState().selection).toBeNull();
  });

  it("caps the log length", () => {
    resetStore();
    for (let i = 0; i < 60; i++) {
      useSidepanelStore
        .getState()
        .receive(createContentReady({ url: "u", title: "t", connectedAt: i }));
    }
    expect(useSidepanelStore.getState().log.length).toBeLessThanOrEqual(50);
  });

  it("reset returns to idle with no selection", () => {
    resetStore();
    useSidepanelStore
      .getState()
      .receive(createContentReady({ url: "u", title: "t", connectedAt: 1 }));
    useSidepanelStore.getState().receive(createPickerState(true));
    useSidepanelStore.getState().reset();
    const state = useSidepanelStore.getState();
    expect(state.status).toBe("idle");
    expect(state.picking).toBe(false);
    expect(state.selection).toBeNull();
    expect(state.log).toHaveLength(0);
  });
});
