/**
 * UI Tuner shared protocol.
 *
 * All cross-context messages are defined here and nowhere else
 * (execution plan rule 6). Every message is `{ type, payload }` with an
 * object payload; unknown messages are dropped at the boundary.
 *
 * M1: Side Panel ⇄ Content Script channel (connect / ping).
 * M2: Element Picker (pick mode, selection, breadcrumb).
 * M3: Style Inspector (computed styles, live preview, change records).
 * Later milestones add Bridge / Agent messages (plan §17).
 */

/** Name of the long-lived chrome.runtime port used by Side Panel ↔ Content Script. */
export const UI_TUNER_PORT_NAME = "ui-tuner";

// ---------------------------------------------------------------------------
// Shared payload shapes
// ---------------------------------------------------------------------------

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Selected element snapshot, aligned with plan §18 ElementContext.element. */
export interface SelectionElement {
  /** uiTunerId — value of the `data-ui-tuner-id` attribute (plan §11/§21). */
  id: string;
  tagName: string;
  selector: string;
  /** Trimmed text content preview (single line, capped). */
  text?: string;
  bounds: Bounds;
}

/** One breadcrumb step: nearest ancestor first, ending at <body>. */
export interface BreadcrumbItem {
  tagName: string;
  /** uiTunerId assigned to this element while the selection is active. */
  id: string;
}

export interface SelectionPayload {
  element: SelectionElement;
  breadcrumb: BreadcrumbItem[];
  /** Whitelisted computed styles at pick time (plan §7/§18). */
  styles: Record<string, string>;
  /** Truncated DOM snapshot (plan §3.1); for later milestones' agent context. */
  dom?: DomSnapshot;
  pickedAt: number;
}

/** DOM snapshot with a total character budget (plan §3.1, MAX_HTML_LENGTH). */
export interface DomSnapshot {
  outerHTML: string;
  parentHTML?: string;
  childrenHTML?: string[];
}

/** One recorded style override (plan §12). */
export interface StyleChange {
  id: string;
  elementId: string;
  property: string;
  previousValue: string;
  nextValue: string;
  source: "manual" | "agent";
  createdAt: number;
}

// ---------------------------------------------------------------------------
// M1 — channel messages
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// M2 — element picker messages
// ---------------------------------------------------------------------------

/** Side Panel → Content. Enter / leave pick mode. */
export interface SidepanelPickingMessage {
  type: "sidepanel.picking";
  payload: {
    enabled: boolean;
  };
}

/** Content → Side Panel. Actual pick mode state (synced after Esc etc.). */
export interface PickerStateMessage {
  type: "picker.state";
  payload: {
    enabled: boolean;
  };
}

/** Content → Side Panel. A (new) element is selected / selection moved. */
export interface SelectionChangedMessage {
  type: "selection.changed";
  payload: SelectionPayload;
}

/** Content → Side Panel. Selection cleared (Esc, element removed from DOM). */
export interface SelectionClearedMessage {
  type: "selection.cleared";
  payload: Record<string, never>;
}

/** Side Panel → Content. Breadcrumb jump: select the ancestor with this id. */
export interface SidepanelSelectAncestorMessage {
  type: "sidepanel.selectAncestor";
  payload: {
    uiTunerId: string;
  };
}

// ---------------------------------------------------------------------------
// M3 — style inspector messages
// ---------------------------------------------------------------------------

/**
 * Side Panel → Content. Set one CSS property on the selected element via the
 * preview `<style>` override (plan §11). `committed: false` frames arrive
 * while scrubbing; `committed: true` on release records a StyleChange.
 * `value: null` removes the override.
 */
export interface SidepanelStylePreviewMessage {
  type: "sidepanel.stylePreview";
  payload: {
    uiTunerId: string;
    property: string;
    value: string | null;
    committed: boolean;
  };
}

/** Content → Side Panel. The page-side change list changed (plan §12/§13). */
export interface PreviewChangedMessage {
  type: "preview.changed";
  payload: {
    changes: StyleChange[];
  };
}

// ---------------------------------------------------------------------------
// Union + guards
// ---------------------------------------------------------------------------

export type UiTunerMessage =
  | ContentReadyMessage
  | SidepanelPingMessage
  | ContentPongMessage
  | SidepanelPickingMessage
  | PickerStateMessage
  | SelectionChangedMessage
  | SelectionClearedMessage
  | SidepanelSelectAncestorMessage
  | SidepanelStylePreviewMessage
  | PreviewChangedMessage;

export type UiTunerMessageType = UiTunerMessage["type"];

const MESSAGE_TYPES: readonly UiTunerMessageType[] = [
  "content.ready",
  "sidepanel.ping",
  "content.pong",
  "sidepanel.picking",
  "picker.state",
  "selection.changed",
  "selection.cleared",
  "sidepanel.selectAncestor",
  "sidepanel.stylePreview",
  "preview.changed",
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
    candidate.payload !== null &&
    !Array.isArray(candidate.payload)
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

export function isSidepanelPickingMessage(value: UiTunerMessage): value is SidepanelPickingMessage {
  return value.type === "sidepanel.picking";
}

export function isPickerStateMessage(value: UiTunerMessage): value is PickerStateMessage {
  return value.type === "picker.state";
}

export function isSelectionChangedMessage(value: UiTunerMessage): value is SelectionChangedMessage {
  return value.type === "selection.changed";
}

export function isSelectionClearedMessage(value: UiTunerMessage): value is SelectionClearedMessage {
  return value.type === "selection.cleared";
}

export function isSidepanelSelectAncestorMessage(
  value: UiTunerMessage,
): value is SidepanelSelectAncestorMessage {
  return value.type === "sidepanel.selectAncestor";
}

export function isSidepanelStylePreviewMessage(
  value: UiTunerMessage,
): value is SidepanelStylePreviewMessage {
  return value.type === "sidepanel.stylePreview";
}

export function isPreviewChangedMessage(value: UiTunerMessage): value is PreviewChangedMessage {
  return value.type === "preview.changed";
}

// ---------------------------------------------------------------------------
// Creators
// ---------------------------------------------------------------------------

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

export function createSidepanelPicking(enabled: boolean): SidepanelPickingMessage {
  return { type: "sidepanel.picking", payload: { enabled } };
}

export function createPickerState(enabled: boolean): PickerStateMessage {
  return { type: "picker.state", payload: { enabled } };
}

export function createSelectionChanged(payload: SelectionPayload): SelectionChangedMessage {
  return { type: "selection.changed", payload };
}

export function createSelectionCleared(): SelectionClearedMessage {
  return { type: "selection.cleared", payload: {} };
}

export function createSidepanelSelectAncestor(uiTunerId: string): SidepanelSelectAncestorMessage {
  return { type: "sidepanel.selectAncestor", payload: { uiTunerId } };
}

export function createSidepanelStylePreview(
  payload: SidepanelStylePreviewMessage["payload"],
): SidepanelStylePreviewMessage {
  return { type: "sidepanel.stylePreview", payload };
}

export function createPreviewChanged(changes: StyleChange[]): PreviewChangedMessage {
  return { type: "preview.changed", payload: { changes } };
}
