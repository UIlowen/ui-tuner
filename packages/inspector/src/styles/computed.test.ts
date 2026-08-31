import { describe, expect, it } from "vitest";
import { STYLE_PROPERTIES } from "./whitelist";
import { pickStyles, type StyleSource } from "./computed";

function fakeSource(values: Record<string, string>): StyleSource {
  return {
    getPropertyValue(property: string): string {
      return values[property] ?? "";
    },
  };
}

describe("pickStyles", () => {
  it("keeps only whitelisted non-empty properties", () => {
    const styles = pickStyles(
      fakeSource({
        display: "flex",
        gap: "24px",
        "z-index": "999",
        cursor: "pointer",
      }),
    );
    expect(styles).toEqual({ display: "flex", gap: "24px" });
  });

  it("reads every whitelisted property from the source", () => {
    const seen: string[] = [];
    pickStyles({
      getPropertyValue(property: string): string {
        seen.push(property);
        return "";
      },
    });
    expect(seen).toEqual([...STYLE_PROPERTIES]);
    expect(Object.keys(pickStyles(fakeSource({})))).toEqual([]);
  });

  it("trims values", () => {
    expect(pickStyles(fakeSource({ "font-size": " 16px " }))).toEqual({ "font-size": "16px" });
  });
});
