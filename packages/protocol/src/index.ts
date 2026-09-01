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
  /**
   * Structural signature `tag#id.cls>child,child` (plan §21): a matching
   * signal that survives attribute churn, groundwork for §22 HMR relocation.
   */
  domFingerprint?: string;
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
// M4 — changes tab messages (plan §13/§14: revert single / element / all)
// ---------------------------------------------------------------------------

/** Side Panel → Content. Revert one recorded change (plan §14). */
export interface SidepanelRevertChangeMessage {
  type: "sidepanel.revertChange";
  payload: {
    changeId: string;
  };
}

/** Side Panel → Content. Revert every change recorded for one element (plan §14). */
export interface SidepanelRevertElementMessage {
  type: "sidepanel.revertElement";
  payload: {
    elementId: string;
  };
}

/** Side Panel → Content. Reset all preview changes (plan §13/§14). */
export interface SidepanelResetChangesMessage {
  type: "sidepanel.resetChanges";
  payload: Record<string, never>;
}

// ---------------------------------------------------------------------------
// M5 — local bridge messages (plan §15/§16), carried over WebSocket
// ---------------------------------------------------------------------------

/** Project info the bridge detects from its working directory (plan §15). */
export interface BridgeProject {
  name: string | null;
  framework: string;
  root: string;
}

/** Side Panel → Bridge. Handshake sent right after the WebSocket opens. */
export interface BridgeHelloMessage {
  type: "bridge.hello";
  payload: {
    extensionVersion: string;
    pageUrl: string | null;
  };
}

/** Bridge → Side Panel. Reply to `bridge.hello` (plan §15 startup banner). */
export interface BridgeWelcomeMessage {
  type: "bridge.welcome";
  payload: {
    bridgeVersion: string;
    project: BridgeProject;
    devServerUrl: string | null;
  };
}

/**
 * Side Panel → Bridge. Mirror of the page state: the current selection and
 * change records (M5 acceptance: the browser can send Selection + ChangeSet).
 * Serves the M7 MCP tools `ui_get_selection` / `ui_get_changes`.
 */
export interface BridgeSyncMessage {
  type: "bridge.sync";
  payload: {
    selection: SelectionPayload | null;
    changes: StyleChange[];
  };
}

// ---------------------------------------------------------------------------
// M6 — source resolver messages (plan §19/§20/§21)
// ---------------------------------------------------------------------------

/** How confidently the bridge located the element's source (plan §19). */
export type SourceConfidence = "exact" | "inferred" | "unknown";

/**
 * Element identity beyond the live HTMLElement reference (plan §21): the
 * multi-signal set used to match a DOM element back to source code, and
 * (later, §22) to re-locate it after HMR.
 */
export interface ElementIdentity {
  uiTunerId: string;
  selector?: string;
  textFingerprint?: string;
  domFingerprint?: string;
  componentName?: string;
  sourceFile?: string;
  sourceLine?: number;
}

/**
 * Resolution result for the current selection (plan §20). `file` is relative
 * to the project root. `line` is only present for `exact` — an inferred
 * match never fabricates a line number.
 */
export interface SourceResolution {
  elementId: string;
  confidence: SourceConfidence;
  componentName?: string;
  file?: string;
  line?: number;
}

/** Bridge → Side Panel. Source location for the current selection (plan §20). */
export interface BridgeSourceResolvedMessage {
  type: "bridge.sourceResolved";
  payload: SourceResolution;
}

// ---------------------------------------------------------------------------
// M7 — agent messages (plan §23–§27, §44)
// ---------------------------------------------------------------------------

/** How much context the agent gets (plan §25; default Level 1 per §24). */
export type ContextLevel = 1 | 2 | 3;

/** Agent tab "Include" flags (plan §23). */
export interface AgentInclude {
  dom: boolean;
  styles: boolean;
  source: boolean;
  screenshot: boolean;
  parentTree: boolean;
}

/** Side Panel → Bridge. Instruction + flags from the Agent tab (§23/§26). */
export interface AgentRequestMessage {
  type: "agent.request";
  payload: {
    instruction: string;
    include: AgentInclude;
    contextLevel: ContextLevel;
    sentAt: number;
  };
}

/** One agent's availability for the Agent tab selector (§36/§44). */
export interface AgentInfo {
  id: string;
  name: string;
  available: boolean;
}

/** Bridge → Side Panel. Agent availability, sent after the welcome. */
export interface BridgeAgentsMessage {
  type: "bridge.agents";
  payload: {
    agents: AgentInfo[];
  };
}

/** Bridge → Side Panel. An agent called ui_notify_applied (§27). */
export interface AgentAppliedMessage {
  type: "agent.applied";
  payload: {
    files: string[];
    summary: string;
    at: number;
  };
}

/** Bridge → Side Panel. MCP ui_capture (§27): re-grab fresh page context. */
export interface AgentCaptureMessage {
  type: "agent.capture";
  payload: {
    captureId: string;
    withScreenshot: boolean;
  };
}

/** Side Panel → Bridge. Response to `agent.capture`. */
export interface AgentCaptureResultMessage {
  type: "agent.captureResult";
  payload: {
    captureId: string;
    selection: SelectionPayload | null;
    changes: StyleChange[];
    /** dataURL PNG of the visible tab, when requested and available. */
    screenshot?: string;
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
  | PreviewChangedMessage
  | SidepanelRevertChangeMessage
  | SidepanelRevertElementMessage
  | SidepanelResetChangesMessage
  | BridgeHelloMessage
  | BridgeWelcomeMessage
  | BridgeSyncMessage
  | BridgeSourceResolvedMessage
  | AgentRequestMessage
  | BridgeAgentsMessage
  | AgentAppliedMessage
  | AgentCaptureMessage
  | AgentCaptureResultMessage;

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
  "sidepanel.revertChange",
  "sidepanel.revertElement",
  "sidepanel.resetChanges",
  "bridge.hello",
  "bridge.welcome",
  "bridge.sync",
  "bridge.sourceResolved",
  "agent.request",
  "bridge.agents",
  "agent.applied",
  "agent.capture",
  "agent.captureResult",
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

export function isSidepanelRevertChangeMessage(
  value: UiTunerMessage,
): value is SidepanelRevertChangeMessage {
  return value.type === "sidepanel.revertChange";
}

export function isSidepanelRevertElementMessage(
  value: UiTunerMessage,
): value is SidepanelRevertElementMessage {
  return value.type === "sidepanel.revertElement";
}

export function isSidepanelResetChangesMessage(
  value: UiTunerMessage,
): value is SidepanelResetChangesMessage {
  return value.type === "sidepanel.resetChanges";
}

export function isBridgeHelloMessage(value: UiTunerMessage): value is BridgeHelloMessage {
  return value.type === "bridge.hello";
}

export function isBridgeWelcomeMessage(value: UiTunerMessage): value is BridgeWelcomeMessage {
  return value.type === "bridge.welcome";
}

export function isBridgeSyncMessage(value: UiTunerMessage): value is BridgeSyncMessage {
  return value.type === "bridge.sync";
}

export function isBridgeSourceResolvedMessage(
  value: UiTunerMessage,
): value is BridgeSourceResolvedMessage {
  return value.type === "bridge.sourceResolved";
}

export function isAgentRequestMessage(value: UiTunerMessage): value is AgentRequestMessage {
  return value.type === "agent.request";
}

export function isBridgeAgentsMessage(value: UiTunerMessage): value is BridgeAgentsMessage {
  return value.type === "bridge.agents";
}

export function isAgentAppliedMessage(value: UiTunerMessage): value is AgentAppliedMessage {
  return value.type === "agent.applied";
}

export function isAgentCaptureMessage(value: UiTunerMessage): value is AgentCaptureMessage {
  return value.type === "agent.capture";
}

export function isAgentCaptureResultMessage(
  value: UiTunerMessage,
): value is AgentCaptureResultMessage {
  return value.type === "agent.captureResult";
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

export function createSidepanelRevertChange(changeId: string): SidepanelRevertChangeMessage {
  return { type: "sidepanel.revertChange", payload: { changeId } };
}

export function createSidepanelRevertElement(elementId: string): SidepanelRevertElementMessage {
  return { type: "sidepanel.revertElement", payload: { elementId } };
}

export function createSidepanelResetChanges(): SidepanelResetChangesMessage {
  return { type: "sidepanel.resetChanges", payload: {} };
}

export function createBridgeHello(payload: BridgeHelloMessage["payload"]): BridgeHelloMessage {
  return { type: "bridge.hello", payload };
}

export function createBridgeWelcome(
  payload: BridgeWelcomeMessage["payload"],
): BridgeWelcomeMessage {
  return { type: "bridge.welcome", payload };
}

export function createBridgeSync(payload: BridgeSyncMessage["payload"]): BridgeSyncMessage {
  return { type: "bridge.sync", payload };
}

export function createBridgeSourceResolved(payload: SourceResolution): BridgeSourceResolvedMessage {
  return { type: "bridge.sourceResolved", payload };
}

export function createAgentRequest(payload: AgentRequestMessage["payload"]): AgentRequestMessage {
  return { type: "agent.request", payload };
}

export function createBridgeAgents(agents: AgentInfo[]): BridgeAgentsMessage {
  return { type: "bridge.agents", payload: { agents } };
}

export function createAgentApplied(payload: AgentAppliedMessage["payload"]): AgentAppliedMessage {
  return { type: "agent.applied", payload };
}

export function createAgentCapture(payload: AgentCaptureMessage["payload"]): AgentCaptureMessage {
  return { type: "agent.capture", payload };
}

export function createAgentCaptureResult(
  payload: AgentCaptureResultMessage["payload"],
): AgentCaptureResultMessage {
  return { type: "agent.captureResult", payload };
}

// ---------------------------------------------------------------------------
// Prompt context assembly (plan §26)
// ---------------------------------------------------------------------------

/** Input for `assembleAgentContext` — everything the agent needs (plan §24/§25). */
export interface AgentContextInput {
  selection: SelectionPayload | null;
  source: SourceResolution | null;
  changes: StyleChange[];
  /** User instruction from the Agent tab (may be empty). */
  instruction: string;
  include?: AgentInclude;
  /** Context depth (plan §25); default Level 1 per §24. */
  level?: ContextLevel;
}

/**
 * Layout-critical properties surfaced first in the "Current relevant styles"
 * block (plan §26). The rest of the whitelisted styles are omitted — the
 * full set is available to the agent via ui_get_selection.
 */
const RELEVANT_STYLE_PROPS: readonly string[] = [
  "display",
  "position",
  "width",
  "height",
  "gap",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "font-size",
  "font-weight",
  "color",
  "background-color",
  "border-radius",
];

const MAX_RELEVANT_STYLES = 12;

/**
 * Assemble the agent prompt context in the plan §26 format. Pure text — used
 * by both the Side Panel preview and the MCP `ui_get_context` tool so the two
 * never drift apart.
 *
 * Honesty rules (plan §20): no selection → says so; source is included only
 * when the include flag allows it and confidence is not `unknown`.
 */
export function assembleAgentContext(input: AgentContextInput): string {
  const include: AgentInclude = input.include ?? {
    dom: true,
    styles: true,
    source: true,
    screenshot: false,
    parentTree: false,
  };
  const level = input.level ?? 1;
  const { selection, source, changes, instruction } = input;
  const lines: string[] = [];

  // Selected component -------------------------------------------------------
  const componentName =
    source && source.confidence !== "unknown" && source.componentName
      ? source.componentName
      : null;
  lines.push("Selected Component:");
  if (componentName) {
    lines.push(componentName);
  } else if (selection) {
    lines.push(`<${selection.element.tagName}> (${selection.element.selector})`);
  } else {
    lines.push("(none — pick an element in the browser first)");
  }
  lines.push("");

  // Source -------------------------------------------------------------------
  if (include.source && source && source.confidence !== "unknown" && source.file) {
    lines.push("Source:");
    lines.push(source.line ? `${source.file}:${source.line}` : `${source.file} (inferred)`);
    lines.push("");
  }

  // DOM snapshot -------------------------------------------------------------
  if (include.dom && selection?.dom?.outerHTML) {
    lines.push("DOM:");
    lines.push(selection.dom.outerHTML);
    lines.push("");
  }

  // Current relevant styles --------------------------------------------------
  if (include.styles && selection) {
    lines.push("Current relevant styles:");
    const styles = selection.styles;
    let count = 0;
    for (const prop of RELEVANT_STYLE_PROPS) {
      const value = styles[prop];
      if (value !== undefined && count < MAX_RELEVANT_STYLES) {
        lines.push(`${prop}: ${value}`);
        count += 1;
      }
    }
    if (count === 0) lines.push("(no captured styles)");
    lines.push("");
  }

  // User preview changes -----------------------------------------------------
  lines.push("User preview changes:");
  if (changes.length === 0) {
    lines.push("(none yet)");
  } else {
    for (const change of changes) {
      lines.push(`${change.property}: ${change.previousValue} → ${change.nextValue}`);
    }
  }
  lines.push("");

  // Level ≥2: structure context (plan §25) -----------------------------------
  if (level >= 2 && selection) {
    if (include.parentTree && selection.breadcrumb.length > 0) {
      lines.push("Parent tree (nearest first):");
      for (const item of selection.breadcrumb) {
        lines.push(`<${item.tagName}> ${item.id}`);
      }
      lines.push("");
    }
    if (selection.dom?.parentHTML) {
      lines.push("Parent DOM:");
      lines.push(selection.dom.parentHTML);
      lines.push("");
    }
    if (selection.dom?.childrenHTML && selection.dom.childrenHTML.length > 0) {
      lines.push("Children DOM:");
      for (const child of selection.dom.childrenHTML) {
        lines.push(child);
      }
      lines.push("");
    }
  }

  // Level 3: screenshot note (plan §25) — actual image rides ui_capture.
  if (level >= 3 && include.screenshot) {
    lines.push("Screenshot:");
    lines.push("(call ui_capture to fetch a fresh screenshot of the visible tab)");
    lines.push("");
  }

  // Instruction --------------------------------------------------------------
  lines.push("Instruction:");
  lines.push(instruction.trim() ? instruction.trim() : "(none — apply the preview changes above)");

  return lines.join("\n");
}
