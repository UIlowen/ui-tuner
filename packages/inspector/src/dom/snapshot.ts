import type { DomSnapshot } from "@ui-tuner/protocol";

/**
 * DOM snapshot (plan §3.1): selected element + parent + children, capped by a
 * single total character budget so one selection never floods the port.
 * Truncated strings end with an explicit `…` marker.
 */

export const MAX_HTML_LENGTH = 12_000;
const MAX_CHILDREN = 30;

function truncate(html: string, budget: number): string {
  if (html.length <= budget) return html;
  return `${html.slice(0, Math.max(0, budget - 1))}…`;
}

export function domSnapshotFor(element: Element): DomSnapshot {
  let budget = MAX_HTML_LENGTH;
  const snapshot: DomSnapshot = { outerHTML: truncate(element.outerHTML, budget) };
  budget -= snapshot.outerHTML.length;

  if (element.parentElement && budget > 0) {
    snapshot.parentHTML = truncate(element.parentElement.outerHTML, budget);
    budget -= snapshot.parentHTML.length;
  }

  const childrenHTML: string[] = [];
  for (const child of element.children) {
    if (budget <= 0 || childrenHTML.length >= MAX_CHILDREN) break;
    const html = truncate(child.outerHTML, budget);
    childrenHTML.push(html);
    budget -= html.length;
  }
  if (childrenHTML.length > 0) snapshot.childrenHTML = childrenHTML;
  return snapshot;
}
