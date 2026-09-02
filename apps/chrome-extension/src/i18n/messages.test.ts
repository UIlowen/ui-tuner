import { describe, expect, it } from "vitest";
import { en, translate, zh } from "./messages";

describe("message dictionaries", () => {
  it("zh and en cover exactly the same keys", () => {
    const zhKeys = Object.keys(zh).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys).toEqual(zhKeys);
  });

  it("no message is an empty string", () => {
    for (const [key, value] of Object.entries(zh)) expect(value, `zh.${key}`).not.toBe("");
    for (const [key, value] of Object.entries(en)) expect(value, `en.${key}`).not.toBe("");
  });
});

describe("translate", () => {
  it("returns the locale's string for a key", () => {
    expect(translate("zh", "pick.start")).toBe("选取元素");
    expect(translate("en", "pick.start")).toBe("Select element");
  });

  it("interpolates {var} placeholders", () => {
    expect(translate("zh", "changes.pending", { count: 3 })).toBe("3 项待应用");
    expect(translate("en", "changes.pending", { count: 3 })).toBe("3 pending");
  });

  it("keeps unknown placeholders as-is", () => {
    expect(translate("zh", "changes.pending", {})).toBe("{count} 项待应用");
  });
});
