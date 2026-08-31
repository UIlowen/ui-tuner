import type { BreadcrumbItem, SelectionPayload } from "@ui-tuner/protocol";
import { boundsFromRect } from "../measurement/rect";
import { assignUiTunerId, cssSelectorFor, releaseUiTunerId, textPreview } from "./identity";

/**
 * Owns the current selection: assigns uiTunerIds to the selected element and
 * its breadcrumb ancestors, builds protocol payloads, and releases the
 * attributes when the selection moves or clears.
 */
export class SelectionTracker {
  /** uiTunerId → element, for the current selection chain only. */
  private readonly registry = new Map<string, Element>();

  private current: Element | null = null;

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
        bounds: boundsFromRect(element.getBoundingClientRect()),
      },
      breadcrumb,
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
    for (const element of this.registry.values()) {
      releaseUiTunerId(element);
    }
    this.registry.clear();
  }
}
