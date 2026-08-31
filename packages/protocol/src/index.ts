/**
 * UI Tuner shared protocol.
 *
 * Milestone 1 scope: messages exchanged between the Chrome Side Panel and the
 * Content Script over a long-lived runtime port. Bridge and Agent messages
 * will be added in later milestones (see UI_TUNER_EXECUTION_PLAN.md §17).
 */

/** Name of the long-lived chrome.runtime port used by Side Panel ↔ Content Script. */
export const UI_TUNER_PORT_NAME = "ui-tuner";

/** Content → Side Panel. Sent once when the Side Panel connects to the page. */
export interface ContentReadyMessage {
  type: "content.ready";
  payload: {
    url: string;
    title: string;
    connectedAt: number;
  };
}

/** Side Panel → Content. Round-trip probe. */
export interface SidepanelPingMessage {
  type: "sidepanel.ping";
  payload: {
    sentAt: number;
  };
}

/** Content → Side Panel. Reply to `sidepanel.ping`. */
export interface ContentPongMessage {
  type: "content.pong";
  payload: {
    sentAt: number;
    receivedAt: number;
    url: string;
    title: string;
    userAgent: string;
  };
}

export type UiTunerMessage = ContentReadyMessage | SidepanelPingMessage | ContentPongMessage;

export type UiTunerMessageType = UiTunerMessage["type"];

const MESSAGE_TYPES: readonly UiTunerMessageType[] = [
  "content.ready",
  "sidepanel.ping",
  "content.pong",
];

export function isUiTunerMessageType(value: unknown): value is UiTunerMessageType {
  return typeof value === "string" && (MESSAGE_TYPES as readonly string[]).includes(value);
}

/**
 * Runtime guard. Port messages are `unknown` at the boundary — always narrow
 * before use; silently drop anything that is not a known UI Tuner message.
 */
export function isUiTunerMessage(value: unknown): value is UiTunerMessage {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { type?: unknown; payload?: unknown };
  return (
    isUiTunerMessageType(candidate.type) &&
    typeof candidate.payload === "object" &&
    candidate.payload !== null
  );
}

export function isContentReadyMessage(value: UiTunerMessage): value is ContentReadyMessage {
  return value.type === "content.ready";
}

export function isSidepanelPingMessage(value: UiTunerMessage): value is SidepanelPingMessage {
  return value.type === "sidepanel.ping";
}

export function isContentPongMessage(value: UiTunerMessage): value is ContentPongMessage {
  return value.type === "content.pong";
}

export function createContentReady(payload: ContentReadyMessage["payload"]): ContentReadyMessage {
  return { type: "content.ready", payload };
}

export function createSidepanelPing(
  payload: SidepanelPingMessage["payload"],
): SidepanelPingMessage {
  return { type: "sidepanel.ping", payload };
}

export function createContentPong(payload: ContentPongMessage["payload"]): ContentPongMessage {
  return { type: "content.pong", payload };
}
