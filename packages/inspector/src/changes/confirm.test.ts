import { describe, expect, it } from "vitest";
import { cssValuesEqual, normalizeCssValue } from "./confirm";

describe("confirm (plan §29 compare)", () => {
  it("normalizes whitespace and case", () => {
    expect(normalizeCssValue("  16px  ")).toBe("16px");
    expect(normalizeCssValue("1px   solid   RED")).toBe("1px solid red");
  });

  it("matches equal computed values", () => {
    expect(cssValuesEqual("16px", "16px")).toBe(true);
    expect(cssValuesEqual(" 16px ", "16px")).toBe(true);
    expect(cssValuesEqual("RGB(0, 0, 0)", "rgb(0, 0, 0)")).toBe(true);
  });

  it("rejects different values", () => {
    expect(cssValuesEqual("16px", "24px")).toBe(false);
    expect(cssValuesEqual("16px", "16rem")).toBe(false);
  });

  it("treats the same color in different notations as equal", () => {
    // Chrome computed style reports rgb(); the swatch commits #hex.
    expect(cssValuesEqual("rgb(47, 109, 246)", "#2f6df6")).toBe(true);
    expect(cssValuesEqual("#2f6df6", "rgb(47,109,246)")).toBe(true);
    expect(cssValuesEqual("rgb(47 109 246)", "#2f6df6")).toBe(true);
    expect(cssValuesEqual("rgb(255, 0, 0)", "#ff0000")).toBe(true);
    expect(cssValuesEqual("#fff", "#ffffff")).toBe(true);
  });

  it("treats same-rgb different-alpha colors as different", () => {
    expect(cssValuesEqual("rgba(47, 109, 246, 0.5)", "rgb(47, 109, 246)")).toBe(false);
    expect(cssValuesEqual("rgba(47, 109, 246, 0.5)", "#2f6df6")).toBe(false);
  });

  it("treats different colors as different", () => {
    expect(cssValuesEqual("rgb(47, 109, 246)", "#2f6df7")).toBe(false);
    expect(cssValuesEqual("rgb(47, 109, 246)", "#000000")).toBe(false);
  });
});
