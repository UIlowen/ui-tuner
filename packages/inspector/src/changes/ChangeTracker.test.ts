import { describe, expect, it } from "vitest";
import { ChangeTracker } from "./ChangeTracker";

describe("ChangeTracker", () => {
  it("captures the original value on first record only", () => {
    const tracker = new ChangeTracker();
    const first = tracker.record("ut-000001", "gap", "20px", "24px");
    // Scrub frames update nextValue without losing the original.
    const second = tracker.record("ut-000001", "gap", "16px", "ignored");

    expect(first.id).toBe(second.id);
    expect(tracker.find("ut-000001", "gap")).toEqual({
      id: "ch-000001",
      elementId: "ut-000001",
      property: "gap",
      previousValue: "24px",
      nextValue: "16px",
      source: "manual",
      createdAt: first.createdAt,
    });
  });

  it("keeps one record per (element, property) pair across elements", () => {
    const tracker = new ChangeTracker();
    tracker.record("ut-000001", "gap", "16px", "24px");
    tracker.record("ut-000002", "gap", "8px", "24px");
    tracker.record("ut-000001", "height", "36px", "40px");

    expect(tracker.all()).toHaveLength(3);
    expect(tracker.hasChangesFor("ut-000001")).toBe(true);
    expect(tracker.hasChangesFor("ut-000003")).toBe(false);
  });

  it("revertProperty removes and returns the record", () => {
    const tracker = new ChangeTracker();
    tracker.record("ut-000001", "gap", "16px", "24px");

    expect(tracker.revertProperty("ut-000001", "gap")!.property).toBe("gap");
    expect(tracker.revertProperty("ut-000001", "gap")).toBeNull();
    expect(tracker.all()).toHaveLength(0);
    expect(tracker.hasChangesFor("ut-000001")).toBe(false);
  });

  it("lists changes oldest first", () => {
    const tracker = new ChangeTracker();
    tracker.record("ut-000001", "gap", "16px", "24px");
    tracker.record("ut-000002", "height", "36px", "40px");
    expect(tracker.all().map((change) => change.id)).toEqual(["ch-000001", "ch-000002"]);
  });
});
