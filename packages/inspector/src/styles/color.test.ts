import { describe, expect, it } from "vitest";
import { colorKey, rgbToHex } from "./color";

describe("rgbToHex", () => {
  it.each([
    ["rgb(255, 255, 255)", "#ffffff"],
    ["rgb(0, 0, 0)", "#000000"],
    ["rgb(16, 185, 129)", "#10b981"],
    ["rgba(16, 185, 129, 1)", "#10b981"],
    ["rgba(16, 185, 129, 0.5)", "#10b981"],
    ["rgba(139, 92, 246, .25)", "#8b5cf6"],
    ["rgb(16 185 129)", "#10b981"],
    ["rgb(16 185 129 / 0.5)", "#10b981"],
    ["#10b981", "#10b981"],
    ["#ABC", "#aabbcc"],
    [" RGB(1, 2, 3) ", "#010203"],
  ])("converts %s", (raw, expected) => {
    expect(rgbToHex(raw)).toBe(expected);
  });

  it.each(["transparent", "", "white", "var(--color)", "url(bg.png)"])(
    "returns null for %s",
    (raw) => {
      expect(rgbToHex(raw)).toBeNull();
    },
  );
});

describe("colorKey", () => {
  it.each([
    // Same color, different notations → identical key.
    ["rgb(47, 109, 246)", "#2f6df6"],
    ["rgb(47 109 246)", "#2f6df6"],
    ["#2F6DF6", "#2f6df6"],
    ["#2f6df6", "#2f6df6"],
  ])("gives %s and %s the same key", (a, b) => {
    expect(colorKey(a)).not.toBeNull();
    expect(colorKey(a)).toBe(colorKey(b));
  });

  it("keeps alpha: translucent rgb ≠ opaque hex of the same rgb", () => {
    expect(colorKey("rgba(47, 109, 246, 0.5)")).not.toBe(colorKey("#2f6df6"));
    expect(colorKey("rgba(47, 109, 246, 0.5)")).toBe(colorKey("rgba(47,109,246,0.5)"));
  });

  it("treats 8-digit hex alpha consistently with rgba", () => {
    // #2f6df680 = rgb(47,109,246) at alpha 0x80/255 ≈ 0.502
    expect(colorKey("#2f6df680")).toBe(colorKey("rgba(47, 109, 246, 0.502)"));
    // Fully opaque 8-digit hex collapses to the #rrggbb key.
    expect(colorKey("#2f6df6ff")).toBe(colorKey("#2f6df6"));
  });

  it.each(["", "var(--color)", "url(bg.png)"])("returns null for %s", (raw) => {
    expect(colorKey(raw)).toBeNull();
  });

  it("normalizes transparent", () => {
    expect(colorKey("transparent")).toBe("rgba(0,0,0,0)");
  });
});
