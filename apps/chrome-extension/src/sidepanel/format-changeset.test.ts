import { describe, expect, it } from "vitest";
import type { SelectionPayload, SourceResolution, StyleChange } from "@ui-tuner/protocol";
import { formatChangesetForCopy } from "./format-changeset";

const change = (over: Partial<StyleChange>): StyleChange => ({
  id: "c1",
  elementId: "ut-a",
  property: "height",
  previousValue: "38px",
  nextValue: "52px",
  source: "manual",
  createdAt: 1,
  ...over,
});

const selection: SelectionPayload = {
  element: {
    id: "ut-a",
    tagName: "button",
    selector: "#root > section button",
    text: "查看详情",
    bounds: { x: 0, y: 0, width: 88, height: 38 },
  },
  breadcrumb: [],
  styles: {},
  pickedAt: 1,
};

const source: SourceResolution = {
  elementId: "ut-a",
  confidence: "exact",
  componentName: "Card",
  file: "src/components/Card.tsx",
  line: 10,
};

describe("formatChangesetForCopy", () => {
  it("includes element, text, source, and old→new change", () => {
    const out = formatChangesetForCopy({
      changes: [change({})],
      elementNames: { "ut-a": "button" },
      source,
      selection,
    });
    expect(out).toContain('元素：button  "查看详情"');
    expect(out).toContain("源码：Card · src/components/Card.tsx:10");
    expect(out).toContain("选择器：#root > section button");
    expect(out).toContain("- height: 38px → 52px");
    expect(out).toContain("最小改动");
  });

  it("marks inferred source as 推测", () => {
    const out = formatChangesetForCopy({
      changes: [change({})],
      elementNames: {},
      source: { ...source, confidence: "inferred", line: undefined },
      selection,
    });
    expect(out).toContain("src/components/Card.tsx（推测，请确认）");
  });

  it("omits source block when unknown / not linked", () => {
    const out = formatChangesetForCopy({
      changes: [change({})],
      elementNames: { "ut-a": "button" },
      source: { elementId: "ut-a", confidence: "unknown" },
      selection,
    });
    expect(out).not.toContain("源码：Card");
    expect(out).not.toContain("src/components/Card.tsx");
  });

  it("groups multiple elements in first-seen order", () => {
    const out = formatChangesetForCopy({
      changes: [
        change({ id: "1", elementId: "ut-a", property: "height" }),
        change({ id: "2", elementId: "ut-b", property: "color", previousValue: "#000", nextValue: "#fff" }),
        change({ id: "3", elementId: "ut-a", property: "padding", previousValue: "8px", nextValue: "12px" }),
      ],
      elementNames: { "ut-a": "button", "ut-b": "p" },
    });
    const aIdx = out.indexOf("元素：button");
    const bIdx = out.indexOf("元素：p");
    expect(aIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeGreaterThan(aIdx);
    // ut-a group carries both of its changes together.
    expect(out).toContain("- height: 38px → 52px");
    expect(out).toContain("- padding: 8px → 12px");
    expect(out).toContain("- color: #000 → #fff");
  });

  it("renders empty previousValue as (empty)", () => {
    const out = formatChangesetForCopy({
      changes: [change({ previousValue: "" })],
      elementNames: {},
    });
    expect(out).toContain("- height: (empty) → 52px");
  });

  it("includes the per-element instruction line before its changes when provided", () => {
    const out = formatChangesetForCopy({
      changes: [change({})],
      elementNames: { "ut-a": "button" },
      instructions: { "ut-a": "再高一点，别太挤" },
    });
    expect(out).toContain("指令：再高一点，别太挤");
    // Instruction sits inside the element block, above the changes list.
    expect(out.indexOf("指令：再高一点，别太挤")).toBeGreaterThan(out.indexOf("元素：button"));
    expect(out.indexOf("指令：再高一点，别太挤")).toBeLessThan(out.indexOf("改动（旧值 → 新值）："));
  });

  it("omits the instruction line for elements without one", () => {
    const out = formatChangesetForCopy({
      changes: [
        change({ id: "1", elementId: "ut-a" }),
        change({ id: "2", elementId: "ut-b", property: "color", previousValue: "#000", nextValue: "#fff" }),
      ],
      elementNames: { "ut-a": "button", "ut-b": "p" },
      instructions: { "ut-b": "提亮一点" },
    });
    expect(out).toContain("指令：提亮一点");
    // Only one instruction line overall — ut-a has none.
    expect(out.match(/指令：/g)).toHaveLength(1);
  });

  it("falls back to elementId when no name/selection known", () => {
    const out = formatChangesetForCopy({ changes: [change({})], elementNames: {} });
    expect(out).toContain("元素：ut-a");
  });

  it("includes an instruction-only element (no property changes) with its 指令 line", () => {
    const out = formatChangesetForCopy({
      changes: [],
      elementNames: { "ut-solo": "button" },
      instructions: { "ut-solo": "圆角更大" },
    });
    expect(out).toContain("元素：button");
    expect(out).toContain("指令：圆角更大");
    // No changes anywhere — the 改动 header must not render.
    expect(out).not.toContain("改动（旧值 → 新值）：");
  });

  it("lists an instruction-only element alongside changed elements", () => {
    const out = formatChangesetForCopy({
      changes: [change({})],
      elementNames: { "ut-a": "button", "ut-solo": "p" },
      instructions: { "ut-solo": "行距松一点" },
    });
    // The changed group renders normally…
    expect(out).toContain("元素：button");
    expect(out).toContain("- height: 38px → 52px");
    // …and the instruction-only group appears too, without its own 改动 header.
    expect(out).toContain("元素：p");
    expect(out).toContain("指令：行距松一点");
    expect(out.match(/改动（旧值 → 新值）：/g)).toHaveLength(1);
  });
});
