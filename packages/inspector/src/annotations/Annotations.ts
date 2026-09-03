import type { StyleChange } from "@ui-tuner/protocol";
import { UI_TUNER_ID_ATTR } from "../dom/identity";
import { ANNOTATIONS_HOST_STYLE, ANNOTATIONS_SHADOW_CSS } from "../styles/annotations";

export interface AnnotationsLabels {
  revertElement: string;
  closeLabel: string;
}

export interface AnnotationsCallbacks {
  onRevertElement?(elementId: string): void;
}

/**
 * Change-annotation layer: one bubble per element with recorded changes,
 * pinned to the element's top-right corner; clicking a bubble toggles a
 * popover listing that element's changes. Bubbles re-measure every animation
 * frame while any is visible (same contract as Overlay), so scrolling and
 * layout shifts stay correct. Elements with changes keep their
 * `data-ui-tuner-id` (SelectionTracker keepId), which is how bubbles relocate
 * their element after re-renders.
 */
export class Annotations {
  static readonly ROOT_ID = "ui-tuner-annotations-root";

  private host: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private popover: HTMLDivElement | null = null;
  private bubbles = new Map<string, HTMLButtonElement>();
  private openFor: string | null = null;
  private changes: StyleChange[] = [];
  private rafId: number | null = null;

  constructor(
    private readonly labels: AnnotationsLabels,
    private readonly callbacks: AnnotationsCallbacks = {},
  ) {}

  /** Test/DI access to the mounted host. */
  get root(): HTMLDivElement | null {
    return this.host;
  }

  get isMounted(): boolean {
    return this.host?.isConnected ?? false;
  }

  mount(): void {
    if (this.host?.isConnected) return;

    const host = document.createElement("div");
    host.id = Annotations.ROOT_ID;
    host.style.cssText = ANNOTATIONS_HOST_STYLE;

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = ANNOTATIONS_SHADOW_CSS;
    shadow.appendChild(style);

    const popover = document.createElement("div");
    popover.className = "popover";
    shadow.appendChild(popover);

    document.documentElement.appendChild(host);
    this.host = host;
    this.shadow = shadow;
    this.popover = popover;
  }

  unmount(): void {
    this.stopLoop();
    this.bubbles.clear();
    this.openFor = null;
    this.changes = [];
    this.host?.remove();
    this.host = null;
    this.shadow = null;
    this.popover = null;
  }

  /** Re-render from the latest change records (call on every mutation). */
  sync(changes: StyleChange[]): void {
    this.changes = changes;
    if (!this.shadow) return;
    const elementIds = new Set(changes.map((change) => change.elementId));

    // Drop bubbles whose element no longer has changes.
    for (const [elementId, bubble] of this.bubbles) {
      if (!elementIds.has(elementId)) {
        bubble.remove();
        this.bubbles.delete(elementId);
      }
    }
    // Create bubbles for newly-changed elements.
    for (const elementId of elementIds) {
      if (!this.bubbles.has(elementId)) {
        const bubble = document.createElement("button");
        bubble.type = "button";
        bubble.className = "bubble";
        bubble.addEventListener("click", () => this.togglePopover(elementId));
        this.shadow.appendChild(bubble);
        this.bubbles.set(elementId, bubble);
      }
    }
    if (this.openFor && !elementIds.has(this.openFor)) this.closePopover();
    this.scheduleRender();
  }

  private togglePopover(elementId: string): void {
    if (this.openFor === elementId) {
      this.closePopover();
      return;
    }
    this.openFor = elementId;
    this.renderPopover();
    this.scheduleRender();
  }

  private closePopover(): void {
    this.openFor = null;
    if (this.popover) this.popover.style.display = "none";
  }

  private renderPopover(): void {
    const popover = this.popover;
    if (!popover || !this.openFor) return;
    const elementId = this.openFor;
    popover.textContent = "";

    const list = document.createElement("ul");
    for (const change of this.changes.filter((c) => c.elementId === elementId)) {
      const row = document.createElement("li");
      row.textContent = `${change.property}: ${change.previousValue || "—"} → ${change.nextValue}`;
      list.appendChild(row);
    }
    popover.appendChild(list);

    const revert = document.createElement("button");
    revert.type = "button";
    revert.className = "revert";
    revert.textContent = this.labels.revertElement;
    revert.addEventListener("click", () => this.callbacks.onRevertElement?.(elementId));
    popover.appendChild(revert);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "close";
    close.setAttribute("aria-label", this.labels.closeLabel);
    close.textContent = "✕";
    close.addEventListener("click", () => this.closePopover());
    popover.appendChild(close);

    popover.style.display = "block";
  }

  private scheduleRender(): void {
    if (this.rafId !== null || !this.host) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.render();
    });
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private render(): void {
    if (!this.host) return;
    let anyVisible = false;

    for (const [elementId, bubble] of this.bubbles) {
      const element = document.querySelector(`[${UI_TUNER_ID_ATTR}="${elementId}"]`);
      // Never paint a bubble for a detached/zero-size element (plan §22 spirit).
      const rect = element?.isConnected ? element.getBoundingClientRect() : null;
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        bubble.style.display = "none";
        if (this.openFor === elementId) this.closePopover();
        continue;
      }
      anyVisible = true;
      bubble.textContent = String(
        this.changes.filter((c) => c.elementId === elementId).length,
      );
      bubble.style.display = "block";
      bubble.style.left = `${rect.right}px`;
      bubble.style.top = `${rect.top}px`;

      if (this.openFor === elementId && this.popover) {
        this.popover.style.left = `${Math.max(8, rect.right - 12)}px`;
        this.popover.style.top = `${rect.top + 24}px`;
      }
    }

    if (anyVisible) {
      this.scheduleRender();
    } else {
      this.stopLoop();
    }
  }
}
