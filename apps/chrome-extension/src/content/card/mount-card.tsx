import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { resolveTheme, usePrefsStore } from "../../state/prefs";
import { EditorCard } from "./EditorCard";
import { injectCardStyles } from "./inject-styles";
import type { EditorCardProps } from "./types";

export const EDITOR_CARD_ROOT_ID = "ui-tuner-editor-card-root";

export interface CardMount {
  show(props: EditorCardProps): void;
  hide(): void;
  /** Tear down the React root and remove the host from the DOM (reconnect). */
  unmount(): void;
  readonly isOpen: boolean;
}

/** Above every page layer (and one below the annotations/overlay max). */
const HOST_Z_INDEX = "2147483646";
/** Where the card first appears (top-left of the viewport). */
const INITIAL_OFFSET = { x: 16, y: 16 };

/**
 * Owns the editor card's shadow host: a fixed, pointer-events:none overlay
 * whose only interactive child is the card itself (pointer-events:auto), so
 * clicks elsewhere fall through to the page. Applies the compiled card.css via
 * injectCardStyles, mirrors the resolved theme as the `dark` class on the host
 * (card.css scopes its dark tokens to `:host(.dark)`), renders EditorCard with
 * a React root, and implements header drag (pointerdown on the drag handle →
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

  // --- Theme: mirror the resolved theme as `dark` on the shadow host. ---
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const applyTheme = (): void => {
    const { theme } = usePrefsStore.getState();
    host.classList.toggle("dark", resolveTheme(theme, media.matches) === "dark");
  };
  applyTheme();
  media.addEventListener("change", applyTheme);
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

  return {
    show(props) {
      open = true;
      root.render(createElement(EditorCard, props));
      // The card may have grown near an edge — pull it back into view.
      clampOffset();
      applyOffset();
    },
    hide() {
      if (!open) return;
      open = false;
      root.render(null);
    },
    unmount() {
      open = false;
      unsubscribePrefs();
      media.removeEventListener("change", applyTheme);
      root.unmount();
      host.remove();
    },
    get isOpen() {
      return open;
    },
  };
}
