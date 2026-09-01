import { create } from "zustand";
import {
  createAgentCaptureResult,
  createAgentRequest,
  createBridgeHello,
  createBridgeSync,
  createSidepanelPing,
  createSidepanelPicking,
  createSidepanelResetChanges,
  createSidepanelRevertChange,
  createSidepanelRevertElement,
  createSidepanelSelectAncestor,
  createSidepanelStylePreview,
  isAgentAppliedMessage,
  isAgentCaptureMessage,
  isBridgeAgentsMessage,
  isBridgeSourceResolvedMessage,
  isBridgeWelcomeMessage,
  isContentPongMessage,
  isContentReadyMessage,
  isPickerStateMessage,
  isPreviewChangedMessage,
  isSelectionChangedMessage,
  isSelectionClearedMessage,
  type AgentInclude,
  type AgentInfo,
  type BridgeProject,
  type ContextLevel,
  type SelectionPayload,
  type SourceResolution,
  type StyleChange,
  type UiTunerMessage,
} from "@ui-tuner/protocol";
import { Channel } from "../messaging/channel";
import { BridgeChannel } from "../messaging/bridge-channel";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected";
export type BridgeStatus = "offline" | "connecting" | "connected";

export interface LogEntry {
  id: number;
  direction: "out" | "in";
  type: UiTunerMessage["type"];
  at: number;
}

const MAX_LOG_ENTRIES = 50;

interface SidepanelState {
  status: ConnectionStatus;
  /** Why the connection failed / dropped, shown when status is "disconnected". */
  statusError: string | null;
  pageTitle: string | null;
  pageUrl: string | null;
  lastRttMs: number | null;
  log: LogEntry[];
  /** Pick mode is on: click a page element to select it. */
  picking: boolean;
  /** Current selection, or null when nothing is selected. */
  selection: SelectionPayload | null;
  /** Committed style values for the selected element — scrub frames don't touch this. */
  styleValues: Record<string, string> | null;
  /** Page-side change records (content is the source of truth, plan §12). */
  changes: StyleChange[];
  /** elementId → tagName, accumulated from selections (Changes tab labels). */
  elementNames: Record<string, string>;
  /** Local bridge link state (plan §35: offline never blocks preview editing). */
  bridgeStatus: BridgeStatus;
  bridgeProject: BridgeProject | null;
  bridgeDevServerUrl: string | null;
  /**
   * Source location of the current selection (plan §19/§20), reported by the
   * bridge after each sync. null = not resolved yet / bridge offline / no
   * selection — the header then shows "Preview only".
   */
  source: SourceResolution | null;

  // --- M7 Agent tab (plan §23–§27) -----------------------------------------
  /** Coding agents the bridge detected (plan §44); empty until bridge.agents. */
  agents: AgentInfo[];
  /** Agent tab instruction draft (bound to the textarea). */
  agentInstruction: string;
  /** Agent tab include flags (plan §23). */
  agentInclude: AgentInclude;
  /** Agent tab context depth (plan §24 default Level 1). */
  agentContextLevel: ContextLevel;
  /** Last agent.request actually handed to the bridge, for the "sent" state. */
  agentSent: { instruction: string; at: number } | null;
  /** Latest ui_notify_applied report relayed from an agent (plan §27). */
  lastApplied: { files: string[]; summary: string; at: number } | null;

  /** Wire an already-opened channel (App owns chrome.tabs lookup). */
  connect: (channel: Channel) => void;
  /** Attach the local bridge socket; hello/welcome handshake + state mirror. */
  attachBridge: (
    channel: BridgeChannel,
    info: { extensionVersion: string; pageUrl: string | null },
  ) => void;
  /** Test/DI entry point: handle an incoming message directly. */
  receive: (message: UiTunerMessage) => void;
  ping: () => void;
  /** Enter / leave pick mode. State updates on the `picker.state` ack. */
  setPicking: (enabled: boolean) => void;
  /** Breadcrumb jump: select the ancestor with this uiTunerId. */
  selectAncestor: (uiTunerId: string) => void;
  /**
   * Send one style value for the selected element (plan §10/§11). Preview
   * frames (committed=false) only hit the page; commits also update
   * `styleValues` locally.
   */
  updateStyle: (property: string, value: string | null, committed: boolean) => void;
  /** Revert one recorded change (plan §14). */
  revertChange: (changeId: string) => void;
  /** Revert every change of one element (plan §14). */
  revertElement: (elementId: string) => void;
  /** Reset all preview changes (plan §13/§14). */
  resetChanges: () => void;
  /** Update the Agent tab instruction draft. */
  setAgentInstruction: (value: string) => void;
  /** Toggle one Agent tab include flag (plan §23). */
  setAgentInclude: (key: keyof AgentInclude, value: boolean) => void;
  /** Set the Agent tab context depth (plan §25). */
  setAgentContextLevel: (level: ContextLevel) => void;
  /** Send the Agent tab request to the bridge over WS (plan §24/§26). */
  sendAgentRequest: () => void;
  /** Dismiss the "agent applied" banner. */
  dismissApplied: () => void;
  /** Drop the channel and return to idle. */
  reset: () => void;
}

let channel: Channel | null = null;
let bridgeChannel: BridgeChannel | null = null;
let nextLogId = 1;

/**
 * Screenshot capturer injected by the App layer (chrome.tabs.captureVisibleTab
 * lives behind the chrome API, which the store must not import). Returns a
 * dataURL PNG, or undefined when capture is unavailable.
 */
export type CaptureHandler = (withScreenshot: boolean) => Promise<string | undefined>;
let captureHandler: CaptureHandler | null = null;
export function registerCaptureHandler(handler: CaptureHandler | null): void {
  captureHandler = handler;
}

const DEFAULT_AGENT_INCLUDE: AgentInclude = {
  dom: true,
  styles: true,
  source: true,
  screenshot: false,
  parentTree: false,
};

function appendLog(log: LogEntry[], direction: "out" | "in", message: UiTunerMessage): LogEntry[] {
  const entry: LogEntry = { id: nextLogId++, direction, type: message.type, at: Date.now() };
  const next = [...log, entry];
  return next.length > MAX_LOG_ENTRIES ? next.slice(next.length - MAX_LOG_ENTRIES) : next;
}

/** Remember elementId → tagName from a selection (element + breadcrumb). */
function rememberElementNames(
  names: Record<string, string>,
  payload: SelectionPayload,
): Record<string, string> {
  const next = { ...names };
  for (const item of payload.breadcrumb) next[item.id] = item.tagName;
  return next;
}

/** Mirror selection + change records to the bridge (M5 acceptance, §16). */
function sendBridgeSync(): void {
  if (!bridgeChannel) return;
  const { selection, changes } = useSidepanelStore.getState();
  bridgeChannel.send(createBridgeSync({ selection, changes }));
}

/** Reply to a bridge ui_capture request (M7, plan §27) with fresh state. */
async function respondToCapture(payload: {
  captureId: string;
  withScreenshot: boolean;
}): Promise<void> {
  if (!bridgeChannel) return;
  const { selection, changes } = useSidepanelStore.getState();
  let screenshot: string | undefined;
  if (payload.withScreenshot && captureHandler) {
    try {
      screenshot = await captureHandler(true);
    } catch {
      screenshot = undefined; // capture failed — reply without it, honestly.
    }
  }
  bridgeChannel.send(
    createAgentCaptureResult({
      captureId: payload.captureId,
      selection,
      changes,
      ...(screenshot !== undefined ? { screenshot } : {}),
    }),
  );
}

export const useSidepanelStore = create<SidepanelState>((set, get) => ({
  status: "idle",
  statusError: null,
  pageTitle: null,
  pageUrl: null,
  lastRttMs: null,
  log: [],
  picking: false,
  selection: null,
  styleValues: null,
  changes: [],
  elementNames: {},
  bridgeStatus: "offline",
  bridgeProject: null,
  bridgeDevServerUrl: null,
  source: null,
  agents: [],
  agentInstruction: "",
  agentInclude: DEFAULT_AGENT_INCLUDE,
  agentContextLevel: 1,
  agentSent: null,
  lastApplied: null,

  attachBridge: (nextBridgeChannel, info) => {
    bridgeChannel = nextBridgeChannel;
    set({ bridgeStatus: "connecting", bridgeProject: null, bridgeDevServerUrl: null });

    nextBridgeChannel.onOpen(() => {
      set({ bridgeStatus: "connected" });
      nextBridgeChannel.send(
        createBridgeHello({ extensionVersion: info.extensionVersion, pageUrl: info.pageUrl }),
      );
      sendBridgeSync();
    });
    nextBridgeChannel.onMessage((message) => {
      if (isBridgeWelcomeMessage(message)) {
        set({
          bridgeProject: message.payload.project,
          bridgeDevServerUrl: message.payload.devServerUrl,
        });
      } else if (isBridgeSourceResolvedMessage(message)) {
        // Stale guard: only apply if it still matches the live selection —
        // a fast re-select can overtake the bridge's resolution.
        if (message.payload.elementId === get().selection?.element.id) {
          set({ source: message.payload });
        }
      } else if (isBridgeAgentsMessage(message)) {
        set({ agents: message.payload.agents });
      } else if (isAgentAppliedMessage(message)) {
        set({ lastApplied: message.payload });
      } else if (isAgentCaptureMessage(message)) {
        void respondToCapture(message.payload);
      }
    });
    const dropOffline = () => {
      if (bridgeChannel === nextBridgeChannel)
        set({
          bridgeStatus: "offline",
          bridgeProject: null,
          bridgeDevServerUrl: null,
          source: null,
          agents: [],
        });
    };
    nextBridgeChannel.onClose(dropOffline);
    nextBridgeChannel.onError(dropOffline);
  },

  connect: (nextChannel) => {
    channel = nextChannel;
    set({
      status: "connecting",
      statusError: null,
      pageTitle: null,
      pageUrl: null,
      lastRttMs: null,
      log: [],
      picking: false,
      selection: null,
      styleValues: null,
      changes: [],
      elementNames: {},
      source: null,
    });
    nextChannel.onDisconnect(() => {
      if (channel === nextChannel)
        set({ status: "disconnected", statusError: "Connection closed", picking: false });
    });
    nextChannel.onMessage((message) => get().receive(message));
  },

  receive: (message) => {
    set((state) => ({ log: appendLog(state.log, "in", message) }));
    if (isContentReadyMessage(message)) {
      set({ status: "connected", pageTitle: message.payload.title, pageUrl: message.payload.url });
    } else if (isContentPongMessage(message)) {
      set({ lastRttMs: Math.max(0, Date.now() - message.payload.sentAt) });
    } else if (isPickerStateMessage(message)) {
      set({ picking: message.payload.enabled });
    } else if (isSelectionChangedMessage(message)) {
      set((state) => ({
        selection: message.payload,
        styleValues: message.payload.styles,
        picking: false,
        elementNames: rememberElementNames(state.elementNames, message.payload),
        // Pending: the bridge re-resolves source for the new selection.
        source: null,
      }));
      sendBridgeSync();
    } else if (isSelectionClearedMessage(message)) {
      set({ selection: null, styleValues: null, source: null });
      sendBridgeSync();
    } else if (isPreviewChangedMessage(message)) {
      set({ changes: message.payload.changes });
      sendBridgeSync();
    }
  },

  ping: () => {
    if (!channel) return;
    const message = createSidepanelPing({ sentAt: Date.now() });
    channel.send(message);
    set((state) => ({ log: appendLog(state.log, "out", message) }));
  },

  setPicking: (enabled) => {
    if (!channel) return;
    const message = createSidepanelPicking(enabled);
    channel.send(message);
    set((state) => ({ log: appendLog(state.log, "out", message) }));
  },

  selectAncestor: (uiTunerId) => {
    if (!channel) return;
    const message = createSidepanelSelectAncestor(uiTunerId);
    channel.send(message);
    set((state) => ({ log: appendLog(state.log, "out", message) }));
  },

  updateStyle: (property, value, committed) => {
    const elementId = get().selection?.element.id;
    if (!channel || !elementId) return;
    const message = createSidepanelStylePreview({
      uiTunerId: elementId,
      property,
      value,
      committed,
    });
    channel.send(message);
    set((state) => {
      const log = appendLog(state.log, "out", message);
      if (!committed || !state.styleValues) return { log };
      const styleValues = { ...state.styleValues };
      if (value === null) delete styleValues[property];
      else styleValues[property] = value;
      return { log, styleValues };
    });
  },

  revertChange: (changeId) => {
    if (!channel) return;
    const message = createSidepanelRevertChange(changeId);
    channel.send(message);
    set((state) => ({ log: appendLog(state.log, "out", message) }));
  },

  revertElement: (elementId) => {
    if (!channel) return;
    const message = createSidepanelRevertElement(elementId);
    channel.send(message);
    set((state) => ({ log: appendLog(state.log, "out", message) }));
  },

  resetChanges: () => {
    if (!channel) return;
    const message = createSidepanelResetChanges();
    channel.send(message);
    set((state) => ({ log: appendLog(state.log, "out", message) }));
  },

  setAgentInstruction: (value) => {
    set({ agentInstruction: value });
  },

  setAgentInclude: (key, value) => {
    set((state) => ({ agentInclude: { ...state.agentInclude, [key]: value } }));
  },

  setAgentContextLevel: (level) => {
    set({ agentContextLevel: level });
  },

  sendAgentRequest: () => {
    const { agentInstruction, agentInclude, agentContextLevel, bridgeStatus } = get();
    if (!bridgeChannel || bridgeStatus !== "connected") return;
    const instruction = agentInstruction.trim();
    const message = createAgentRequest({
      instruction,
      include: agentInclude,
      contextLevel: agentContextLevel,
      sentAt: Date.now(),
    });
    bridgeChannel.send(message);
    // Honest state: this means "handed to the bridge", not "applied by agent".
    set((state) => ({
      log: appendLog(state.log, "out", message),
      agentSent: { instruction, at: message.payload.sentAt },
    }));
  },

  dismissApplied: () => {
    set({ lastApplied: null });
  },

  reset: () => {
    channel = null;
    bridgeChannel?.close();
    bridgeChannel = null;
    set({
      status: "idle",
      statusError: null,
      pageTitle: null,
      pageUrl: null,
      lastRttMs: null,
      log: [],
      picking: false,
      selection: null,
      styleValues: null,
      changes: [],
      elementNames: {},
      bridgeStatus: "offline",
      bridgeProject: null,
      bridgeDevServerUrl: null,
      source: null,
      agents: [],
      agentInstruction: "",
      agentInclude: DEFAULT_AGENT_INCLUDE,
      agentContextLevel: 1,
      agentSent: null,
      lastApplied: null,
    });
  },
}));

/** Record a connection failure from the chrome layer without an open channel. */
export function reportConnectFailure(reason: string): void {
  channel = null;
  bridgeChannel?.close();
  bridgeChannel = null;
  useSidepanelStore.setState({
    status: "disconnected",
    statusError: reason,
    pageTitle: null,
    pageUrl: null,
    lastRttMs: null,
    log: [],
    picking: false,
    selection: null,
    styleValues: null,
    changes: [],
    elementNames: {},
    bridgeStatus: "offline",
    bridgeProject: null,
    bridgeDevServerUrl: null,
    source: null,
    agents: [],
    agentSent: null,
    lastApplied: null,
  });
}
