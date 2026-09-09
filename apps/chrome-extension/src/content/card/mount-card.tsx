import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { usePrefsStore } from "../../state/prefs";
import { EditorCard } from "./EditorCard";
import { injectCardStyles } from "./inject-styles";
import { contrastTheme } from "./page-luminance";
import { placeNearAnchor, type AnchorRect } from "./placement";
import type { EditorCardProps } from "./types";

export const EDITOR_CARD_ROOT_ID = "ui-tuner-editor-card-root";

export interface CardMount {
  /**
   * Render the card. `anchor` is the target element's viewport rect — the card
   * opens beside it, clamped inside the viewport. Without an anchor the card
   * keeps its current position and is merely pulled back into view.
   */
  show(props: EditorCardProps, anchor?: AnchorRect): void;
  hide(): void;
  /** Tear down the React root and remove the host from the DOM (reconnect). */
  unmount(): void;
  readonly isOpen: boolean;
}

/** Topmost layer — above the annotations (2147483646) and the hover/selection
 *  overlay (2147483645): the card must never be covered by a bubble. */
const HOST_Z_INDEX = "2147483647";
/** Fallback position for a card shown without an anchor. */
const INITIAL_OFFSET = { x: 16, y: 16 };

/**
 * Owns the editor card's shadow host: a fixed, pointer-events:none overlay
 * whose only interactive child is the card itself (pointer-events:auto), so
 * clicks elsewhere fall through to the page. Applies the compiled card.css via
 * injectCardStyles, mirrors the resolved theme as the `dark` class on the host
 * (card.css scopes its dark tokens to `:host(.dark)`), renders EditorCard with
 * a React root, places the card beside its anchor element on open (see
 * placement.ts) and keeps it inside the viewport as it changes size, and
 * implements header drag (pointerdown on the drag handle →
 * pointermove translates the host, clamped to the viewport).
 *
 * The card is a separate JS context from the side panel: it reads locale/theme
 * from the same usePrefsStore, which the content script hydrates from
 * chrome.storage on connect. This mount subscribes to that store (and OS dark
 * mode) so the host's `dark` class follows the resolved theme.
 */
export function mountEditorCard(): CardMount {
  const host = document.createElement("div");
  host.id = EDITOR_CARD_ROOT_ID;
  host.style.cssText = `position:fixed;top:0;left:0;z-index:${HOST_Z_INDEX};pointer-events:none;`;

  const shadow = host.attachShadow({ mode: "open" });
  injectCardStyles(shadow);

  // Re-enable pointer events for the card alone; the host stays click-through.
  const container = document.createElement("div");
  container.style.pointerEvents = "auto";
  shadow.appendChild(container);

  document.documentElement.appendChild(host);

  const root: Root = createRoot(container);

  let open = false;
  const offset = { ...INITIAL_OFFSET };

  // --- Theme: contrast the page background so the card never blends in. ---
  // The card lives in its own shadow root and follows its own theme: it should
  // be dark on a light page and light on a dark page. Side panel theme is only
  // used as a locale source here; the card's visual theme is page-driven.
  const applyTheme = (): void => {
    host.classList.toggle("dark", contrastTheme() === "dark");
  };
  applyTheme();
  const unsubscribePrefs = usePrefsStore.subscribe((state, prev) => {
    if (state.theme !== prev.theme) applyTheme();
  });

  // --- Position / drag. ---
  const applyOffset = (): void => {
    host.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
  };
  const clampOffset = (): void => {
    const rect = container.getBoundingClientRect();
    const maxX = Math.max(0, window.innerWidth - rect.width);
    const maxY = Math.max(0, window.innerHeight - rect.height);
    offset.x = Math.min(Math.max(offset.x, 0), maxX);
    offset.y = Math.min(Math.max(offset.y, 0), maxY);
  };
  applyOffset();

  // Placement happens once, at open, against the size measured then — but the
  // card changes size afterwards (compact row ↔ expanded card is ~350px, and the
  // instruction textarea is user-resizable). Growing near the bottom edge would
  // push the footer off screen, where 取消/保存 cannot be clicked, so re-clamp
  // whenever the measured size changes. Moving the host cannot change the
  // container's size, so this cannot feed back into itself.
  const resizeObserver = new ResizeObserver(() => {
    clampOffset();
    applyOffset();
  });
  resizeObserver.observe(container);

  interface DragState {
    pointerId: number;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  }
  let drag: DragState | null = null;

  container.addEventListener("pointerdown", (event) => {
    // Only the header drag handle starts a drag; the rest of the card is UI.
    const onHandle = event
      .composedPath()
      .some((node) => node instanceof HTMLElement && node.hasAttribute("data-drag-handle"));
    if (!onHandle) return;
    event.preventDefault();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: offset.x,
      baseY: offset.y,
    };
    container.setPointerCapture(event.pointerId);
  });
  container.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    offset.x = drag.baseX + (event.clientX - drag.startX);
    offset.y = drag.baseY + (event.clientY - drag.startY);
    clampOffset();
    applyOffset();
  });
  const endDrag = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    if (container.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }
  };
  container.addEventListener("pointerup", endDrag);
  container.addEventListener("pointercancel", endDrag);

  // --- Click-outside dismiss (Codex-style). ---
  // Clicking outside the card rolls back unsaved edits and closes it. The
  // mousedown handler fires first (window capture, before the Picker's document
  // capture) and closes the card synchronously. The click from the same
  // physical click fires next; the click handler stopPropagation()s it so the
  // Picker never sees it — otherwise the click would select a new element and
  // reopen the card, defeating the dismiss.
  let currentOnDismiss: (() => void) | null = null;
  let justDismissed = false;
  let detachTimer: ReturnType<typeof setTimeout> | null = null;

  const onWindowMouseDown = (event: MouseEvent): void => {
    if (!open) return;
    if (event.composedPath().includes(container)) return;
    justDismissed = true;
    currentOnDismiss?.();
  };

  const onWindowClick = (event: MouseEvent): void => {
    if (open) return;
    if (event.composedPath().includes(container)) return;
    // Either we just dismissed (suppress the Picker's selection) or this is a
    // stale handler from a previous card session (suppress unconditionally —
    // the picker is not running or the card is closed, so the click is free).
    justDismissed = false;
    event.stopPropagation();
  };

  const attachClickOutside = (onDismiss: () => void): void => {
    currentOnDismiss = onDismiss;
    window.addEventListener("mousedown", onWindowMouseDown, true);
    window.addEventListener("click", onWindowClick, true);
  };

  const detachClickOutside = (): void => {
    currentOnDismiss = null;
    window.removeEventListener("mousedown", onWindowMouseDown, true);
    window.removeEventListener("click", onWindowClick, true);
    if (detachTimer !== null) {
      clearTimeout(detachTimer);
      detachTimer = null;
    }
  };

  return {
    show(props, anchor) {
      open = true;
      // Key by elementId: switching elements remounts the card with fresh
      // state (a reused card would leak A's instruction draft into B's 保存),
      // while re-showing the same element keeps the in-progress session.
      // Committed synchronously so the card's real size is measurable below —
      // placing against an unrendered (0×0) card would ignore every overflow.
      flushSync(() => {
        root.render(createElement(EditorCard, { ...props, key: props.elementId }));
      });
      if (anchor) {
        const rect = container.getBoundingClientRect();
        const placed = placeNearAnchor({
          card: { width: rect.width, height: rect.height },
          anchor,
          viewport: { width: window.innerWidth, height: window.innerHeight },
        });
        offset.x = placed.x;
        offset.y = placed.y;
      } else {
        // No anchor: the card may have grown near an edge — pull it back in.
        clampOffset();
      }
      applyOffset();
      applyTheme();
      justDismissed = false;
      attachClickOutside(props.onDismiss);
    },
    hide() {
      if (!open) return;
      open = false;
      root.render(null);
      if (justDismissed) {
        // The mousedown closed the card; the click from the same physical click
        // has not fired yet. Keep the click handler attached so it can
        // stopPropagation() on the Picker's behalf, then detach after the
        // event cycle settles.
        detachTimer = setTimeout(() => {
          detachTimer = null;
          detachClickOutside();
        }, 200);
      } else {
        detachClickOutside();
      }
    },
    unmount() {
      open = false;
      detachClickOutside();
      unsubscribePrefs();
      resizeObserver.disconnect();
      root.unmount();
      host.remove();
    },
    get isOpen() {
      return open;
    },
  };
}
