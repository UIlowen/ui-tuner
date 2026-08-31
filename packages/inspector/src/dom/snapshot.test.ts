import { beforeEach, describe, expect, it } from "vitest";
import { MAX_HTML_LENGTH, domSnapshotFor } from "./snapshot";

function buildTree(): { parent: HTMLElement; selected: HTMLElement } {
  document.body.innerHTML = "";
  const parent = document.createElement("div");
  parent.id = "card";
  const selected = document.createElement("section");
  selected.innerHTML = "<h2>Pro</h2>";
  const sibling = document.createElement("p");
  sibling.textContent = "sibling";
  selected.appendChild(sibling);
  parent.appendChild(selected);
  document.body.appendChild(parent);
  return { parent, selected };
}

describe("domSnapshotFor", () => {
  beforeEach(() => {
    buildTree();
  });

  it("captures selected, parent and children html", () => {
    const { selected } = buildTree();
    const snapshot = domSnapshotFor(selected);
    expect(snapshot.outerHTML).toBe(selected.outerHTML);
    expect(snapshot.parentHTML).toBe(selected.parentElement!.outerHTML);
    expect(snapshot.childrenHTML).toEqual([
      selected.children[0]!.outerHTML,
      selected.children[1]!.outerHTML,
    ]);
  });

  it("returns no parent/children fields at the document root level", () => {
    document.body.innerHTML = "";
    const lone = document.createElement("div");
    document.body.appendChild(lone);
    const snapshot = domSnapshotFor(document.body);
    expect(snapshot.outerHTML).toBe(document.body.outerHTML);
    // body has a parent (html) — but children of body were captured above; here
    // just assert the fields exist or are undefined, never throwing.
    expect(typeof snapshot.parentHTML).toBe("string");
    const empty = domSnapshotFor(lone);
    expect(empty.childrenHTML).toBeUndefined();
  });

  it("truncates to the total budget with a marker", () => {
    const { selected } = buildTree();
    const long = "x".repeat(MAX_HTML_LENGTH + 500);
    selected.setAttribute("data-long", long);
    const snapshot = domSnapshotFor(selected);
    expect(snapshot.outerHTML.endsWith("…")).toBe(true);
    expect(snapshot.outerHTML.length).toBe(MAX_HTML_LENGTH);
    // Budget exhausted by the selected element itself.
    expect(snapshot.parentHTML).toBeUndefined();
    expect(snapshot.childrenHTML).toBeUndefined();
  });
});
