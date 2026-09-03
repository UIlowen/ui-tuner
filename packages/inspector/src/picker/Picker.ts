/**
 * Edit-mode controller (plan §2.1/§2.3): while enabled, tracks the element
 * under the cursor and reports clicks. Chrome-free — attach to `document`.
 *
 * Performance contract (plan §33): the pointer path does nothing but
 * `elementFromPoint` (rAF-throttled) and reports to callbacks. Selecting a
 * target is the caller's business (Overlay / messaging), not the Picker's.
 */
export interface PickerCallbacks {
  onHoverChange?(element: Element | null): void;
  onSelect?(element: Element): void;
  /** Esc pressed while picking. The Picker stops itself before calling. */
  onCancel?(): void;
}

export interface PickerOptions {
  /**
   * Host element ids of our own annotation UI (e.g. Annotations.ROOT_ID).
   * Clicks inside them pass through untouched while picking — otherwise the
   * annotation popover's buttons would be unclickable in annotation mode.
   */
  passThroughHostIds?: string[];
}

export class Picker {
  private enabled = false;
  private pointer: { x: number; y: number } | null = null;
  private lastHovered: Element | null = null;
  private rafId: number | null = null;

  constructor(
    private readonly callbacks: PickerCallbacks = {},
    private readonly options: PickerOptions = {},
  ) {}

  get isEnabled(): boolean {
    return this.enabled;
  }

  start(): void {
    if (this.enabled) return;
    this.enabled = true;
    document.addEventListener("mousemove", this.onMouseMove, { passive: true });
    document.addEventListener("mouseleave", this.onMouseLeave);
    // Capture + preventDefault so the page does not focus/drag/select while picking.
    document.addEventListener("mousedown", this.onSuppressEvent, true);
    document.addEventListener("click", this.onClick, true);
    document.addEventListener("keydown", this.onKeyDown, true);
    this.tick();
  }

  stop(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.pointer = null;
    this.lastHovered = null;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mouseleave", this.onMouseLeave);
    document.removeEventListener("mousedown", this.onSuppressEvent, true);
    document.removeEventListener("click", this.onClick, true);
    document.removeEventListener("keydown", this.onKeyDown, true);
  }

  private readonly onMouseMove = (event: MouseEvent) => {
    this.pointer = { x: event.clientX, y: event.clientY };
  };

  private readonly onMouseLeave = () => {
    this.pointer = null;
    this.emitHover(null);
  };

  private isPassThrough(event: Event): boolean {
    const ids = this.options.passThroughHostIds;
    if (!ids || ids.length === 0) return false;
    return event
      .composedPath()
      .some((node) => node instanceof Element && node.id !== "" && ids.includes(node.id));
  }

  private readonly onSuppressEvent = (event: Event) => {
    if (this.isPassThrough(event)) return;
    event.preventDefault();
  };

  private readonly onClick = (event: MouseEvent) => {
    if (this.isPassThrough(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const element = this.resolveElement(event.clientX, event.clientY);
    if (element) this.callbacks.onSelect?.(element);
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    this.stop();
    this.callbacks.onCancel?.();
  };

  private resolveElement(x: number, y: number): Element | null {
    const element = document.elementFromPoint(x, y);
    if (!element) return null;
    // Never resolve into our own overlay (defensive; it is pointer-events:none).
    if (element.closest?.("#ui-tuner-overlay-root")) return null;
    for (const id of this.options.passThroughHostIds ?? []) {
      if (element.closest?.(`#${id}`)) return null;
    }
    return element;
  }

  private readonly tick = () => {
    if (!this.enabled) return;
    if (this.pointer) {
      this.emitHover(this.resolveElement(this.pointer.x, this.pointer.y));
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  private emitHover(element: Element | null): void {
    if (element === this.lastHovered) return;
    this.lastHovered = element;
    this.callbacks.onHoverChange?.(element);
  }
}
