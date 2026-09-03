import { describe, expect, it } from "vitest";
import {
  assembleAgentContext,
  createAgentApplied,
  createAgentCapture,
  createAgentCaptureResult,
  createAgentRequest,
  createApplyConfirmed,
  createApplyResult,
  createBridgeAgents,
  createBridgeHello,
  createBridgeSourceResolved,
  createBridgeSync,
  createBridgeWelcome,
  createChangesApply,
  createContentPong,
  createContentReady,
  createPickerState,
  createPreviewChanged,
  createSelectionChanged,
  createSelectionCleared,
  createSidepanelClearSelection,
  createSidepanelConfirmApply,
  createSidepanelPing,
  createSidepanelPicking,
  createSidepanelResetChanges,
  createSidepanelRevertChange,
  createSidepanelRevertElement,
  createSidepanelSelectAncestor,
  createSidepanelStylePreview,
  isAgentAppliedMessage,
  isAgentCaptureMessage,
  isAgentCaptureResultMessage,
  isAgentRequestMessage,
  isApplyConfirmedMessage,
  isApplyResultMessage,
  isBridgeAgentsMessage,
  isBridgeHelloMessage,
  isBridgeSourceResolvedMessage,
  isBridgeSyncMessage,
  isBridgeWelcomeMessage,
  isChangesApplyMessage,
  isContentPongMessage,
  isContentReadyMessage,
  isPickerStateMessage,
  isPreviewChangedMessage,
  isSelectionChangedMessage,
  isSelectionClearedMessage,
  isSidepanelClearSelectionMessage,
  isSidepanelConfirmApplyMessage,
  isSidepanelPingMessage,
  isSidepanelPickingMessage,
  isSidepanelResetChangesMessage,
  isSidepanelRevertChangeMessage,
  isSidepanelRevertElementMessage,
  isSidepanelSelectAncestorMessage,
  isSidepanelStylePreviewMessage,
  isUiTunerMessage,
  UI_TUNER_PORT_NAME,
  type ApplyElementContext,
  type SelectionPayload,
  type StyleChange,
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
    createSidepanelClearSelection(),
    createBridgeHello({ extensionVersion: "0.1.0", pageUrl: "http://localhost:5173/" }),
    createBridgeWelcome({
      bridgeVersion: "0.1.0",
      project: { name: "demo", framework: "Vite", root: "/tmp/demo" },
      devServerUrl: "http://localhost:5173",
    }),
    createBridgeSync({ selection: null, changes: [] }),
    createBridgeSourceResolved({
      elementId: "ut-000001",
      confidence: "exact",
      componentName: "Card",
      file: "src/components/Card.tsx",
      line: 8,
    }),
    createAgentRequest({
      instruction: "整体紧凑一点",
      include: { dom: true, styles: true, source: true, screenshot: false, parentTree: false },
      contextLevel: 1,
      sentAt: 2_000,
    }),
    createBridgeAgents([{ id: "codex", name: "Codex", available: true }]),
    createAgentApplied({ files: ["src/components/Card.tsx"], summary: "收紧间距", at: 3_000 }),
    createAgentCapture({ captureId: "cap-1", withScreenshot: true }),
    createAgentCaptureResult({
      captureId: "cap-1",
      selection: null,
      changes: [],
      screenshot: "data:image/png;base64,AAA",
    }),
    createChangesApply({
      requestId: "req-1",
      context: {
        page: { url: "http://localhost:5173/" },
        element: {
          id: "ut-000001",
          tagName: "button",
          selector: "body > button",
          bounds: { x: 0, y: 0, width: 100, height: 40 },
        },
        styles: { gap: "24px" },
      },
      changes: [
        {
          id: "ch-1",
          elementId: "ut-000001",
          property: "gap",
          previousValue: "24px",
          nextValue: "16px",
          source: "manual",
          createdAt: 1,
        },
      ],
      instruction: "紧凑一点",
      scope: "instance",
    }),
    createApplyResult({
      requestId: "req-1",
      result: { success: true, files: ["src/Card.tsx"], summary: "done" },
    }),
    createSidepanelConfirmApply([
      {
        id: "ch-1",
        elementId: "ut-000001",
        property: "gap",
        previousValue: "24px",
        nextValue: "16px",
        source: "manual",
        createdAt: 1,
      },
    ]),
    createApplyConfirmed({ appliedChangeIds: ["ch-1"], failedChangeIds: [], reidentified: true }),
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

  it("preview.changed carries an optional instructions map", () => {
    const message = createPreviewChanged([], { "ut-1": "紧凑一点" });
    expect(message.payload.instructions).toEqual({ "ut-1": "紧凑一点" });
    expect(isPreviewChangedMessage(message)).toBe(true);
    // 缺省可省略
    expect(createPreviewChanged([]).payload.instructions).toBeUndefined();
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
    expect(createSidepanelClearSelection()).toEqual({
      type: "sidepanel.clearSelection",
      payload: {},
    });
  });

  it("creates bridge messages (plan §15/§16)", () => {
    expect(createBridgeHello({ extensionVersion: "0.1.0", pageUrl: null })).toEqual({
      type: "bridge.hello",
      payload: { extensionVersion: "0.1.0", pageUrl: null },
    });

    const project = { name: "demo", framework: "Next.js", root: "/tmp/demo" };
    expect(createBridgeWelcome({ bridgeVersion: "0.1.0", project, devServerUrl: null })).toEqual({
      type: "bridge.welcome",
      payload: { bridgeVersion: "0.1.0", project, devServerUrl: null },
    });

    expect(createBridgeSync({ selection: null, changes: [] })).toEqual({
      type: "bridge.sync",
      payload: { selection: null, changes: [] },
    });
  });

  it("creates source resolver messages (plan §19/§20)", () => {
    expect(
      createBridgeSourceResolved({
        elementId: "ut-000001",
        confidence: "exact",
        componentName: "Card",
        file: "src/components/Card.tsx",
        line: 8,
      }),
    ).toEqual({
      type: "bridge.sourceResolved",
      payload: {
        elementId: "ut-000001",
        confidence: "exact",
        componentName: "Card",
        file: "src/components/Card.tsx",
        line: 8,
      },
    });

    // Inferred / unknown never fabricate a location (plan §20).
    expect(
      createBridgeSourceResolved({ elementId: "ut-9", confidence: "unknown" }).payload,
    ).toEqual({ elementId: "ut-9", confidence: "unknown" });
  });

  it("creates agent messages (plan §23–§27)", () => {
    expect(
      createAgentRequest({
        instruction: "紧凑一点",
        include: { dom: true, styles: true, source: true, screenshot: false, parentTree: false },
        contextLevel: 2,
        sentAt: 7,
      }),
    ).toEqual({
      type: "agent.request",
      payload: {
        instruction: "紧凑一点",
        include: { dom: true, styles: true, source: true, screenshot: false, parentTree: false },
        contextLevel: 2,
        sentAt: 7,
      },
    });

    expect(createBridgeAgents([{ id: "codex", name: "Codex", available: false }])).toEqual({
      type: "bridge.agents",
      payload: { agents: [{ id: "codex", name: "Codex", available: false }] },
    });

    expect(createAgentApplied({ files: [], summary: "s", at: 1 })).toEqual({
      type: "agent.applied",
      payload: { files: [], summary: "s", at: 1 },
    });

    expect(createAgentCapture({ captureId: "c", withScreenshot: false })).toEqual({
      type: "agent.capture",
      payload: { captureId: "c", withScreenshot: false },
    });

    expect(createAgentCaptureResult({ captureId: "c", selection: null, changes: [] })).toEqual({
      type: "agent.captureResult",
      payload: { captureId: "c", selection: null, changes: [] },
    });
  });

  it("creates apply messages (plan §17/§45/§46)", () => {
    const context: ApplyElementContext = {
      page: { url: "http://localhost:5173/" },
      element: {
        id: "ut-000001",
        tagName: "button",
        selector: "body > button",
        bounds: { x: 0, y: 0, width: 100, height: 40 },
      },
      component: { name: "Card", source: { file: "src/components/Card.tsx", line: 10 } },
      styles: { gap: "24px" },
    };
    const change: StyleChange = {
      id: "ch-1",
      elementId: "ut-000001",
      property: "gap",
      previousValue: "24px",
      nextValue: "16px",
      source: "manual",
      createdAt: 1,
    };

    expect(
      createChangesApply({
        requestId: "req-1",
        context,
        changes: [change],
        instruction: "紧凑一点",
        scope: "component",
      }),
    ).toEqual({
      type: "changes.apply",
      payload: {
        requestId: "req-1",
        context,
        changes: [change],
        instruction: "紧凑一点",
        scope: "component",
      },
    });

    expect(
      createApplyResult({
        requestId: "req-1",
        result: { success: false, error: { code: "SOURCE_NOT_FOUND", message: "no source" } },
      }).payload.result.error?.code,
    ).toBe("SOURCE_NOT_FOUND");

    expect(createSidepanelConfirmApply([change])).toEqual({
      type: "sidepanel.confirmApply",
      payload: { changes: [change] },
    });

    expect(
      createApplyConfirmed({ appliedChangeIds: ["ch-1"], failedChangeIds: ["ch-2"], reidentified: false }),
    ).toEqual({
      type: "apply.confirmed",
      payload: { appliedChangeIds: ["ch-1"], failedChangeIds: ["ch-2"], reidentified: false },
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
    expect(isUiTunerMessage({ type: "bridge.shutdown", payload: {} })).toBe(false);
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
    expect(messages.filter(isSidepanelClearSelectionMessage)).toHaveLength(1);
    expect(messages.filter(isBridgeHelloMessage)).toHaveLength(1);
    expect(messages.filter(isBridgeWelcomeMessage)).toHaveLength(1);
    expect(messages.filter(isBridgeSyncMessage)).toHaveLength(1);
    expect(messages.filter(isBridgeSourceResolvedMessage)).toHaveLength(1);
    expect(messages.filter(isAgentRequestMessage)).toHaveLength(1);
    expect(messages.filter(isBridgeAgentsMessage)).toHaveLength(1);
    expect(messages.filter(isAgentAppliedMessage)).toHaveLength(1);
    expect(messages.filter(isAgentCaptureMessage)).toHaveLength(1);
    expect(messages.filter(isAgentCaptureResultMessage)).toHaveLength(1);
    expect(messages.filter(isChangesApplyMessage)).toHaveLength(1);
    expect(messages.filter(isApplyResultMessage)).toHaveLength(1);
    expect(messages.filter(isSidepanelConfirmApplyMessage)).toHaveLength(1);
    expect(messages.filter(isApplyConfirmedMessage)).toHaveLength(1);
  });
});

describe("port name", () => {
  it("is stable", () => {
    expect(UI_TUNER_PORT_NAME).toBe("ui-tuner");
  });
});

describe("assembleAgentContext (plan §26)", () => {
  const selection: SelectionPayload = {
    element: {
      id: "ut-000001",
      tagName: "div",
      selector: "body > div.card",
      bounds: { x: 0, y: 0, width: 200, height: 100 },
    },
    breadcrumb: [
      { tagName: "div", id: "ut-000001" },
      { tagName: "main", id: "ut-000002" },
    ],
    styles: { gap: "24px", padding: "24px", "border-radius": "16px", "font-size": "16px" },
    dom: { outerHTML: '<div class="card">…</div>' },
    pickedAt: 1,
  };
  const changes: StyleChange[] = [
    {
      id: "ch-1",
      elementId: "ut-000001",
      property: "gap",
      previousValue: "24px",
      nextValue: "16px",
      source: "manual",
      createdAt: 1,
    },
  ];

  it("renders the §26 layout for an exact-resolved element", () => {
    const text = assembleAgentContext({
      selection,
      source: {
        elementId: "ut-000001",
        confidence: "exact",
        componentName: "PricingCard",
        file: "src/components/PricingCard.tsx",
        line: 42,
      },
      changes,
      instruction: "整体紧凑一点，标题不要变小",
    });
    expect(text).toContain("Selected Component:\nPricingCard");
    expect(text).toContain("Source:\nsrc/components/PricingCard.tsx:42");
    expect(text).toContain("User preview changes:\ngap: 24px → 16px");
    expect(text).toContain("Instruction:\n整体紧凑一点，标题不要变小");
  });

  it("falls back to the element tag when the component is unknown", () => {
    const text = assembleAgentContext({
      selection,
      source: { elementId: "ut-000001", confidence: "unknown" },
      changes: [],
      instruction: "",
    });
    expect(text).toContain("Selected Component:\n<div> (body > div.card)");
    expect(text).not.toContain("Source:");
    expect(text).toContain("User preview changes:\n(none yet)");
    expect(text).toContain("(none — apply the preview changes above)");
  });

  it("honestly reports when nothing is selected", () => {
    const text = assembleAgentContext({ selection: null, source: null, changes: [], instruction: "" });
    expect(text).toContain("(none — pick an element in the browser first)");
  });

  it("omits the DOM block when include.dom is false", () => {
    const text = assembleAgentContext({
      selection,
      source: null,
      changes: [],
      instruction: "x",
      include: { dom: false, styles: true, source: true, screenshot: false, parentTree: false },
    });
    expect(text).not.toContain("DOM:");
  });

  it("adds parent tree + DOM at level 2, screenshot note at level 3", () => {
    const l2 = assembleAgentContext({
      selection,
      source: null,
      changes: [],
      instruction: "",
      level: 2,
      include: { dom: true, styles: true, source: true, screenshot: false, parentTree: true },
    });
    expect(l2).toContain("Parent tree (nearest first):");
    const l3 = assembleAgentContext({
      selection,
      source: null,
      changes: [],
      instruction: "",
      level: 3,
      include: { dom: true, styles: true, source: true, screenshot: true, parentTree: true },
    });
    expect(l3).toContain("ui_capture");
  });
});
