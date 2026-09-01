import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SelectionPayload } from "@ui-tuner/protocol";
import { describe, expect, it } from "vitest";
import { buildSourceIndex } from "./indexer";
import { resolveFromIndex } from "./resolve";

/**
 * Anchor the resolver against the real Example A project (plan §39):
 * examples/react-vite. The expectations mirror the table in that project's
 * README — this is the automated form of the M6 acceptance criterion
 * ("Demo 项目可以显示源码位置").
 */
const EXAMPLE_ROOT = fileURLToPath(new URL("../../../../examples/react-vite", import.meta.url));

const index = buildSourceIndex(EXAMPLE_ROOT);

function selectionOf(options: {
  text?: string;
  tagName: string;
  outerHTML: string;
}): SelectionPayload {
  return {
    element: {
      id: "ut-000001",
      tagName: options.tagName,
      selector: "#root " + options.tagName,
      text: options.text,
      bounds: { x: 0, y: 0, width: 10, height: 10 },
    },
    breadcrumb: [{ tagName: options.tagName, id: "ut-000001" }],
    styles: {},
    dom: { outerHTML: options.outerHTML },
    pickedAt: 1,
  };
}

function lineContent(file: string, line: number): string {
  return readFileSync(
    new URL(`../../../../examples/react-vite/${file}`, import.meta.url),
    "utf8",
  ).split("\n")[line - 1]!;
}

describe("resolveFromIndex against examples/react-vite (plan §39 Example A)", () => {
  it("indexes the five components", () => {
    const files = index.map((entry) => entry.file);
    expect(files).toEqual(
      expect.arrayContaining([
        "src/components/Navbar.tsx",
        "src/components/Card.tsx",
        "src/components/Button.tsx",
        "src/components/Form.tsx",
        "src/components/List.tsx",
      ]),
    );
  });

  it("exact: 「总览」nav link → Navbar.tsx, line points at the literal", () => {
    const resolution = resolveFromIndex(
      index,
      selectionOf({ text: "总览", tagName: "a", outerHTML: '<a class="nav-link">总览</a>' }),
    );
    expect(resolution.confidence).toBe("exact");
    expect(resolution.componentName).toBe("Navbar");
    expect(resolution.file).toBe("src/components/Navbar.tsx");
    expect(lineContent(resolution.file!, resolution.line!)).toContain("总览");
  });

  it("exact: 「本月费用概览」title → Card.tsx", () => {
    const resolution = resolveFromIndex(
      index,
      selectionOf({
        text: "本月费用概览",
        tagName: "h2",
        outerHTML: '<h2 class="card-title">本月费用概览</h2>',
      }),
    );
    expect(resolution).toMatchObject({
      confidence: "exact",
      componentName: "Card",
      file: "src/components/Card.tsx",
    });
  });

  it("exact: 「查看详情」button → Card.tsx (the JSX call site, React semantics)", () => {
    const resolution = resolveFromIndex(
      index,
      selectionOf({
        text: "查看详情",
        tagName: "button",
        outerHTML: '<button class="btn btn-primary">查看详情</button>',
      }),
    );
    expect(resolution.confidence).toBe("exact");
    expect(resolution.file).toBe("src/components/Card.tsx");
    expect(lineContent(resolution.file!, resolution.line!)).toContain("查看详情");
  });

  it("exact: 「记录费用」submit button → Form.tsx (its own file beats Button.tsx)", () => {
    const resolution = resolveFromIndex(
      index,
      selectionOf({
        text: "记录费用",
        tagName: "button",
        outerHTML: '<button class="btn btn-primary" type="submit">记录费用</button>',
      }),
    );
    expect(resolution.confidence).toBe("exact");
    expect(resolution.file).toBe("src/components/Form.tsx");
  });

  it("inferred: card wrapper (classes + tag, no text literal) → Possible: Card.tsx", () => {
    const resolution = resolveFromIndex(
      index,
      selectionOf({
        text: "本月费用概览 ¥ 12,480 较上月 +8.2% 查看详情 导出报表",
        tagName: "section",
        outerHTML: '<section class="card stat-card">…</section>',
      }),
    );
    expect(resolution.confidence).toBe("inferred");
    expect(resolution.file).toBe("src/components/Card.tsx");
    expect(resolution).not.toHaveProperty("line");
  });

  it("unknown: app-shell wrapper div → Preview only", () => {
    const resolution = resolveFromIndex(
      index,
      selectionOf({ tagName: "div", outerHTML: '<div class="app-shell">…</div>' }),
    );
    expect(resolution.confidence).toBe("unknown");
  });

  it("unknown: data-driven plate text (array literal, not JSX text) → Preview only", () => {
    const resolution = resolveFromIndex(
      index,
      selectionOf({
        text: "粤A·12345",
        tagName: "span",
        outerHTML: '<span class="vehicle-plate">粤A·12345</span>',
      }),
    );
    expect(resolution.confidence).toBe("unknown");
  });
});
