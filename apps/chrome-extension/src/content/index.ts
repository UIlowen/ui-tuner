import { Overlay, Picker, SelectionTracker } from "@ui-tuner/inspector";
import {
  UI_TUNER_PORT_NAME,
  createContentPong,
  createContentReady,
  createPickerState,
  createSelectionChanged,
  createSelectionCleared,
  isSidepanelPingMessage,
  isSidepanelPickingMessage,
  isSidepanelSelectAncestorMessage,
  type UiTunerMessage,
} from "@ui-tuner/protocol";
import { Channel } from "../messaging/channel";

/**
 * Content script — Milestone 2 scope.
 *
 * Runs only on http://localhost/* and http://127.0.0.1/* (see manifest).
 * Wires the inspector (Picker / Overlay / SelectionTracker) to the Side Panel
 * port. All chrome knowledge lives here; inspector stays chrome-free.
 */

let channel: Channel | null = null;
let overlay: Overlay | null = null;
let picker: Picker | null = null;
let tracker: SelectionTracker | null = null;
let selectionActive = false;

function send(message: UiTunerMessage): void {
  channel?.send(message);
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
  const payload = tracker.select(element);
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
  const payload = tracker.moveToParent();
  if (!payload) return;
  overlay.setSelected(tracker.selected, clearSelection);
  send(createSelectionChanged(payload));
}

function moveToAncestor(uiTunerId: string): void {
  if (!tracker || !overlay) return;
  const payload = tracker.moveToAncestor(uiTunerId);
  if (!payload) return;
  overlay.setSelected(tracker.selected, clearSelection);
  send(createSelectionChanged(payload));
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
  tracker = new SelectionTracker();
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

  channel.onMessage((message) => {
    if (isSidepanelPickingMessage(message)) {
      if (message.payload.enabled) startPicking();
      else stopPicking();
    } else if (isSidepanelSelectAncestorMessage(message)) {
      moveToAncestor(message.payload.uiTunerId);
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
    tracker?.clear();
    selectionActive = false;
    channel = null;
    picker = null;
    overlay = null;
    tracker = null;
  });
});
