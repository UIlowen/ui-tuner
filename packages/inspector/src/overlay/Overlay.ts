import { LABEL_OFFSET_PX, OVERLAY_HOST_STYLE, OVERLAY_SHADOW_CSS } from "../styles/overlay";

/**
 * Independent overlay layer (plan §2.2): one host div (`ui-tuner-overlay-root`)
 * appended to <html>, containing a Shadow Root with hover/selected boxes.
 *
 * Boxes track **element references** and re-measure every animation frame
 * while at least one target is set — so scrolling, resizing and layout shifts
 * stay correct without listening to any events. The rAF loop stops on its
 * own when no target remains.
 */
export class Overlay {
  static readonly ROOT_ID = "ui-tuner-overlay-root";

  private host: HTMLDivElement | null = null;
  private hoverBox: HTMLDivElement | null = null;
  private hoverLabel: HTMLDivElement | null = null;
  private selectBox: HTMLDivElement | null = null;
  private selectLabel: HTMLDivElement | null = null;
  private hoverElement: Element | null = null;
  private selectedElement: Element | null = null;
  private selectedLostHandler: (() => void) | null = null;
  private rafId: number | null = null;

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
    host.id = Overlay.ROOT_ID;
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = OVERLAY_HOST_STYLE;

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = OVERLAY_SHADOW_CSS;
    shadow.appendChild(style);
    this.hoverBox = this.createBox(shadow, "hover-box");
    this.hoverLabel = this.createLabel(shadow, "hover-label");
    this.selectBox = this.createBox(shadow, "selected-box");
    this.selectLabel = this.createLabel(shadow, "selected-label");

    document.documentElement.appendChild(host);
    this.host = host;
  }

  unmount(): void {
    this.stopLoop();
    this.hoverElement = null;
    this.selectedElement = null;
    this.selectedLostHandler = null;
    this.host?.remove();
    this.host = null;
    this.hoverBox = this.hoverLabel = this.selectBox = this.selectLabel = null;
  }

  setHover(element: Element | null): void {
    this.hoverElement = element;
    this.scheduleRender();
  }

  /**
   * Track the selected element. `onLost` fires once when the element leaves
   * the DOM (HMR, rerender) — the caller decides how to recover (plan §22:
   * never silently keep a wrong element).
   */
  setSelected(element: Element | null, onLost?: () => void): void {
    this.selectedElement = element;
    this.selectedLostHandler = element ? (onLost ?? null) : null;
    this.scheduleRender();
  }

  private createBox(shadow: ShadowRoot, className: string): HTMLDivElement {
    const box = document.createElement("div");
    box.className = `box ${className}`;
    shadow.appendChild(box);
    return box;
  }

  private createLabel(shadow: ShadowRoot, className: string): HTMLDivElement {
    const label = document.createElement("div");
    label.className = `label ${className}`;
    shadow.appendChild(label);
    return label;
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

    // A selected element that left the DOM is hidden immediately — never
    // paint a stale box for it (plan §22: no silent wrong elements).
    if (this.selectedElement && !this.selectedElement.isConnected) {
      const handler = this.selectedLostHandler;
      this.selectedElement = null;
      this.selectedLostHandler = null;
      this.paint(null, this.selectBox, this.selectLabel);
      handler?.();
    } else {
      this.paint(this.selectedElement, this.selectBox, this.selectLabel);
    }
    this.paint(this.hoverElement, this.hoverBox, this.hoverLabel);

    if (this.hoverElement || this.selectedElement) {
      this.scheduleRender();
    } else {
      this.stopLoop();
    }
  }

  private paint(
    element: Element | null,
    box: HTMLDivElement | null,
    label: HTMLDivElement | null,
  ): void {
    if (!box || !label) return;
    const rect = element?.getBoundingClientRect();
    if (!element || !rect || (rect.width === 0 && rect.height === 0)) {
      box.style.display = "none";
      label.style.display = "none";
      return;
    }
    box.style.display = "block";
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;

    label.textContent = `${element.tagName.toLowerCase()}  ${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    label.style.display = "block";
    label.style.left = `${rect.left}px`;
    label.style.top =
      rect.top >= LABEL_OFFSET_PX ? `${rect.top - LABEL_OFFSET_PX}px` : `${rect.bottom + 4}px`;
  }
}
