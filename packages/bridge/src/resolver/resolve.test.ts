import type { SelectionPayload } from "@ui-tuner/protocol";
import { describe, expect, it } from "vitest";
import type { SourceIndexEntry } from "./indexer";
import { resolveFromIndex, signalsFromSelection } from "./resolve";

/** Minimal selection factory — only the signals the resolver reads. */
function selectionOf(options: {
  text?: string;
  tagName?: string;
  selector?: string;
  outerHTML?: string;
  domFingerprint?: string;
}): SelectionPayload {
  return {
    element: {
      id: "ut-000001",
      tagName: options.tagName ?? "button",
      selector: options.selector ?? "#root button",
      text: options.text,
      domFingerprint: options.domFingerprint,
      bounds: { x: 0, y: 0, width: 10, height: 10 },
    },
    breadcrumb: [{ tagName: options.tagName ?? "button", id: "ut-000001" }],
    styles: {},
    dom: options.outerHTML ? { outerHTML: options.outerHTML } : undefined,
    pickedAt: 1,
  };
}

function entryOf(partial: Partial<SourceIndexEntry> & { file: string }): SourceIndexEntry {
  return {
    componentName: partial.file,
    texts: [],
    classNames: [],
    tags: [],
    ids: [],
    ...partial,
  };
}

describe("signalsFromSelection", () => {
  it("prefers class tokens from the DOM snapshot outerHTML", () => {
    const signals = signalsFromSelection(
      selectionOf({
        text: "保存",
        outerHTML: '<button class="btn btn-primary" data-ui-tuner-id="ut-1">保存</button>',
        selector: "body > div:nth-of-type(1) > #saveBtn",
      }),
    );
    expect(signals.text).toBe("保存");
    expect(signals.classes).toEqual(["btn", "btn-primary"]);
    expect(signals.idAnchor).toBe("saveBtn");
  });

  it("falls back to fingerprint classes when the snapshot is absent", () => {
    const signals = signalsFromSelection(
      selectionOf({ domFingerprint: "button.btn.btn-primary>[span]" }),
    );
    expect(signals.classes).toEqual(["btn", "btn-primary"]);
  });
});

describe("resolveFromIndex", () => {
  const index: SourceIndexEntry[] = [
    entryOf({
      file: "src/components/Card.tsx",
      componentName: "Card",
      texts: [{ value: "本月费用概览", line: 5 }],
      classNames: [
        { value: "card", line: 3 },
        { value: "stat-card", line: 3 },
      ],
      tags: [{ value: "section", line: 3 }],
    }),
    entryOf({
      file: "src/components/Button.tsx",
      componentName: "Button",
      classNames: [
        { value: "btn", line: 9 },
        { value: "btn-primary", line: 9 },
      ],
      tags: [{ value: "button", line: 9 }],
    }),
  ];

  it("exact: unique text with corroboration gives file, line and component", () => {
    const resolution = resolveFromIndex(
      index,
      selectionOf({
        text: "本月费用概览",
        tagName: "h2",
        outerHTML: '<h2 class="card-title">本月费用概览</h2>',
      }),
    );
    expect(resolution).toEqual({
      elementId: "ut-000001",
      confidence: "exact",
      componentName: "Card",
      file: "src/components/Card.tsx",
      line: 5,
    });
  });

  it("inferred: class/tag corroboration without text gives a file and never a line", () => {
    const resolution = resolveFromIndex(
      index,
      selectionOf({
        tagName: "button",
        outerHTML: '<button class="btn btn-primary">导出</button>',
      }),
    );
    expect(resolution.confidence).toBe("inferred");
    expect(resolution.file).toBe("src/components/Button.tsx");
    expect(resolution).not.toHaveProperty("line");
  });

  it("unknown: weak single-signal matches stay Preview only (no fabrication)", () => {
    const resolution = resolveFromIndex(
      index,
      selectionOf({ tagName: "div", text: "毫无关联的内容" }),
    );
    expect(resolution).toEqual({ elementId: "ut-000001", confidence: "unknown" });
  });

  it("unknown: an empty index resolves nothing", () => {
    expect(resolveFromIndex([], selectionOf({ text: "保存" })).confidence).toBe("unknown");
  });

  it("text present in two files is not unique — degrades to inferred", () => {
    const duplicated: SourceIndexEntry[] = [
      entryOf({ file: "src/a.tsx", texts: [{ value: "通用文案", line: 2 }] }),
      entryOf({ file: "src/b.tsx", texts: [{ value: "通用文案", line: 7 }] }),
    ];
    const resolution = resolveFromIndex(duplicated, selectionOf({ text: "通用文案" }));
    expect(resolution.confidence).toBe("inferred");
    expect(resolution).not.toHaveProperty("line");
  });

  it("strong id+class match without text is inferred, never exact", () => {
    const withId: SourceIndexEntry[] = [
      entryOf({
        file: "src/widget.tsx",
        ids: [{ value: "saveBtn", line: 3 }],
        classNames: [{ value: "btn", line: 3 }],
        tags: [{ value: "button", line: 3 }],
      }),
    ];
    const resolution = resolveFromIndex(
      withId,
      selectionOf({
        selector: "#saveBtn",
        outerHTML: '<button id="saveBtn" class="btn">x</button>',
      }),
    );
    expect(resolution.confidence).toBe("inferred");
  });
});
