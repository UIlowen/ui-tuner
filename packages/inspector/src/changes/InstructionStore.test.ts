// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { InstructionStore } from "./InstructionStore";

describe("InstructionStore", () => {
  it("sets and gets an element's instruction", () => {
    const store = new InstructionStore();
    store.set("ut-1", "整体紧凑一点");
    expect(store.get("ut-1")).toBe("整体紧凑一点");
  });

  it("treats an empty string as delete", () => {
    const store = new InstructionStore();
    store.set("ut-1", "x");
    store.set("ut-1", "  ");
    expect(store.get("ut-1")).toBeUndefined();
    expect(store.all()).toEqual({});
  });

  it("delete removes one element; clear removes all", () => {
    const store = new InstructionStore();
    store.set("ut-1", "a");
    store.set("ut-2", "b");
    store.delete("ut-1");
    expect(store.all()).toEqual({ "ut-2": "b" });
    store.clear();
    expect(store.all()).toEqual({});
  });
});
