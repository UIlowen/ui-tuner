import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assignUiTunerId,
  cssSelectorFor,
  releaseUiTunerId,
  textPreview,
  UI_TUNER_ID_ATTR,
} from "./identity";

describe("assignUiTunerId", () => {
  it("assigns sequential ids and sets the attribute", () => {
    const a = document.createElement("div");
    const b = document.createElement("div");
    const idA = assignUiTunerId(a);
    const idB = assignUiTunerId(b);
    expect(idA).toMatch(/^ut-\d{6}$/);
    expect(idB).toMatch(/^ut-\d{6}$/);
    expect(a.getAttribute(UI_TUNER_ID_ATTR)).toBe(idA);
    expect(b.getAttribute(UI_TUNER_ID_ATTR)).toBe(idB);
  });

  it("returns the existing id on re-assignment", () => {
    const el = document.createElement("div");
    const first = assignUiTunerId(el);
    expect(assignUiTunerId(el)).toBe(first);
  });

  it("release removes the attribute", () => {
    const el = document.createElement("div");
    assignUiTunerId(el);
    releaseUiTunerId(el);
    expect(el.hasAttribute(UI_TUNER_ID_ATTR)).toBe(false);
  });
});

describe("cssSelectorFor", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("builds an nth-of-type chain up to the nearest id anchor", () => {
    document.body.innerHTML = `
      <div id="app">
        <section><span>one</span></section>
        <section><span>two</span><button>cta</button></section>
      </div>
    `;
    const button = document.querySelector("button")!;
    const selector = cssSelectorFor(button);
    expect(selector).toBe("#app > section:nth-of-type(2) > button:nth-of-type(1)");
    expect(document.querySelector(selector)).toBe(button);
  });

  it("falls back to a body-rooted chain without ids", () => {
    document.body.innerHTML = "<div><p>a</p></div><div><p>b</p><p>c</p></div>";
    const lastP = document.querySelectorAll("p")[2]!;
    const selector = cssSelectorFor(lastP);
    expect(selector).toBe("body > div:nth-of-type(2) > p:nth-of-type(2)");
    expect(document.querySelector(selector)).toBe(lastP);
  });

  it("produces selectors unique to their element", () => {
    document.body.innerHTML = `
      <ul><li>1</li><li>2</li><li>3</li></ul>
      <ul><li>x</li></ul>
    `;
    const items = document.querySelectorAll("li");
    for (const item of items) {
      const matches = document.querySelectorAll(cssSelectorFor(item));
      expect(matches).toHaveLength(1);
      expect(matches[0]).toBe(item);
    }
  });
});

describe("textPreview", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("collapses whitespace to a single line", () => {
    const el = document.createElement("div");
    el.innerHTML = "<span>  Hello\n  world  </span>";
    expect(textPreview(el)).toBe("Hello world");
  });

  it("returns undefined for empty content", () => {
    const el = document.createElement("div");
    expect(textPreview(el)).toBeUndefined();
  });

  it("caps long text with an ellipsis", () => {
    const el = document.createElement("div");
    el.textContent = "a".repeat(100);
    const preview = textPreview(el, 10)!;
    expect(preview).toHaveLength(11);
    expect(preview.endsWith("…")).toBe(true);
  });
});
