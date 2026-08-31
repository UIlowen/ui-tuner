import { beforeEach, describe, expect, it } from "vitest";
import { PreviewEngine } from "./PreviewEngine";

describe("PreviewEngine", () => {
  let engine: PreviewEngine;

  beforeEach(() => {
    document.head.innerHTML = "";
    engine = new PreviewEngine();
  });

  it("mounts a single style tag lazily and reuses it", () => {
    expect(engine.isMounted).toBe(false);
    expect(document.getElementById(PreviewEngine.STYLE_ID)).toBeNull();

    engine.mount();
    engine.mount();

    const styleEl = document.getElementById(PreviewEngine.STYLE_ID);
    expect(styleEl).not.toBeNull();
    expect(styleEl!.tagName).toBe("STYLE");
  });

  it("generates grouped !important rules per element (plan §11)", () => {
    engine.mount();
    engine.setOverride("ut-000001", "gap", "16px");
    engine.setOverride("ut-000001", "padding-top", "20px");
    engine.setOverride("ut-000002", "height", "36px");

    expect(engine.cssText()).toBe(
      [
        '[data-ui-tuner-id="ut-000001"] {\n  gap: 16px !important;\n  padding-top: 20px !important;\n}',
        '[data-ui-tuner-id="ut-000002"] {\n  height: 36px !important;\n}',
      ].join("\n\n"),
    );
    expect(document.getElementById(PreviewEngine.STYLE_ID)!.textContent).toBe(engine.cssText());
  });

  it("ignores properties outside the whitelist", () => {
    engine.mount();
    engine.setOverride("ut-000001", "z-index", "999");
    expect(engine.cssText()).toBe("");
  });

  it("removes a single override with null and drops empty element blocks", () => {
    engine.mount();
    engine.setOverride("ut-000001", "gap", "16px");
    engine.setOverride("ut-000001", "height", "36px");
    engine.setOverride("ut-000002", "gap", "8px");

    engine.setOverride("ut-000001", "gap", null);
    expect(engine.cssText()).toBe(
      [
        '[data-ui-tuner-id="ut-000001"] {\n  height: 36px !important;\n}',
        '[data-ui-tuner-id="ut-000002"] {\n  gap: 8px !important;\n}',
      ].join("\n\n"),
    );

    engine.setOverride("ut-000001", "height", null);
    expect(engine.cssText()).toBe('[data-ui-tuner-id="ut-000002"] {\n  gap: 8px !important;\n}');
    expect(engine.hasElement("ut-000001")).toBe(false);
  });

  it("setting the same value twice is a no-op for the style tag", () => {
    engine.mount();
    engine.setOverride("ut-000001", "gap", "16px");
    const before = document.getElementById(PreviewEngine.STYLE_ID)!.textContent;
    engine.setOverride("ut-000001", "gap", "16px");
    expect(document.getElementById(PreviewEngine.STYLE_ID)!.textContent).toBe(before);
  });

  it("removeElement drops every override for that element", () => {
    engine.mount();
    engine.setOverride("ut-000001", "gap", "16px");
    engine.setOverride("ut-000001", "height", "36px");
    engine.removeElement("ut-000001");
    expect(engine.cssText()).toBe("");
  });

  it("unmount removes the tag and clears all state", () => {
    engine.mount();
    engine.setOverride("ut-000001", "gap", "16px");
    engine.unmount();
    expect(document.getElementById(PreviewEngine.STYLE_ID)).toBeNull();
    expect(engine.cssText()).toBe("");
    expect(engine.isMounted).toBe(false);
  });
});
