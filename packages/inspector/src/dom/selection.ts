import type { BreadcrumbItem, SelectionPayload } from "@ui-tuner/protocol";
import { boundsFromRect } from "../measurement/rect";
import { pickStyles } from "../styles/computed";
import {
  assignUiTunerId,
  cssSelectorFor,
  domFingerprintFor,
  releaseUiTunerId,
  textPreview,
} from "./identity";

/**
 * Owns the current selection: assigns uiTunerIds to the selected element and
 * its breadcrumb ancestors, builds protocol payloads, and releases the
 * attributes when the selection moves or clears.
 */
export interface SelectionTrackerOptions {
  /**
   * Return true to keep an element's `data-ui-tuner-id` when the selection
   * moves away — required for elements carrying preview overrides (plan §11:
   * the override CSS targets that attribute) or change records (plan §12).
   */
  keepId?: (uiTunerId: string) => boolean;
}

export class SelectionTracker {
  /** uiTunerId → element, for the current selection chain only. */
  private readonly registry = new Map<string, Element>();

  private current: Element | null = null;

  constructor(private readonly options: SelectionTrackerOptions = {}) {}

  get selected(): Element | null {
    return this.current;
  }

  select(element: Element): SelectionPayload {
    this.releaseAll();
    this.current = element;
    const breadcrumb = this.buildBreadcrumb(element);
    return {
      element: {
        id: breadcrumb[0]!.id,
        tagName: element.tagName.toLowerCase(),
        selector: cssSelectorFor(element),
        text: textPreview(element),
        domFingerprint: domFingerprintFor(element),
        bounds: boundsFromRect(element.getBoundingClientRect()),
      },
      breadcrumb,
      styles: pickStyles(getComputedStyle(element)),
      pickedAt: Date.now(),
    };
  }

  /** Breadcrumb click: jump to the ancestor with this id (must be live). */
  moveToAncestor(uiTunerId: string): SelectionPayload | null {
    const element = this.registry.get(uiTunerId);
    if (!element || !element.isConnected) return null;
    return this.select(element);
  }

  /** ⌘↑: select the parent element (stops below <html>). */
  moveToParent(): SelectionPayload | null {
    const parent = this.current?.parentElement;
    if (!parent || parent === document.documentElement) return null;
    return this.select(parent);
  }

  clear(): void {
    this.releaseAll();
    this.current = null;
  }

  /** Nearest-first breadcrumb ending at <body>; assigns ids along the way. */
  private buildBreadcrumb(element: Element): BreadcrumbItem[] {
    const items: BreadcrumbItem[] = [];
    let current: Element | null = element;
    while (current && current !== document.documentElement) {
      const id = assignUiTunerId(current);
      this.registry.set(id, current);
      items.push({ tagName: current.tagName.toLowerCase(), id });
      current = current.parentElement;
    }
    return items;
  }

  private releaseAll(): void {
    for (const [id, element] of this.registry) {
      if (this.options.keepId?.(id)) continue; // keep the attribute for preview overrides
      releaseUiTunerId(element);
    }
    this.registry.clear();
  }
}
