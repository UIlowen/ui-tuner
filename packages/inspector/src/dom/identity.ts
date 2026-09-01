/**
 * Element identity (plan §11 / §21): the `data-ui-tuner-id` attribute is the
 * stable handle for a selected element, and `cssSelectorFor` builds a
 * selector that resolves back to the element via querySelector.
 */

export const UI_TUNER_ID_ATTR = "data-ui-tuner-id";

let idCounter = 0;

/** Assign (or return the existing) uiTunerId, e.g. `ut-000001`. */
export function assignUiTunerId(element: Element): string {
  const existing = element.getAttribute(UI_TUNER_ID_ATTR);
  if (existing) return existing;
  idCounter += 1;
  const id = `ut-${String(idCounter).padStart(6, "0")}`;
  element.setAttribute(UI_TUNER_ID_ATTR, id);
  return id;
}

export function readUiTunerId(element: Element): string | null {
  return element.getAttribute(UI_TUNER_ID_ATTR);
}

export function releaseUiTunerId(element: Element): void {
  element.removeAttribute(UI_TUNER_ID_ATTR);
}

/** Ids that are safe to use as a CSS anchor without escaping. */
const SAFE_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;

/**
 * Unique CSS selector for `element`: nth-of-type chain up to the nearest
 * safe `id` anchor (or `body`). Deterministic and resolvable via
 * `document.querySelector` back to the same element.
 */
export function cssSelectorFor(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.documentElement) {
    const rawId = current.getAttribute("id");
    if (rawId && SAFE_ID.test(rawId)) {
      segments.unshift(`#${rawId}`);
      break;
    }
    segments.unshift(nthOfTypeSegment(current));
    current = current.parentElement;
  }
  return segments.join(" > ");
}

function nthOfTypeSegment(element: Element): string {
  const tag = element.tagName.toLowerCase();
  if (element.tagName === "BODY") return tag;
  const parent = element.parentElement;
  if (!parent) return tag;
  let index = 0;
  for (const child of parent.children) {
    if (child.tagName === element.tagName) {
      index += 1;
      if (child === element) break;
    }
  }
  return `${tag}:nth-of-type(${index})`;
}

/** Single-line text preview, capped for payloads (plan §3.1 spirit). */
export function textPreview(element: Element, maxLength = 80): string | undefined {
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

const FINGERPRINT_MAX_CLASSES = 8;
const FINGERPRINT_MAX_CHILDREN = 8;

/**
 * Structural signature for plan §21 Element Identity, e.g.
 * `button.btn.btn-primary>[span,span]` — tag + id + classes + child tag
 * skeleton. Attribute churn (our own `data-ui-tuner-id`, preview styles)
 * does not affect it; used as a source-matching signal (M6) and groundwork
 * for §22 HMR relocation.
 */
export function domFingerprintFor(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.getAttribute("id");
  const classes = (element.getAttribute("class") ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, FINGERPRINT_MAX_CLASSES)
    .join(".");
  const children = Array.from(element.children)
    .slice(0, FINGERPRINT_MAX_CHILDREN)
    .map((child) => child.tagName.toLowerCase())
    .join(",");
  return `${tag}${id ? `#${id}` : ""}${classes ? `.${classes}` : ""}>[${children}]`;
}
