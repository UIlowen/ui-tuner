// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { injectCardStyles } from "./inject-styles";

// NOTE: vitest stubs CSS imports by default, so `card.css?inline` is an empty
// string here — the compiled-CSS content is verified at build time instead
// (grep dist/content.js for the :host-scoped tokens). This test covers the
// injection mechanism: whichever backend the DOM supports (constructed
// stylesheet or <style> fallback — jsdom lacks adoptedStyleSheets), the
// stylesheet ends up active on the shadow root without throwing.
describe("injectCardStyles", () => {
  it("activates the card stylesheet on an open shadow root", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });

    expect(() => injectCardStyles(shadow)).not.toThrow();

    const adopted = (shadow.adoptedStyleSheets?.length ?? 0) > 0;
    const styleEl = shadow.querySelector("style");
    expect(adopted || styleEl !== null).toBe(true);
  });
});
