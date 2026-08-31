import { create } from "zustand";
import {
  createSidepanelPing,
  isContentPongMessage,
  isContentReadyMessage,
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

  /** Wire an already-opened channel (App owns chrome.tabs lookup). */
  connect: (channel: Channel) => void;
  /** Test/DI entry point: handle an incoming message directly. */
  receive: (message: UiTunerMessage) => void;
  ping: () => void;
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

  connect: (nextChannel) => {
    channel = nextChannel;
    set({
      status: "connecting",
      statusError: null,
      pageTitle: null,
      pageUrl: null,
      lastRttMs: null,
      log: [],
    });
    nextChannel.onDisconnect(() => {
      if (channel === nextChannel)
        set({ status: "disconnected", statusError: "Connection closed" });
    });
    nextChannel.onMessage((message) => get().receive(message));
  },

  receive: (message) => {
    set((state) => ({ log: appendLog(state.log, "in", message) }));
    if (isContentReadyMessage(message)) {
      set({ status: "connected", pageTitle: message.payload.title, pageUrl: message.payload.url });
    } else if (isContentPongMessage(message)) {
      set({ lastRttMs: Math.max(0, Date.now() - message.payload.sentAt) });
    }
  },

  ping: () => {
    if (!channel) return;
    const message = createSidepanelPing({ sentAt: Date.now() });
    channel.send(message);
    set((state) => ({ log: appendLog(state.log, "out", message) }));
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
  });
}
