import { describe, expect, it } from "vitest";
import {
  createAgentApplied,
  createAgentCapture,
  createApplyConfirmed,
  createApplyResult,
  createBridgeAgents,
  createBridgeSourceResolved,
  createBridgeWelcome,
  createContentPong,
  createContentReady,
  createPickerState,
  createPreviewChanged,
  createSelectionChanged,
  createSelectionCleared,
  type StyleChange,
} from "@ui-tuner/protocol";
import { BridgeChannel } from "../messaging/bridge-channel";
import type { WebSocketLike } from "../messaging/bridge-channel";
import { Channel } from "../messaging/channel";
import type { PortLike } from "../messaging/channel";
import { registerCaptureHandler, useSidepanelStore } from "./sidepanel-store";

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

  it("stores the selection and keeps picking on selection.changed (annotation mode persists)", () => {
    resetStore();
    useSidepanelStore.getState().receive(createPickerState(true));
    selectElement({ gap: "24px" });

    const state = useSidepanelStore.getState();
    // Annotation mode persists across selections — only picker.state acks
    // (Esc / panel toggle) turn it off.
    expect(state.picking).toBe(true);
    expect(state.selection?.element.tagName).toBe("button");
    expect(state.selection?.breadcrumb).toHaveLength(2);
  });

  it("stores the selection's styles on selection.changed", () => {
    resetStore();
    selectElement({ gap: "24px", "font-size": "16px" });
    expect(useSidepanelStore.getState().selection?.styles).toEqual({
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
    expect(state.changes).toEqual([]);
    expect(state.log).toHaveLength(0);
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

  it("stores instructions from preview.changed", () => {
    resetStore();
    useSidepanelStore
      .getState()
      .receive(createPreviewChanged([], { "ut-1": "紧凑一点" }));
    expect(useSidepanelStore.getState().instructions).toEqual({ "ut-1": "紧凑一点" });
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

  it("handshakes the bridge and mirrors selection + changes (M5 acceptance)", () => {
    resetStore();
    const socket = new FakeSocket();
    const bridge = BridgeChannel.accept(socket);
    useSidepanelStore.getState().attachBridge(bridge, {
      extensionVersion: "0.1.0",
      pageUrl: "http://localhost:5173/",
    });
    expect(useSidepanelStore.getState().bridgeStatus).toBe("connecting");

    socket.open();
    // hello goes out on open, followed by the initial (empty) sync.
    expect(socket.sent).toEqual([
      {
        type: "bridge.hello",
        payload: { extensionVersion: "0.1.0", pageUrl: "http://localhost:5173/" },
      },
      { type: "bridge.sync", payload: { selection: null, changes: [], instructions: {} } },
    ]);
    expect(useSidepanelStore.getState().bridgeStatus).toBe("connected");

    // welcome fills in the project card.
    socket.message(
      JSON.stringify(
        createBridgeWelcome({
          bridgeVersion: "0.1.0",
          project: { name: "demo", framework: "Vite", root: "/tmp/demo" },
          devServerUrl: "http://localhost:5173",
        }),
      ),
    );
    const state = useSidepanelStore.getState();
    expect(state.bridgeProject?.framework).toBe("Vite");
    expect(state.bridgeDevServerUrl).toBe("http://localhost:5173");

    // page-side events are mirrored to the bridge.
    socket.sent.length = 0;
    selectElement({ gap: "24px" });
    expect(socket.sent.at(-1)).toMatchObject({ type: "bridge.sync" });
    expect(
      (socket.sent.at(-1) as { payload: { selection: { element: { id: string } } } }).payload
        .selection.element.id,
    ).toBe("ut-000001");

    // closing the socket never blocks preview editing (plan §35).
    socket.close();
    const offline = useSidepanelStore.getState();
    expect(offline.bridgeStatus).toBe("offline");
    expect(offline.bridgeProject).toBeNull();
  });

  it("stores bridge.sourceResolved only when it matches the live selection (plan §20)", () => {
    resetStore();
    const socket = new FakeSocket();
    useSidepanelStore.getState().attachBridge(BridgeChannel.accept(socket), {
      extensionVersion: "0.1.0",
      pageUrl: null,
    });
    socket.open();
    selectElement({ gap: "24px" });
    expect(useSidepanelStore.getState().source).toBeNull(); // pending resolution

    socket.message(
      JSON.stringify(
        createBridgeSourceResolved({
          elementId: "ut-000001",
          confidence: "exact",
          componentName: "Card",
          file: "src/components/Card.tsx",
          line: 8,
        }),
      ),
    );
    expect(useSidepanelStore.getState().source).toMatchObject({
      confidence: "exact",
      componentName: "Card",
      file: "src/components/Card.tsx",
      line: 8,
    });

    // A resolution for another (stale) element is ignored — never fabricate.
    socket.message(
      JSON.stringify(
        createBridgeSourceResolved({
          elementId: "ut-999999",
          confidence: "inferred",
          file: "src/other.tsx",
        }),
      ),
    );
    expect(useSidepanelStore.getState().source?.file).toBe("src/components/Card.tsx");
  });

  it("clears source on reselect, selection clear, and bridge drop", () => {
    resetStore();
    const socket = new FakeSocket();
    useSidepanelStore.getState().attachBridge(BridgeChannel.accept(socket), {
      extensionVersion: "0.1.0",
      pageUrl: null,
    });
    socket.open();
    selectElement({ gap: "24px" });
    socket.message(
      JSON.stringify(
        createBridgeSourceResolved({
          elementId: "ut-000001",
          confidence: "inferred",
          file: "src/components/Card.tsx",
        }),
      ),
    );
    expect(useSidepanelStore.getState().source).not.toBeNull();

    // Reselecting invalidates the previous resolution (bridge re-resolves).
    selectElement({ gap: "24px" });
    expect(useSidepanelStore.getState().source).toBeNull();

    socket.message(
      JSON.stringify(
        createBridgeSourceResolved({
          elementId: "ut-000001",
          confidence: "unknown",
        }),
      ),
    );
    expect(useSidepanelStore.getState().source?.confidence).toBe("unknown");

    useSidepanelStore.getState().receive(createSelectionCleared());
    expect(useSidepanelStore.getState().source).toBeNull();

    socket.close();
    expect(useSidepanelStore.getState().source).toBeNull();
    expect(useSidepanelStore.getState().bridgeStatus).toBe("offline");
  });
});

describe("sidepanel store — M7 agent (plan §23–§27)", () => {
  /** Open a fake bridge connection and return its socket. */
  function openBridge(): FakeSocket {
    const socket = new FakeSocket();
    useSidepanelStore.getState().attachBridge(BridgeChannel.accept(socket), {
      extensionVersion: "0.1.0",
      pageUrl: null,
    });
    socket.open();
    return socket;
  }

  it("fills agents from bridge.agents and clears them on offline", () => {
    resetStore();
    const socket = openBridge();
    socket.message(
      JSON.stringify(
        createBridgeAgents([
          { id: "codex", name: "Codex", available: true },
          { id: "claude-code", name: "Claude Code", available: false },
        ]),
      ),
    );
    expect(useSidepanelStore.getState().agents.map((a) => a.id)).toEqual([
      "codex",
      "claude-code",
    ]);

    socket.close();
    expect(useSidepanelStore.getState().agents).toEqual([]);
  });

  it("sendAgentRequest hands the request to the bridge and records sent state", () => {
    resetStore();
    const socket = openBridge();
    useSidepanelStore.getState().setAgentInstruction("  整体紧凑一点  ");
    useSidepanelStore.getState().setAgentInclude("screenshot", true);
    useSidepanelStore.getState().setAgentContextLevel(2);

    socket.sent.length = 0;
    useSidepanelStore.getState().sendAgentRequest();

    const sent = socket.sent.at(-1) as {
      type: string;
      payload: { instruction: string; include: { screenshot: boolean }; contextLevel: number };
    };
    expect(sent.type).toBe("agent.request");
    expect(sent.payload.instruction).toBe("整体紧凑一点"); // trimmed
    expect(sent.payload.include.screenshot).toBe(true);
    expect(sent.payload.contextLevel).toBe(2);
    expect(useSidepanelStore.getState().agentSent?.instruction).toBe("整体紧凑一点");
  });

  it("sendAgentRequest is a no-op when the bridge is offline", () => {
    resetStore();
    useSidepanelStore.getState().setAgentInstruction("x");
    useSidepanelStore.getState().sendAgentRequest();
    expect(useSidepanelStore.getState().agentSent).toBeNull();
  });

  it("agent.applied surfaces a banner until dismissed", () => {
    resetStore();
    const socket = openBridge();
    socket.message(
      JSON.stringify(createAgentApplied({ files: ["a.tsx"], summary: "收紧间距", at: 5 })),
    );
    expect(useSidepanelStore.getState().lastApplied?.summary).toBe("收紧间距");

    useSidepanelStore.getState().dismissApplied();
    expect(useSidepanelStore.getState().lastApplied).toBeNull();
  });

  it("agent.capture replies with fresh selection + changes + injected screenshot", async () => {
    resetStore();
    const socket = openBridge();
    registerCaptureHandler(() => Promise.resolve("data:image/png;base64,iVBORw0KGgo="));
    selectElement({ gap: "24px" });
    useSidepanelStore
      .getState()
      .receive(
        createPreviewChanged([
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
      );

    socket.sent.length = 0;
    socket.message(JSON.stringify(createAgentCapture({ captureId: "cap-1", withScreenshot: true })));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const reply = socket.sent.at(-1) as {
      type: string;
      payload: { captureId: string; screenshot?: string; changes: unknown[] };
    };
    expect(reply.type).toBe("agent.captureResult");
    expect(reply.payload.captureId).toBe("cap-1");
    expect(reply.payload.screenshot).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(reply.payload.changes).toHaveLength(1);
    registerCaptureHandler(null);
  });

  it("agent.capture without a registered handler replies without a screenshot", async () => {
    resetStore();
    const socket = openBridge();
    registerCaptureHandler(null);
    socket.sent.length = 0;
    socket.message(JSON.stringify(createAgentCapture({ captureId: "cap-2", withScreenshot: true })));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const reply = socket.sent.at(-1) as { payload: { screenshot?: string } };
    expect(reply.payload.screenshot).toBeUndefined();
  });
});

describe("sidepanel store — M8 apply to code (plan §29/§30/§31)", () => {
  function openBridge(): FakeSocket {
    const socket = new FakeSocket();
    useSidepanelStore.getState().attachBridge(BridgeChannel.accept(socket), {
      extensionVersion: "0.1.0",
      pageUrl: "http://localhost:5173/",
    });
    socket.open();
    return socket;
  }

  function withSelectionAndChange(): void {
    selectElement({ gap: "24px" });
    useSidepanelStore.getState().receive(
      createPreviewChanged([
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
    );
  }

  it("applyChanges sends changes.apply for the selected element and enters applying", () => {
    resetStore();
    const socket = openBridge();
    useSidepanelStore.getState().setAgentInstruction("紧凑一点");
    withSelectionAndChange();

    socket.sent.length = 0;
    useSidepanelStore.getState().applyChanges("instance");

    const sent = socket.sent.at(-1) as {
      type: string;
      payload: {
        requestId: string;
        scope: string;
        instruction?: string;
        changes: { elementId: string }[];
        context: { component?: { name?: string } };
      };
    };
    expect(sent.type).toBe("changes.apply");
    expect(sent.payload.scope).toBe("instance");
    expect(sent.payload.instruction).toBe("紧凑一点");
    expect(sent.payload.changes).toHaveLength(1);
    expect(useSidepanelStore.getState().applyState).toBe("applying");
    expect(useSidepanelStore.getState().applyRequestId).toBe(sent.payload.requestId);
  });

  it("applyChanges is a no-op without bridge, selection, or changes/instruction", () => {
    resetStore();
    useSidepanelStore.getState().applyChanges("instance"); // no bridge
    expect(useSidepanelStore.getState().applyState).toBe("idle");

    const socket = openBridge();
    selectElement({ gap: "24px" }); // selection but no changes
    socket.sent.length = 0;
    useSidepanelStore.getState().applyChanges("instance");
    expect(useSidepanelStore.getState().applyState).toBe("idle");
    expect(socket.sent.some((m) => (m as { type: string }).type === "changes.apply")).toBe(false);
  });

  it("applyChanges sends an instruction-only request when the element has no property changes", () => {
    resetStore();
    const socket = openBridge();
    selectElement({ gap: "24px" });
    // The card saved an instruction for this element, with zero change records.
    useSidepanelStore
      .getState()
      .receive(createPreviewChanged([], { "ut-000001": "把这个改成主按钮" }));

    socket.sent.length = 0;
    useSidepanelStore.getState().applyChanges("instance");

    const sent = socket.sent.at(-1) as {
      type: string;
      payload: { changes: unknown[]; instruction?: string };
    };
    expect(sent.type).toBe("changes.apply");
    expect(sent.payload.changes).toHaveLength(0);
    expect(sent.payload.instruction).toBe("把这个改成主按钮");
    expect(useSidepanelStore.getState().applyState).toBe("applying");
  });

  it("applyChanges composes the per-element card instruction ahead of the global note", () => {
    resetStore();
    const socket = openBridge();
    useSidepanelStore.getState().setAgentInstruction("全局备注");
    withSelectionAndChange();
    // The card-saved instruction for this element arrives via preview.changed.
    useSidepanelStore.getState().receive(
      createPreviewChanged(
        [
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
        { "ut-000001": "圆角更大" },
      ),
    );

    socket.sent.length = 0;
    useSidepanelStore.getState().applyChanges("instance");

    const sent = socket.sent.at(-1) as { payload: { instruction?: string } };
    // Element instruction first, then the global Agent-tab note.
    expect(sent.payload.instruction).toBe("圆角更大\n全局备注");
  });

  it("applyChanges sends only the per-element instruction when no global note", () => {
    resetStore();
    const socket = openBridge();
    withSelectionAndChange();
    useSidepanelStore.getState().receive(
      createPreviewChanged(
        [
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
        { "ut-000001": "圆角更大" },
      ),
    );

    socket.sent.length = 0;
    useSidepanelStore.getState().applyChanges("instance");

    const sent = socket.sent.at(-1) as { payload: { instruction?: string } };
    expect(sent.payload.instruction).toBe("圆角更大");
  });

  it("apply.result success marks applied and asks content to confirm", () => {
    resetStore();
    const socket = openBridge();
    const { port, sent: portSent } = createSpyPort();
    useSidepanelStore.getState().connect(Channel.accept(port));
    useSidepanelStore.getState().receive(
      createContentReady({ url: "http://localhost:5173/", title: "Demo", connectedAt: 1 }),
    );
    withSelectionAndChange();

    useSidepanelStore.getState().applyChanges("component");
    const requestId = useSidepanelStore.getState().applyRequestId!;
    portSent.length = 0;

    socket.message(
      JSON.stringify(
        createApplyResult({ requestId, result: { success: true, files: ["src/Card.tsx"], summary: "ok" } }),
      ),
    );
    expect(useSidepanelStore.getState().applyState).toBe("applied");
    expect(useSidepanelStore.getState().applyResult?.files).toEqual(["src/Card.tsx"]);
    // confirmApply went to the content script with the element's changes.
    const confirm = portSent.find((m) => (m as { type: string }).type === "sidepanel.confirmApply") as
      | { payload: { changes: unknown[] } }
      | undefined;
    expect(confirm?.payload.changes).toHaveLength(1);
  });

  it("static project (framework Unknown): apply success skips HMR confirm, flags reload, reloadPage posts to content", () => {
    resetStore();
    const socket = openBridge();
    // Static site — no HMR.
    socket.message(
      JSON.stringify(
        createBridgeWelcome({
          bridgeVersion: "0.1.0",
          project: { name: null, framework: "Unknown", root: "/tmp/static" },
          devServerUrl: "http://localhost:8080",
        }),
      ),
    );
    const { port, sent: portSent } = createSpyPort();
    useSidepanelStore.getState().connect(Channel.accept(port));
    useSidepanelStore.getState().receive(
      createContentReady({ url: "http://localhost:8080/", title: "Static", connectedAt: 1 }),
    );
    withSelectionAndChange();

    useSidepanelStore.getState().applyChanges("instance");
    const requestId = useSidepanelStore.getState().applyRequestId!;
    portSent.length = 0;

    socket.message(
      JSON.stringify(
        createApplyResult({ requestId, result: { success: true, files: ["index.html"], summary: "ok" } }),
      ),
    );

    const state = useSidepanelStore.getState();
    expect(state.applyState).toBe("applied");
    expect(state.applyNeedsReload).toBe(true);
    // No HMR on a static page — the confirm poll must not run.
    expect(portSent.some((m) => (m as { type: string }).type === "sidepanel.confirmApply")).toBe(false);

    // reloadPage asks the content script to reload so the source change renders.
    useSidepanelStore.getState().reloadPage();
    expect(portSent.some((m) => (m as { type: string }).type === "sidepanel.reloadPage")).toBe(true);
  });

  it("HMR project: applyNeedsReload stays false and confirm is sent", () => {
    resetStore();
    const socket = openBridge();
    socket.message(
      JSON.stringify(
        createBridgeWelcome({
          bridgeVersion: "0.1.0",
          project: { name: "demo", framework: "Vite", root: "/tmp/demo" },
          devServerUrl: "http://localhost:5173",
        }),
      ),
    );
    const { port } = createSpyPort();
    useSidepanelStore.getState().connect(Channel.accept(port));
    useSidepanelStore.getState().receive(
      createContentReady({ url: "http://localhost:5173/", title: "Demo", connectedAt: 1 }),
    );
    withSelectionAndChange();
    useSidepanelStore.getState().applyChanges("instance");
    const requestId = useSidepanelStore.getState().applyRequestId!;
    socket.message(
      JSON.stringify(createApplyResult({ requestId, result: { success: true, files: ["x"] } })),
    );
    expect(useSidepanelStore.getState().applyNeedsReload).toBe(false);
  });

  it("apply.result failure marks failed with the honest reason", () => {
    resetStore();
    const socket = openBridge();
    withSelectionAndChange();
    useSidepanelStore.getState().applyChanges("instance");
    const requestId = useSidepanelStore.getState().applyRequestId!;

    socket.message(
      JSON.stringify(
        createApplyResult({
          requestId,
          result: { success: false, error: { code: "SOURCE_NOT_FOUND", message: "no source" } },
        }),
      ),
    );
    expect(useSidepanelStore.getState().applyState).toBe("failed");
    expect(useSidepanelStore.getState().applyResult?.error?.code).toBe("SOURCE_NOT_FOUND");
  });

  it("ignores apply.result for a stale requestId", () => {
    resetStore();
    const socket = openBridge();
    withSelectionAndChange();
    useSidepanelStore.getState().applyChanges("instance");
    socket.message(
      JSON.stringify(createApplyResult({ requestId: "apply-999", result: { success: true } })),
    );
    expect(useSidepanelStore.getState().applyState).toBe("applying");
  });

  it("apply.confirmed records the confirmed count; clearApplyState resets", () => {
    resetStore();
    openBridge();
    withSelectionAndChange();
    useSidepanelStore.getState().applyChanges("instance");
    useSidepanelStore.setState({ applyState: "applied" });

    useSidepanelStore
      .getState()
      .receive(createApplyConfirmed({ appliedChangeIds: ["ch-1"], failedChangeIds: [], reidentified: true }));
    expect(useSidepanelStore.getState().applyConfirmedCount).toBe(1);

    useSidepanelStore.getState().clearApplyState();
    expect(useSidepanelStore.getState().applyState).toBe("idle");
    expect(useSidepanelStore.getState().applyResult).toBeNull();
    expect(useSidepanelStore.getState().applyConfirmedCount).toBeNull();
  });
});

/** Minimal WebSocketLike fake capturing everything the store sends. */
class FakeSocket implements WebSocketLike {
  readonly sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.onclose?.();
  }

  open(): void {
    this.onopen?.();
  }

  message(data: string): void {
    this.onmessage?.({ data });
  }
}
