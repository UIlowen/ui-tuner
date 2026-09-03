import type { StyleChange } from "@ui-tuner/protocol";
import { UI_TUNER_ID_ATTR } from "../dom/identity";
import { ANNOTATIONS_HOST_STYLE, ANNOTATIONS_SHADOW_CSS } from "../styles/annotations";

export interface AnnotationsCallbacks {
  onOpenEditor?(elementId: string): void;
}

/**
 * Change-annotation layer: one bubble per annotated element, pinned to the
 * element's top-right corner; clicking a bubble dispatches
 * `onOpenEditor(elementId)` so the host page can open its editor card.
 * Annotated = the element has recorded changes, a saved natural-language
 * instruction, or both (an instruction-only element is a first-class
 * annotation). Bubbles re-measure every animation frame while any is visible
 * (same contract as Overlay), so scrolling and layout shifts stay correct.
 * Annotated elements keep their `data-ui-tuner-id` (SelectionTracker keepId),
 * which is how bubbles relocate their element after re-renders.
 */
export class Annotations {
  static readonly ROOT_ID = "ui-tuner-annotations-root";

  private host: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private bubbles = new Map<string, HTMLButtonElement>();
  /** Stable per-element annotation sequence numbers (1, 2, 3… by first-change order). */
  private numbers = new Map<string, number>();
  private nextNumber = 1;
  private rafId: number | null = null;

  constructor(private readonly callbacks: AnnotationsCallbacks = {}) {}

  /** Test/DI access to the mounted host. */
  get root(): HTMLDivElement | null {
    return this.host;
  }

  get isMounted(): boolean {
    return this.host?.isConnected ?? false;
  }

  /** Bubble sequence number for an annotated element, or null when it has neither changes nor an instruction. */
  numberFor(elementId: string): number | null {
    return this.numbers.get(elementId) ?? null;
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

    document.documentElement.appendChild(host);
    this.host = host;
    this.shadow = shadow;
  }

  unmount(): void {
    this.stopLoop();
    this.bubbles.clear();
    this.numbers.clear();
    this.nextNumber = 1;
    this.host?.remove();
    this.host = null;
    this.shadow = null;
  }

  /**
   * Re-render from the latest change records and saved instructions (call on
   * every mutation). An element with a non-blank instruction is annotated even
   * when it has zero property changes.
   */
  sync(changes: StyleChange[], instructions: Record<string, string> = {}): void {
    if (!this.shadow) return;
    const elementIds = new Set(changes.map((change) => change.elementId));
    for (const [elementId, instruction] of Object.entries(instructions)) {
      if (instruction.trim() !== "") elementIds.add(elementId);
    }

    // Reset-all restarts the numbering from 1.
    if (elementIds.size === 0) {
      this.numbers.clear();
      this.nextNumber = 1;
    }
    // Elements whose changes are fully gone lose their number (a later
    // re-change gets a fresh one).
    for (const elementId of this.numbers.keys()) {
      if (!elementIds.has(elementId)) this.numbers.delete(elementId);
    }
    // First-seen elements take the next sequence number.
    for (const elementId of elementIds) {
      if (!this.numbers.has(elementId)) this.numbers.set(elementId, this.nextNumber++);
    }

    // Drop bubbles whose element is no longer annotated.
    for (const [elementId, bubble] of this.bubbles) {
      if (!elementIds.has(elementId)) {
        bubble.remove();
        this.bubbles.delete(elementId);
      }
    }
    // Create bubbles for newly-annotated elements.
    for (const elementId of elementIds) {
      if (!this.bubbles.has(elementId)) {
        const bubble = document.createElement("button");
        bubble.type = "button";
        bubble.className = "bubble";
        bubble.addEventListener("click", () => this.callbacks.onOpenEditor?.(elementId));
        this.shadow.appendChild(bubble);
        this.bubbles.set(elementId, bubble);
      }
    }
    this.scheduleRender();
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
        continue;
      }
      anyVisible = true;
      bubble.textContent = String(this.numbers.get(elementId) ?? "");
      bubble.style.display = "block";
      bubble.style.left = `${rect.right}px`;
      bubble.style.top = `${rect.top}px`;
    }

    if (anyVisible) {
      this.scheduleRender();
    } else {
      this.stopLoop();
    }
  }
}
