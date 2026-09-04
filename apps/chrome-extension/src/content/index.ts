import {
  Annotations,
  ChangeTracker,
  InstructionStore,
  Overlay,
  Picker,
  PreviewEngine,
  SelectionTracker,
  StagingEngine,
  UI_TUNER_ID_ATTR,
  cssValuesEqual,
  domFingerprintFor,
  domSnapshotFor,
  pickStyles,
  readUiTunerId,
} from "@ui-tuner/inspector";
import {
  UI_TUNER_PORT_NAME,
  createApplyConfirmed,
  createContentPong,
  createContentReady,
  createPickerState,
  createPreviewChanged,
  createSelectionChanged,
  createSelectionCleared,
  isSidepanelClearSelectionMessage,
  isSidepanelConfirmApplyMessage,
  isSidepanelPingMessage,
  isSidepanelPickingMessage,
  isSidepanelReloadPageMessage,
  isSidepanelResetChangesMessage,
  isSidepanelRevertChangeMessage,
  isSidepanelRevertElementMessage,
  isSidepanelSelectAncestorMessage,
  type SelectionPayload,
  type StyleChange,
  type UiTunerMessage,
} from "@ui-tuner/protocol";
import { Channel } from "../messaging/channel";
import type { Locale } from "../i18n/messages";
import { usePrefsStore, type ThemePref } from "../state/prefs";
// The editor card mount genuinely imports injectCardStyles (and the compiled
// card.css string), so the card stylesheet reaches the content bundle on its
// own — no tree-shake stash needed.
import { EDITOR_CARD_ROOT_ID, mountEditorCard, type CardMount } from "./card/mount-card";

/** chrome.storage key the side panel persists locale/theme under. */
const PREFS_STORAGE_KEY = "ui-tuner:prefs";

/**
 * Push stored locale/theme into this context's prefs store. The panel is the
 * only writer; the card reads both back through useT() and the mount's theme
 * subscription, so nothing else here has to know about them.
 */
function applyStoredPrefs(raw: unknown): void {
  const prefs = raw as { locale?: unknown; theme?: unknown } | undefined;
  if (!prefs) return;
  if (prefs.locale === "zh" || prefs.locale === "en") {
    usePrefsStore.getState().setLocale(prefs.locale as Locale);
  }
  if (prefs.theme === "light" || prefs.theme === "dark" || prefs.theme === "system") {
    usePrefsStore.getState().setTheme(prefs.theme as ThemePref);
  }
}

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
// Natural-language instructions pair with change records, so this store shares
// changeTracker's page-scoped lifecycle: it must survive Side Panel reconnects
// (re-creating it per connect would drop instructions while changes persist).
const instructionStore = new InstructionStore();

let channel: Channel | null = null;
let overlay: Overlay | null = null;
let annotations: Annotations | null = null;
let picker: Picker | null = null;
let tracker: SelectionTracker | null = null;
// Editor-card session state, created per connect (DOM/React-bound) and torn
// down on disconnect.
let stagingEngine: StagingEngine | null = null;
let cardMount: CardMount | null = null;
let selectionActive = false;
// Last selected element's identity signals, for HMR re-identify (plan §22).
let lastSelector: string | null = null;
let lastFingerprint: string | null = null;

function send(message: UiTunerMessage): void {
  channel?.send(message);
}

/** Report the change list to the panel and re-render page annotations. */
function reportChanges(): void {
  const changes = changeTracker.all();
  const instructions = instructionStore.all();
  send(createPreviewChanged(changes, instructions));
  annotations?.sync(changes, instructions);
}

/** Whitelisted computed styles for an element — same source as selection.styles. */
function collectWhitelistedStyles(element: Element): Record<string, string> {
  return pickStyles(getComputedStyle(element));
}

/** Attach the truncated DOM snapshot (plan §3.1) to a selection payload. */
function withElementContext(payload: SelectionPayload, element: Element): SelectionPayload {
  return { ...payload, dom: domSnapshotFor(element) };
}

function startPicking(): void {
  picker?.start();
  annotations?.setVisible(true);
  send(createPickerState(true));
}

function stopPicking(): void {
  if (picker?.isEnabled) picker.stop();
  overlay?.setHover(null);
  closeEditorSession();
  annotations?.setVisible(false);
  clearPageSelection();
  send(createPickerState(false));
}

function selectElement(element: Element): void {
  if (!tracker || !overlay) return;
  const payload = withElementContext(tracker.select(element), element);
  selectionActive = true;
  lastSelector = payload.element.selector;
  lastFingerprint = payload.element.domFingerprint ?? domFingerprintFor(element);
  overlay.setHover(null);
  overlay.setSelected(element, clearSelection);
  send(createSelectionChanged(payload));
}

function clearSelection(): void {
  tracker?.clear();
  selectionActive = false;
  lastSelector = null;
  lastFingerprint = null;
  overlay?.setSelected(null);
  send(createSelectionCleared());
}

/**
 * Drop the page-side selection visuals (box, size label) without telling the
 * panel to forget the element: exiting annotation mode should leave a plain
 * preview, yet Apply to Code still targets the last selected element — so no
 * `selection.cleared` goes out. `lastSelector`/`lastFingerprint` stay too: the
 * post-apply HMR re-identification (locateAppliedElement) falls back to them.
 * Elements with change records or an instruction keep their `data-ui-tuner-id`
 * via SelectionTracker.keepId, so preview overrides and bubbles survive.
 */
function clearPageSelection(): void {
  tracker?.clear();
  selectionActive = false;
  overlay?.setSelected(null);
}

/**
 * Distinct properties already recorded for an element. The card marks those
 * rows and scrolls to the first, so reopening a bubble shows what the last step
 * changed instead of a wall of untouched properties.
 */
function changedPropertiesFor(elementId: string): string[] {
  return [
    ...new Set(
      changeTracker
        .all()
        .filter((change) => change.elementId === elementId)
        .map((change) => change.property),
    ),
  ];
}

/**
 * Open the page-side editor card for an element. Assumes the element is
 * already selected (callers run selectElement first so overlay/panel/bridge
 * stay consistent). Starts a "保存才记录" staging session: scrub edits only
 * touch the preview until 保存 commits them to the change tracker.
 */
function openEditorCard(element: Element): void {
  if (!stagingEngine || !cardMount || !tracker) return;
  const elementId = readUiTunerId(element);
  if (!elementId) return;

  stagingEngine.begin(elementId);
  cardMount.show(
    {
      elementId,
      tagName: element.tagName.toLowerCase(),
      // Bubble sequence number; null when the element has no saved change yet.
      number: annotations?.numberFor(elementId) ?? null,
      initialValues: collectWhitelistedStyles(element),
      initialInstruction: instructionStore.get(elementId) ?? "",
      changedProperties: changedPropertiesFor(elementId),
      onStage: (property, value) => {
        stagingEngine?.stage(element, property, value);
      },
      onSave: (instruction) => {
        stagingEngine?.commit();
        instructionStore.set(elementId, instruction);
        reportChanges();
        cardMount?.hide();
      },
      onCancel: () => {
        stagingEngine?.rollback();
        cardMount?.hide();
      },
      onDelete: () => {
        stagingEngine?.end(); // discard any unsaved staged edits first
        revertElement(elementId); // clears committed changes + instruction, reports
        cardMount?.hide();
      },
    },
    // Open beside the element; the mount clamps the card inside the viewport.
    element.getBoundingClientRect(),
  );
}

/** End the staging session and close the card (Esc / exit annotation / disconnect). */
function closeEditorSession(): void {
  stagingEngine?.end();
  cardMount?.hide();
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
 * After any revert / reset: drop the affected overrides, report the new
 * change list, and — when the selected element is affected — re-select it so
 * the panel's style values reflect the page again.
 */
function syncAfterChanges(affectedElementIds: string[]): void {
  reportChanges();

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
  const hadInstruction = instructionStore.get(uiTunerId) !== undefined;
  instructionStore.delete(uiTunerId);
  const removed = changeTracker.revertElement(uiTunerId);
  // No-op only when there were neither style changes nor an instruction.
  if (removed.length === 0 && !hadInstruction) return;
  if (removed.length > 0) previewEngine.removeElement(uiTunerId);
  syncAfterChanges([uiTunerId]);
}

/** Reset all preview changes (plan §13/§14). */
function resetChanges(): void {
  const affected = [...new Set(changeTracker.all().map((change) => change.elementId))];
  const hadInstructions = Object.keys(instructionStore.all()).length > 0;
  instructionStore.clear();
  if (affected.length === 0) {
    // No style changes, but clearing instructions still needs reporting.
    if (hadInstructions) reportChanges();
    return;
  }
  changeTracker.clear();
  previewEngine.unmount();
  syncAfterChanges(affected);
}

// --- M8: confirm applied changes are live in source after HMR (§29) --------

const CONFIRM_TIMEOUT_MS = 8_000;
const CONFIRM_INTERVAL_MS = 250;

/**
 * Re-locate the element an applied change belongs to (plan §22). Fast Refresh
 * replaces the node (without our data attribute), so fall back to the last
 * selector verified against its dom fingerprint. Never silently pick a wrong
 * element — returns null when no confident match.
 */
function locateAppliedElement(elementId: string): { element: Element; reidentified: boolean } | null {
  const byId = document.querySelector(`[${UI_TUNER_ID_ATTR}="${elementId}"]`);
  if (byId) return { element: byId, reidentified: false };
  if (lastSelector) {
    const candidate = document.querySelector(lastSelector);
    if (candidate) {
      const fingerprint = domFingerprintFor(candidate);
      if (!lastFingerprint || fingerprint === lastFingerprint) {
        return { element: candidate, reidentified: true };
      }
    }
  }
  return null;
}

/**
 * Poll until the page (post-HMR) reports the target computed value from
 * source: temporarily drop the preview override, read the computed style, and
 * if it still matches the target the change is truly in source (keep the
 * override off). Otherwise restore the override and retry until the timeout.
 */
async function confirmOneChange(change: StyleChange): Promise<{ ok: boolean; reidentified: boolean }> {
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  let reidentified = false;

  while (Date.now() < deadline) {
    const located = locateAppliedElement(change.elementId);
    if (located) {
      reidentified = reidentified || located.reidentified;
      // Remove the override so the computed value reflects source only.
      previewEngine.setOverride(change.elementId, change.property, null);
      const computed = getComputedStyle(located.element).getPropertyValue(change.property);
      if (cssValuesEqual(computed, change.nextValue)) {
        return { ok: true, reidentified };
      }
      // Not in source yet — restore the override and keep waiting for HMR.
      previewEngine.setOverride(change.elementId, change.property, change.nextValue);
    }
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_INTERVAL_MS));
  }
  return { ok: false, reidentified };
}

/**
 * After the agent wrote changes to source: confirm each is live, drop the
 * confirmed overrides + records, and report the outcome (plan §29/§31).
 */
async function confirmApply(changes: StyleChange[]): Promise<void> {
  const appliedChangeIds: string[] = [];
  const failedChangeIds: string[] = [];
  let reidentified = false;

  for (const change of changes) {
    const { ok, reidentified: reid } = await confirmOneChange(change);
    reidentified = reidentified || reid;
    if (ok) {
      appliedChangeIds.push(change.id);
      previewEngine.setOverride(change.elementId, change.property, null);
      changeTracker.revert(change.id);
    } else {
      failedChangeIds.push(change.id);
    }
  }

  reportChanges();
  send(createApplyConfirmed({ appliedChangeIds, failedChangeIds, reidentified }));
}

// Selection-state keys. While picking, the Picker owns Escape itself.
document.addEventListener(
  "keydown",
  (event) => {
    if (picker?.isEnabled || !selectionActive) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeEditorSession();
      clearSelection();
    } else if ((event.metaKey || event.ctrlKey) && event.key === "ArrowUp") {
      event.preventDefault();
      moveToParent();
    }
  },
  true,
);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  // The panel switches theme/locale in its own JS context; without this an
  // already-open page keeps the old theme on its card until it reloads.
  applyStoredPrefs(changes[PREFS_STORAGE_KEY]?.newValue);
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== UI_TUNER_PORT_NAME) return;

  channel = Channel.accept(port);

  // The content script is a separate JS context from the side panel, so the
  // editor card's useT()/theme read from a prefs store that must be hydrated
  // here. mountEditorCard subscribes to the store and mirrors the resolved
  // theme as the `dark` class on the card host.
  void chrome.storage.local
    .get(PREFS_STORAGE_KEY)
    .then((stored: Record<string, unknown>) => applyStoredPrefs(stored[PREFS_STORAGE_KEY]))
    .catch(() => {
      // Storage unavailable — run on in-memory defaults.
    });

  overlay = new Overlay();
  overlay.mount();
  // Clicking a change bubble selects its element, then opens the editor card
  // on top of that selection (same as the pick path).
  annotations = new Annotations({
    onOpenEditor: (elementId) => {
      const el = document.querySelector('[data-ui-tuner-id="' + elementId + '"]');
      if (el) {
        selectElement(el);
        openEditorCard(el);
      }
    },
  });
  annotations.mount();
  // Annotation mode is off until the panel asks for picking: keep the state
  // (bubbles survive reconnects) but paint nothing on a page being browsed.
  annotations.setVisible(false);
  annotations.sync(changeTracker.all(), instructionStore.all());
  tracker = new SelectionTracker({
    // Annotated elements keep their id attribute when the selection moves away:
    // preview overrides target it (plan §11/§12), and bubbles need it to locate
    // the element — including instruction-only ones, which have no overrides.
    keepId: (id) => changeTracker.hasChangesFor(id) || instructionStore.get(id) !== undefined,
  });
  selectionActive = false;
  picker = new Picker(
    {
      onHoverChange: (element) => overlay?.setHover(element),
      onSelect: (element) => {
        // Annotation mode persists: keep picking so the next click selects
        // the next element. Esc / the panel toggle stops the picker.
        selectElement(element);
        openEditorCard(element);
      },
      onCancel: () => {
        // Esc inside the picker exits annotation mode like the panel toggle does
        // (the picker has already stopped itself; stopPicking guards on that).
        stopPicking();
      },
    },
    { passThroughHostIds: [Annotations.ROOT_ID, EDITOR_CARD_ROOT_ID] },
  );
  stagingEngine = new StagingEngine(previewEngine, changeTracker);
  cardMount = mountEditorCard();

  channel.send(
    createContentReady({
      url: location.href,
      title: document.title,
      connectedAt: Date.now(),
    }),
  );
  // Page-side changes survive reconnects (plan §37 in-memory) — resync the
  // panel's mirror so the Changes tab reflects reality after a reconnect.
  // Instructions also survive (module-level store), and an instruction-only
  // element has zero change records, so guard on instructions too — otherwise
  // a reconnect would silently drop it from the panel.
  if (changeTracker.all().length > 0 || Object.keys(instructionStore.all()).length > 0) {
    reportChanges();
  }

  channel.onMessage((message) => {
    if (isSidepanelPickingMessage(message)) {
      if (message.payload.enabled) startPicking();
      else stopPicking();
    } else if (isSidepanelSelectAncestorMessage(message)) {
      moveToAncestor(message.payload.uiTunerId);
    } else if (isSidepanelRevertChangeMessage(message)) {
      revertChange(message.payload.changeId);
    } else if (isSidepanelRevertElementMessage(message)) {
      revertElement(message.payload.elementId);
    } else if (isSidepanelResetChangesMessage(message)) {
      resetChanges();
    } else if (isSidepanelClearSelectionMessage(message)) {
      clearSelection();
    } else if (isSidepanelConfirmApplyMessage(message)) {
      void confirmApply(message.payload.changes);
    } else if (isSidepanelReloadPageMessage(message)) {
      // Static project (no HMR): reload so the freshly-written source renders.
      location.reload();
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
    // End any unsaved staging session, close the card, and tear down its host
    // so a reconnect mounts a fresh one (no duplicate root id).
    closeEditorSession();
    cardMount?.unmount();
    overlay?.unmount();
    annotations?.unmount();
    annotations = null;
    // Releases selection ids, except on elements with change records — their
    // preview overrides stay visible until the page reloads.
    tracker?.clear();
    selectionActive = false;
    channel = null;
    picker = null;
    overlay = null;
    tracker = null;
    stagingEngine = null;
    cardMount = null;
  });
});
