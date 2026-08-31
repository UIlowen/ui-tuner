import { describe, expect, it } from "vitest";
import { rgbToHex } from "./color";

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
