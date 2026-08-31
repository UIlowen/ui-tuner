import { create } from "zustand";
import {
  createSidepanelPing,
  createSidepanelPicking,
  createSidepanelSelectAncestor,
  createSidepanelStylePreview,
  isContentPongMessage,
  isContentReadyMessage,
  isPickerStateMessage,
  isPreviewChangedMessage,
  isSelectionChangedMessage,
  isSelectionClearedMessage,
  type SelectionPayload,
  type StyleChange,
  type UiTunerMessage,
} from "@ui-tuner/protocol";
import { Channel } from "../messaging/channel";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected";

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

  /** Wire an already-opened channel (App owns chrome.tabs lookup). */
  connect: (channel: Channel) => void;
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
  /** Drop the channel and return to idle. */
  reset: () => void;
}

let channel: Channel | null = null;
let nextLogId = 1;

function appendLog(log: LogEntry[], direction: "out" | "in", message: UiTunerMessage): LogEntry[] {
  const entry: LogEntry = { id: nextLogId++, direction, type: message.type, at: Date.now() };
  const next = [...log, entry];
  return next.length > MAX_LOG_ENTRIES ? next.slice(next.length - MAX_LOG_ENTRIES) : next;
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
      set({ selection: message.payload, styleValues: message.payload.styles, picking: false });
    } else if (isSelectionClearedMessage(message)) {
      set({ selection: null, styleValues: null });
    } else if (isPreviewChangedMessage(message)) {
      set({ changes: message.payload.changes });
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

  reset: () => {
    channel = null;
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
    });
  },
}));

/** Record a connection failure from the chrome layer without an open channel. */
export function reportConnectFailure(reason: string): void {
  channel = null;
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
  });
}
