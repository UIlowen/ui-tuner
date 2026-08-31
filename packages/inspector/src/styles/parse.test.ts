import { describe, expect, it } from "vitest";
import { clamp, formatCssValue, formatNumber, parseCssValue, scrubMultiplier } from "./parse";

describe("parseCssValue", () => {
  it.each([
    ["16px", { value: 16, unit: "px" }],
    ["-8px", { value: -8, unit: "px" }],
    ["1.5", { value: 1.5, unit: "" }],
    ["1.5rem", { value: 1.5, unit: "rem" }],
    ["50%", { value: 50, unit: "%" }],
    [" 24px ", { value: 24, unit: "px" }],
    ["100vh", { value: 100, unit: "vh" }],
  ])("parses %s", (raw, expected) => {
    expect(parseCssValue(raw)).toEqual(expected);
  });

  it.each(["auto", "normal", "fit-content", "1px 2px", "", "16 px", "calc(100% - 8px)"])(
    "rejects %s",
    (raw) => {
      expect(parseCssValue(raw)).toBeNull();
    },
  );
});

describe("formatting", () => {
  it("formats numbers without trailing zeros", () => {
    expect(formatNumber(16)).toBe("16");
    expect(formatNumber(1.5)).toBe("1.5");
    expect(formatNumber(1.25)).toBe("1.25");
    expect(formatNumber(16.999)).toBe("17");
    expect(formatNumber(-0.30000000000000004)).toBe("-0.3");
  });

  it("formats css values with units", () => {
    expect(formatCssValue(24, "px")).toBe("24px");
    expect(formatCssValue(1.5, "")).toBe("1.5");
  });
});

describe("scrubMultiplier", () => {
  it("follows plan §10 modifiers", () => {
    expect(scrubMultiplier({ shift: false, alt: false })).toBe(1);
    expect(scrubMultiplier({ shift: true, alt: false })).toBe(10);
    expect(scrubMultiplier({ shift: false, alt: true })).toBe(0.1);
    // Shift wins when both are held.
    expect(scrubMultiplier({ shift: true, alt: true })).toBe(10);
  });
});

describe("clamp", () => {
  it("respects optional bounds", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0)).toBe(0);
    expect(clamp(5)).toBe(5);
  });
});
