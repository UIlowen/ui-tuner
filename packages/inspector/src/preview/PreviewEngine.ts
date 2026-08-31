import { isStyleProperty } from "../styles/whitelist";

/**
 * Preview CSS Engine (plan §11): never writes `element.style` — all preview
 * overrides live in a single injected `<style id="ui-tuner-preview-style">`
 * generating `!important` rules keyed by `data-ui-tuner-id`.
 *
 * The rule text is rebuilt and compared on every mutation so unchanged
 * updates are no-ops (scrub frames with the same value cost nothing).
 */
export class PreviewEngine {
  static readonly STYLE_ID = "ui-tuner-preview-style";

  private styleEl: HTMLStyleElement | null = null;
  private lastText = "";
  /** elementId → CSS property → value. Insertion order is preserved. */
  private readonly overrides = new Map<string, Map<string, string>>();

  get isMounted(): boolean {
    return this.styleEl?.isConnected ?? false;
  }

  mount(): void {
    if (this.styleEl?.isConnected) return;
    let styleEl = document.getElementById(PreviewEngine.STYLE_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = PreviewEngine.STYLE_ID;
    }
    (document.head ?? document.documentElement).appendChild(styleEl);
    styleEl.textContent = this.lastText;
    this.styleEl = styleEl;
  }

  unmount(): void {
    this.styleEl?.remove();
    this.styleEl = null;
    this.lastText = "";
    this.overrides.clear();
  }

  /**
   * Set one property override on one element. `value: null` removes it.
   * Properties outside the whitelist (plan §7.2) are ignored.
   */
  setOverride(elementId: string, property: string, value: string | null): void {
    if (!isStyleProperty(property)) return;

    let elementRules = this.overrides.get(elementId);
    if (!elementRules) {
      if (value === null) return;
      elementRules = new Map();
      this.overrides.set(elementId, elementRules);
    }
    if (value === null) elementRules.delete(property);
    else elementRules.set(property, value);
    if (elementRules.size === 0) this.overrides.delete(elementId);

    this.sync();
  }

  /** Drop every override for one element (e.g. its selection was released). */
  removeElement(elementId: string): void {
    if (!this.overrides.has(elementId)) return;
    this.overrides.delete(elementId);
    this.sync();
  }

  hasElement(elementId: string): boolean {
    return this.overrides.has(elementId);
  }

  /** Current CSS text (test/inspection hook). */
  cssText(): string {
    return this.buildText();
  }

  private sync(): void {
    const text = this.buildText();
    if (text === this.lastText) return;
    this.lastText = text;
    if (this.styleEl) this.styleEl.textContent = text;
  }

  private buildText(): string {
    if (this.overrides.size === 0) return "";
    const blocks: string[] = [];
    for (const [elementId, rules] of this.overrides) {
      const declarations = [...rules.entries()]
        .map(([property, value]) => `  ${property}: ${value} !important;`)
        .join("\n");
      blocks.push(`[data-ui-tuner-id="${elementId}"] {\n${declarations}\n}`);
    }
    return blocks.join("\n\n");
  }
}
