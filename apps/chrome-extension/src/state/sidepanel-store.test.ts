import { describe, expect, it } from "vitest";
import {
  createContentPong,
  createContentReady,
  createPickerState,
  createPreviewChanged,
  createSelectionChanged,
  createSelectionCleared,
  type StyleChange,
} from "@ui-tuner/protocol";
import { Channel, type PortLike } from "../messaging/channel";
import { useSidepanelStore } from "./sidepanel-store";

function resetStore() {
  useSidepanelStore.getState().reset();
}

/** Minimal PortLike capturing everything the store sends. */
function createSpyPort(): { port: PortLike; sent: unknown[] } {
  const sent: unknown[] = [];
  const port: PortLike = {
    name: "ui-tuner",
    postMessage: (message) => sent.push(message),
    onMessage: { addListener: () => {}, removeListener: () => {} },
    onDisconnect: { addListener: () => {}, removeListener: () => {} },
  };
  return { port, sent };
}

const SELECTED_ELEMENT = {
  id: "ut-000001",
  tagName: "button",
  selector: "body > button:nth-of-type(1)",
  text: "立即订阅",
  bounds: { x: 10, y: 20, width: 120, height: 40 },
};

function selectElement(styles: Record<string, string> = { gap: "24px" }): void {
  useSidepanelStore.getState().receive(
    createSelectionChanged({
      element: SELECTED_ELEMENT,
      breadcrumb: [
        { tagName: "button", id: "ut-000001" },
        { tagName: "body", id: "ut-000002" },
      ],
      styles,
      pickedAt: 1_000,
    }),
  );
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
    selectElement({ gap: "24px" });

    const state = useSidepanelStore.getState();
    expect(state.picking).toBe(false);
    expect(state.selection?.element.tagName).toBe("button");
    expect(state.selection?.breadcrumb).toHaveLength(2);
  });

  it("seeds styleValues from the selection payload", () => {
    resetStore();
    selectElement({ gap: "24px", "font-size": "16px" });
    expect(useSidepanelStore.getState().styleValues).toEqual({
      gap: "24px",
      "font-size": "16px",
    });
  });

  it("clears the selection on selection.cleared", () => {
    resetStore();
    selectElement({});
    expect(useSidepanelStore.getState().selection).not.toBeNull();

    useSidepanelStore.getState().receive(createSelectionCleared());
    const state = useSidepanelStore.getState();
    expect(state.selection).toBeNull();
    expect(state.styleValues).toBeNull();
    expect(state.changes).toEqual([]); // changes survive selection clears (plan §36)
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
    expect(state.styleValues).toBeNull();
    expect(state.changes).toEqual([]);
    expect(state.log).toHaveLength(0);
  });

  it("updateStyle sends preview frames without touching styleValues", () => {
    resetStore();
    const { port, sent } = createSpyPort();
    useSidepanelStore.getState().connect(Channel.accept(port));
    selectElement({ gap: "24px" });

    useSidepanelStore.getState().updateStyle("gap", "20px", false);

    expect(sent).toEqual([
      {
        type: "sidepanel.stylePreview",
        payload: { uiTunerId: "ut-000001", property: "gap", value: "20px", committed: false },
      },
    ]);
    // Scrub frames must not re-render the panel — baseline stays at 24px.
    expect(useSidepanelStore.getState().styleValues).toEqual({ gap: "24px" });
  });

  it("updateStyle commits update styleValues and null deletes the property", () => {
    resetStore();
    const { port, sent } = createSpyPort();
    useSidepanelStore.getState().connect(Channel.accept(port));
    selectElement({ gap: "24px" });

    useSidepanelStore.getState().updateStyle("gap", "16px", true);
    expect(useSidepanelStore.getState().styleValues).toEqual({ gap: "16px" });

    useSidepanelStore.getState().updateStyle("gap", null, true);
    expect(useSidepanelStore.getState().styleValues).toEqual({});
    expect(sent).toHaveLength(2);
  });

  it("updateStyle is a no-op without a channel or selection", () => {
    resetStore();
    const { port, sent } = createSpyPort();

    // No selection yet.
    useSidepanelStore.getState().connect(Channel.accept(port));
    useSidepanelStore.getState().updateStyle("gap", "16px", true);
    expect(sent).toHaveLength(0);
  });

  it("stores page-side change records from preview.changed", () => {
    resetStore();
    const change: StyleChange = {
      id: "ch-000001",
      elementId: "ut-000001",
      property: "gap",
      previousValue: "24px",
      nextValue: "16px",
      source: "manual",
      createdAt: 1_000,
    };
    useSidepanelStore.getState().receive(createPreviewChanged([change]));
    expect(useSidepanelStore.getState().changes).toEqual([change]);
  });

  it("remembers element names from selections for the changes tab", () => {
    resetStore();
    selectElement({ gap: "24px" });
    const state = useSidepanelStore.getState();
    expect(state.elementNames["ut-000001"]).toBe("button");
    expect(state.elementNames["ut-000002"]).toBe("body");
  });

  it("sends revert and reset messages", () => {
    resetStore();
    const { port, sent } = createSpyPort();
    useSidepanelStore.getState().connect(Channel.accept(port));

    useSidepanelStore.getState().revertChange("ch-000001");
    useSidepanelStore.getState().revertElement("ut-000001");
    useSidepanelStore.getState().resetChanges();

    expect(sent).toEqual([
      { type: "sidepanel.revertChange", payload: { changeId: "ch-000001" } },
      { type: "sidepanel.revertElement", payload: { elementId: "ut-000001" } },
      { type: "sidepanel.resetChanges", payload: {} },
    ]);
  });
});
