import {
  ChangeTracker,
  Overlay,
  Picker,
  PreviewEngine,
  SelectionTracker,
  domSnapshotFor,
  isStyleProperty,
  readUiTunerId,
} from "@ui-tuner/inspector";
import {
  UI_TUNER_PORT_NAME,
  createContentPong,
  createContentReady,
  createPickerState,
  createPreviewChanged,
  createSelectionChanged,
  createSelectionCleared,
  isSidepanelPingMessage,
  isSidepanelPickingMessage,
  isSidepanelResetChangesMessage,
  isSidepanelRevertChangeMessage,
  isSidepanelRevertElementMessage,
  isSidepanelSelectAncestorMessage,
  isSidepanelStylePreviewMessage,
  type SelectionPayload,
  type UiTunerMessage,
} from "@ui-tuner/protocol";
import { Channel } from "../messaging/channel";

/**
 * Content script — Milestone 4 scope.
 *
 * Runs only on http://localhost/* and http://127.0.0.1/* (see manifest).
 * Wires the inspector (Picker / Overlay / SelectionTracker / PreviewEngine /
 * ChangeTracker) to the Side Panel port. All chrome knowledge lives here;
 * inspector stays chrome-free.
 */

// Page-scoped preview state. Survives Side Panel reconnects; dies with the
// page on reload (plan §37: in-memory tab state).
const previewEngine = new PreviewEngine();
const changeTracker = new ChangeTracker();

let channel: Channel | null = null;
let overlay: Overlay | null = null;
let picker: Picker | null = null;
let tracker: SelectionTracker | null = null;
let selectionActive = false;

function send(message: UiTunerMessage): void {
  channel?.send(message);
}

/** Attach the truncated DOM snapshot (plan §3.1) to a selection payload. */
function withElementContext(payload: SelectionPayload, element: Element): SelectionPayload {
  return { ...payload, dom: domSnapshotFor(element) };
}

function startPicking(): void {
  picker?.start();
  send(createPickerState(true));
}

function stopPicking(): void {
  if (picker?.isEnabled) picker.stop();
  overlay?.setHover(null);
  send(createPickerState(false));
}

function selectElement(element: Element): void {
  if (!tracker || !overlay) return;
  const payload = withElementContext(tracker.select(element), element);
  selectionActive = true;
  overlay.setHover(null);
  overlay.setSelected(element, clearSelection);
  send(createSelectionChanged(payload));
}

function clearSelection(): void {
  tracker?.clear();
  selectionActive = false;
  overlay?.setSelected(null);
  send(createSelectionCleared());
}

function moveToParent(): void {
  if (!tracker || !overlay) return;
  const element = tracker.selected;
  const payload = tracker.moveToParent();
  if (!payload || !element) return;
  overlay.setSelected(tracker.selected, clearSelection);
  send(createSelectionChanged(withElementContext(payload, tracker.selected!)));
}

function moveToAncestor(uiTunerId: string): void {
  if (!tracker || !overlay) return;
  const payload = tracker.moveToAncestor(uiTunerId);
  if (!payload) return;
  overlay.setSelected(tracker.selected, clearSelection);
  send(createSelectionChanged(withElementContext(payload, tracker.selected!)));
}

/**
 * Side Panel style scrub (plan §10/§11): every frame rewrites the preview
 * `<style>` override; a committed frame records the StyleChange. Scrubbing
 * back to the page's original value drops the record and override again.
 */
function applyStylePreview(payload: {
  uiTunerId: string;
  property: string;
  value: string | null;
  committed: boolean;
}): void {
  if (!tracker || !selectionActive) return;
  const element = tracker.selected;
  if (!element || readUiTunerId(element) !== payload.uiTunerId) return;
  if (!isStyleProperty(payload.property)) return;

  const { uiTunerId, property, value, committed } = payload;
  if (!changeTracker.find(uiTunerId, property)) {
    // First touch: capture the page's real value before the override lands.
    const originalValue = getComputedStyle(element).getPropertyValue(property).trim();
    if (value !== null) changeTracker.record(uiTunerId, property, value, originalValue);
  }

  if (value === null) {
    changeTracker.revertProperty(uiTunerId, property);
    previewEngine.setOverride(uiTunerId, property, null);
    send(createPreviewChanged(changeTracker.all()));
    return;
  }

  previewEngine.mount();
  previewEngine.setOverride(uiTunerId, property, value);
  changeTracker.record(uiTunerId, property, value, "");

  if (!committed) return;

  const change = changeTracker.find(uiTunerId, property);
  if (change && change.nextValue === change.previousValue) {
    // Released on the original value — not a change; drop it (plan §12 spirit).
    changeTracker.revertProperty(uiTunerId, property);
    previewEngine.setOverride(uiTunerId, property, null);
  }
  send(createPreviewChanged(changeTracker.all()));
}

/**
 * After any revert / reset: drop the affected overrides, report the new
 * change list, and — when the selected element is affected — re-select it so
 * the panel's style values reflect the page again.
 */
function syncAfterChanges(affectedElementIds: string[]): void {
  send(createPreviewChanged(changeTracker.all()));

  const element = tracker?.selected ?? null;
  const selectedId = element ? readUiTunerId(element) : null;
  if (element && selectedId && affectedElementIds.includes(selectedId)) {
    selectElement(element);
  }
}

/** Revert one recorded change (plan §14). */
function revertChange(changeId: string): void {
  const change = changeTracker.revert(changeId);
  if (!change) return;
  previewEngine.setOverride(change.elementId, change.property, null);
  syncAfterChanges([change.elementId]);
}

/** Revert every change of one element (plan §14). */
function revertElement(uiTunerId: string): void {
  const removed = changeTracker.revertElement(uiTunerId);
  if (removed.length === 0) return;
  previewEngine.removeElement(uiTunerId);
  syncAfterChanges([uiTunerId]);
}

/** Reset all preview changes (plan §13/§14). */
function resetChanges(): void {
  const affected = [...new Set(changeTracker.all().map((change) => change.elementId))];
  if (affected.length === 0) return;
  changeTracker.clear();
  previewEngine.unmount();
  syncAfterChanges(affected);
}

// Selection-state keys. While picking, the Picker owns Escape itself.
document.addEventListener(
  "keydown",
  (event) => {
    if (picker?.isEnabled || !selectionActive) return;
    if (event.key === "Escape") {
      event.preventDefault();
      clearSelection();
    } else if ((event.metaKey || event.ctrlKey) && event.key === "ArrowUp") {
      event.preventDefault();
      moveToParent();
    }
  },
  true,
);

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== UI_TUNER_PORT_NAME) return;

  channel = Channel.accept(port);
  overlay = new Overlay();
  overlay.mount();
  tracker = new SelectionTracker({
    // Elements with recorded changes keep their id attribute so preview
    // overrides keep matching when the selection moves away (plan §11/§12).
    keepId: (id) => changeTracker.hasChangesFor(id),
  });
  selectionActive = false;
  picker = new Picker({
    onHoverChange: (element) => overlay?.setHover(element),
    onSelect: (element) => {
      picker?.stop();
      send(createPickerState(false));
      selectElement(element);
    },
    onCancel: () => {
      overlay?.setHover(null);
      send(createPickerState(false));
    },
  });

  channel.send(
    createContentReady({
      url: location.href,
      title: document.title,
      connectedAt: Date.now(),
    }),
  );
  // Page-side changes survive reconnects (plan §37 in-memory) — resync the
  // panel's mirror so the Changes tab reflects reality after a reconnect.
  if (changeTracker.all().length > 0) {
    send(createPreviewChanged(changeTracker.all()));
  }

  channel.onMessage((message) => {
    if (isSidepanelPickingMessage(message)) {
      if (message.payload.enabled) startPicking();
      else stopPicking();
    } else if (isSidepanelSelectAncestorMessage(message)) {
      moveToAncestor(message.payload.uiTunerId);
    } else if (isSidepanelStylePreviewMessage(message)) {
      applyStylePreview(message.payload);
    } else if (isSidepanelRevertChangeMessage(message)) {
      revertChange(message.payload.changeId);
    } else if (isSidepanelRevertElementMessage(message)) {
      revertElement(message.payload.elementId);
    } else if (isSidepanelResetChangesMessage(message)) {
      resetChanges();
    } else if (isSidepanelPingMessage(message)) {
      channel?.send(
        createContentPong({
          sentAt: message.payload.sentAt,
          receivedAt: Date.now(),
          url: location.href,
          title: document.title,
          userAgent: navigator.userAgent,
        }),
      );
    }
  });

  port.onDisconnect.addListener(() => {
    picker?.stop();
    overlay?.unmount();
    // Releases selection ids, except on elements with change records — their
    // preview overrides stay visible until the page reloads.
    tracker?.clear();
    selectionActive = false;
    channel = null;
    picker = null;
    overlay = null;
    tracker = null;
  });
});
