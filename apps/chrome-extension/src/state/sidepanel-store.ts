import { create } from "zustand";
import {
  createBridgeHello,
  createBridgeSync,
  createSidepanelPing,
  createSidepanelPicking,
  createSidepanelResetChanges,
  createSidepanelRevertChange,
  createSidepanelRevertElement,
  createSidepanelSelectAncestor,
  createSidepanelStylePreview,
  isBridgeWelcomeMessage,
  isContentPongMessage,
  isContentReadyMessage,
  isPickerStateMessage,
  isPreviewChangedMessage,
  isSelectionChangedMessage,
  isSelectionClearedMessage,
  type BridgeProject,
  type SelectionPayload,
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
  /** Drop the channel and return to idle. */
  reset: () => void;
}

let channel: Channel | null = null;
let bridgeChannel: BridgeChannel | null = null;
let nextLogId = 1;

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
      }
    });
    const dropOffline = () => {
      if (bridgeChannel === nextBridgeChannel)
        set({ bridgeStatus: "offline", bridgeProject: null, bridgeDevServerUrl: null });
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
      }));
      sendBridgeSync();
    } else if (isSelectionClearedMessage(message)) {
      set({ selection: null, styleValues: null });
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
  });
}
