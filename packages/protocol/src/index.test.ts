import { describe, expect, it } from "vitest";
import {
  createContentPong,
  createContentReady,
  createPickerState,
  createPreviewChanged,
  createSelectionChanged,
  createSelectionCleared,
  createSidepanelPing,
  createSidepanelPicking,
  createSidepanelResetChanges,
  createSidepanelRevertChange,
  createSidepanelRevertElement,
  createSidepanelSelectAncestor,
  createSidepanelStylePreview,
  isContentPongMessage,
  isContentReadyMessage,
  isPickerStateMessage,
  isPreviewChangedMessage,
  isSelectionChangedMessage,
  isSelectionClearedMessage,
  isSidepanelPingMessage,
  isSidepanelPickingMessage,
  isSidepanelResetChangesMessage,
  isSidepanelRevertChangeMessage,
  isSidepanelRevertElementMessage,
  isSidepanelSelectAncestorMessage,
  isSidepanelStylePreviewMessage,
  isUiTunerMessage,
  UI_TUNER_PORT_NAME,
  type UiTunerMessage,
} from "./index";

/** Every message the protocol can create — guards must accept all of them. */
function createEveryMessage(): UiTunerMessage[] {
  return [
    createContentReady({ url: "http://localhost:5173/", title: "Vite App", connectedAt: 1 }),
    createSidepanelPing({ sentAt: 42 }),
    createContentPong({ sentAt: 42, receivedAt: 45, url: "", title: "", userAgent: "" }),
    createSidepanelPicking(true),
    createPickerState(false),
    createSelectionChanged({
      element: {
        id: "ut-000001",
        tagName: "button",
        selector: "body > div:nth-of-type(1) > button:nth-of-type(1)",
        text: "立即订阅",
        bounds: { x: 10, y: 20, width: 120, height: 40 },
      },
      breadcrumb: [
        { tagName: "button", id: "ut-000001" },
        { tagName: "div", id: "ut-000002" },
        { tagName: "body", id: "ut-000003" },
      ],
      styles: { "font-size": "16px", gap: "24px" },
      dom: { outerHTML: "<button>立即订阅</button>" },
      pickedAt: 1_000,
    }),
    createSelectionCleared(),
    createSidepanelSelectAncestor("ut-000002"),
    createSidepanelStylePreview({
      uiTunerId: "ut-000001",
      property: "gap",
      value: "16px",
      committed: false,
    }),
    createPreviewChanged([
      {
        id: "ch-000001",
        elementId: "ut-000001",
        property: "gap",
        previousValue: "24px",
        nextValue: "16px",
        source: "manual",
        createdAt: 1_000,
      },
    ]),
    createSidepanelRevertChange("ch-000001"),
    createSidepanelRevertElement("ut-000001"),
    createSidepanelResetChanges(),
  ];
}

describe("creators", () => {
  it("creates a content.ready message", () => {
    const message = createContentReady({
      url: "http://localhost:5173/",
      title: "Vite App",
      connectedAt: 1_000,
    });
    expect(message).toEqual({
      type: "content.ready",
      payload: { url: "http://localhost:5173/", title: "Vite App", connectedAt: 1_000 },
    });
  });

  it("creates a sidepanel.ping message", () => {
    expect(createSidepanelPing({ sentAt: 42 })).toEqual({
      type: "sidepanel.ping",
      payload: { sentAt: 42 },
    });
  });

  it("creates a content.pong message", () => {
    const message = createContentPong({
      sentAt: 42,
      receivedAt: 45,
      url: "http://localhost:5173/",
      title: "Vite App",
      userAgent: "Chrome",
    });
    expect(message.type).toBe("content.pong");
    expect(message.payload.receivedAt).toBe(45);
  });

  it("creates picker control messages", () => {
    expect(createSidepanelPicking(true)).toEqual({
      type: "sidepanel.picking",
      payload: { enabled: true },
    });
    expect(createPickerState(false)).toEqual({
      type: "picker.state",
      payload: { enabled: false },
    });
  });

  it("creates selection messages", () => {
    const changed = createSelectionChanged({
      element: {
        id: "ut-000001",
        tagName: "div",
        selector: "#app",
        bounds: { x: 0, y: 0, width: 100, height: 50 },
      },
      breadcrumb: [{ tagName: "div", id: "ut-000001" }],
      styles: {},
      pickedAt: 5,
    });
    expect(changed.type).toBe("selection.changed");
    expect(changed.payload.element.tagName).toBe("div");

    expect(createSelectionCleared()).toEqual({ type: "selection.cleared", payload: {} });
    expect(createSidepanelSelectAncestor("ut-000003")).toEqual({
      type: "sidepanel.selectAncestor",
      payload: { uiTunerId: "ut-000003" },
    });
  });

  it("creates style preview messages", () => {
    expect(
      createSidepanelStylePreview({
        uiTunerId: "ut-000001",
        property: "padding-top",
        value: null,
        committed: true,
      }),
    ).toEqual({
      type: "sidepanel.stylePreview",
      payload: { uiTunerId: "ut-000001", property: "padding-top", value: null, committed: true },
    });

    const change = {
      id: "ch-000002",
      elementId: "ut-000001",
      property: "height",
      previousValue: "40px",
      nextValue: "36px",
      source: "manual" as const,
      createdAt: 9,
    };
    expect(createPreviewChanged([change])).toEqual({
      type: "preview.changed",
      payload: { changes: [change] },
    });
  });

  it("creates revert and reset messages", () => {
    expect(createSidepanelRevertChange("ch-000001")).toEqual({
      type: "sidepanel.revertChange",
      payload: { changeId: "ch-000001" },
    });
    expect(createSidepanelRevertElement("ut-000002")).toEqual({
      type: "sidepanel.revertElement",
      payload: { elementId: "ut-000002" },
    });
    expect(createSidepanelResetChanges()).toEqual({
      type: "sidepanel.resetChanges",
      payload: {},
    });
  });
});

describe("isUiTunerMessage", () => {
  it("accepts every known message", () => {
    for (const message of createEveryMessage()) {
      expect(isUiTunerMessage(message)).toBe(true);
    }
  });

  it("rejects non-objects", () => {
    expect(isUiTunerMessage(null)).toBe(false);
    expect(isUiTunerMessage(undefined)).toBe(false);
    expect(isUiTunerMessage("content.ready")).toBe(false);
    expect(isUiTunerMessage(42)).toBe(false);
  });

  it("rejects unknown types and malformed payloads", () => {
    expect(isUiTunerMessage({ type: "bridge.sync", payload: {} })).toBe(false);
    expect(isUiTunerMessage({ type: "content.ready" })).toBe(false);
    expect(isUiTunerMessage({ type: "content.ready", payload: null })).toBe(false);
    expect(isUiTunerMessage({ type: "content.ready", payload: "str" })).toBe(false);
    expect(isUiTunerMessage({ type: "selection.cleared", payload: [] })).toBe(false);
  });
});

describe("per-type guards", () => {
  it("narrow by message type", () => {
    const messages = createEveryMessage();
    expect(messages.filter(isContentReadyMessage)).toHaveLength(1);
    expect(messages.filter(isSidepanelPingMessage)).toHaveLength(1);
    expect(messages.filter(isContentPongMessage)).toHaveLength(1);
    expect(messages.filter(isSidepanelPickingMessage)).toHaveLength(1);
    expect(messages.filter(isPickerStateMessage)).toHaveLength(1);
    expect(messages.filter(isSelectionChangedMessage)).toHaveLength(1);
    expect(messages.filter(isSelectionClearedMessage)).toHaveLength(1);
    expect(messages.filter(isSidepanelSelectAncestorMessage)).toHaveLength(1);
    expect(messages.filter(isSidepanelStylePreviewMessage)).toHaveLength(1);
    expect(messages.filter(isPreviewChangedMessage)).toHaveLength(1);
    expect(messages.filter(isSidepanelRevertChangeMessage)).toHaveLength(1);
    expect(messages.filter(isSidepanelRevertElementMessage)).toHaveLength(1);
    expect(messages.filter(isSidepanelResetChangesMessage)).toHaveLength(1);
  });
});

describe("port name", () => {
  it("is stable", () => {
    expect(UI_TUNER_PORT_NAME).toBe("ui-tuner");
  });
});
