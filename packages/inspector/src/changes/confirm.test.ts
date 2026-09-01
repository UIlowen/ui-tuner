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
});
