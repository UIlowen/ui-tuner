import { beforeEach, describe, expect, it } from "vitest";
import { UI_TUNER_ID_ATTR } from "./identity";
import { SelectionTracker } from "./selection";

function mockRect(element: Element, rect: { x: number; y: number; width: number; height: number }) {
  element.getBoundingClientRect = () =>
    ({
      ...rect,
      top: rect.y,
      left: rect.x,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe("SelectionTracker", () => {
  let wrapper: HTMLDivElement;
  let section: HTMLElement;
  let button: HTMLButtonElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    wrapper = document.createElement("div");
    wrapper.className = "wrapper";
    section = document.createElement("section");
    section.className = "card";
    button = document.createElement("button");
    button.textContent = "立即订阅";
    section.appendChild(button);
    wrapper.appendChild(section);
    document.body.appendChild(wrapper);
    mockRect(button, { x: 10.4, y: 20.6, width: 120.2, height: 40.5 });
  });

  it("select builds a protocol payload with identity and bounds", () => {
    const tracker = new SelectionTracker();
    const payload = tracker.select(button);

    expect(payload.element.id).toBe("ut-000001");
    expect(payload.element.tagName).toBe("button");
    expect(payload.element.text).toBe("立即订阅");
    expect(payload.element.bounds).toEqual({ x: 10, y: 21, width: 120, height: 41 });
    expect(payload.element.selector).toContain("button:nth-of-type(1)");
    expect(document.querySelector(payload.element.selector)).toBe(button);
    expect(tracker.selected).toBe(button);
  });

  it("assigns breadcrumb ids nearest-first down to body", () => {
    const tracker = new SelectionTracker();
    const { breadcrumb } = tracker.select(button);

    expect(breadcrumb.map((item) => item.tagName)).toEqual(["button", "section", "div", "body"]);
    for (const item of breadcrumb) {
      expect(document.querySelector(`[${UI_TUNER_ID_ATTR}="${item.id}"]`)).toBeTruthy();
    }
  });

  it("moveToParent selects the parent and releases stale ids", () => {
    const tracker = new SelectionTracker();
    tracker.select(button);
    const buttonId = tracker.selected!.getAttribute(UI_TUNER_ID_ATTR)!;

    const payload = tracker.moveToParent()!;

    expect(payload.element.tagName).toBe("section");
    expect(tracker.selected).toBe(section);
    // The previous leaf no longer carries an id attribute.
    expect(button.hasAttribute(UI_TUNER_ID_ATTR)).toBe(false);
    expect(buttonId).toBeTruthy();
  });

  it("moveToParent stops below html", () => {
    const tracker = new SelectionTracker();
    tracker.select(document.body);
    expect(tracker.moveToParent()).toBeNull();
  });

  it("moveToAncestor jumps via uiTunerId and rejects stale ids", () => {
    const tracker = new SelectionTracker();
    tracker.select(button);
    const bodyId = document.body.getAttribute(UI_TUNER_ID_ATTR)!;

    expect(tracker.moveToAncestor(bodyId)!.element.tagName).toBe("body");
    expect(tracker.moveToAncestor("ut-999999")).toBeNull();

    // Element removed from the DOM → ancestor jump must not resolve.
    const stale = document.createElement("div");
    document.body.appendChild(stale);
    const staleId = stale.getAttribute(UI_TUNER_ID_ATTR) ?? "ut-000099";
    stale.setAttribute(UI_TUNER_ID_ATTR, staleId);
    stale.remove();
    expect(tracker.moveToAncestor(staleId)).toBeNull();
  });

  it("clear removes every id attribute", () => {
    const tracker = new SelectionTracker();
    tracker.select(button);
    tracker.clear();

    expect(document.querySelectorAll(`[${UI_TUNER_ID_ATTR}]`)).toHaveLength(0);
    expect(tracker.selected).toBeNull();
  });

  it("keeps ids of elements with preview changes when the selection moves (plan §11/§12)", () => {
    const tracker = new SelectionTracker({ keepId: () => true });
    tracker.select(button);
    const buttonId = button.getAttribute(UI_TUNER_ID_ATTR)!;

    tracker.moveToParent();

    // The override CSS targets this attribute — it must survive the move.
    expect(button.getAttribute(UI_TUNER_ID_ATTR)).toBe(buttonId);
    expect(tracker.selected).toBe(section);
  });

  it("re-selecting an element with a kept id reuses that id", () => {
    const tracker = new SelectionTracker({ keepId: () => true });
    tracker.select(button);
    const buttonId = button.getAttribute(UI_TUNER_ID_ATTR)!;
    tracker.moveToParent();

    tracker.select(button);

    expect(button.getAttribute(UI_TUNER_ID_ATTR)).toBe(buttonId);
    expect(tracker.selected!.getAttribute(UI_TUNER_ID_ATTR)).toBe(buttonId);
  });
});
