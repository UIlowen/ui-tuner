import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildSourceIndex } from "./indexer";

describe("buildSourceIndex", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function fixture(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "ui-tuner-index-"));
    roots.push(root);
    for (const [name, content] of Object.entries(files)) {
      const path = join(root, name);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, content);
    }
    return root;
  }

  it("indexes src/** and skips node_modules / dist", () => {
    const root = fixture({
      "src/components/Button.tsx":
        "export default function Button() { return <button>保存</button>; }",
      "node_modules/pkg/index.tsx": "export default function Pkg() { return <div>组件库</div>; }",
      "dist/bundle.js": "const x = 1;",
    });
    const index = buildSourceIndex(root);
    expect(index.map((entry) => entry.file)).toEqual(["src/components/Button.tsx"]);
    expect(index[0]!.componentName).toBe("Button");
  });

  it("falls back to scanning the root when there is no src/", () => {
    const root = fixture({
      "widget.jsx": "export default function Widget() { return <div>部件</div>; }",
    });
    expect(buildSourceIndex(root).map((entry) => entry.file)).toEqual(["widget.jsx"]);
  });

  it("extracts component names from default exports, named components and file stems", () => {
    const root = fixture({
      "src/a.tsx": "export default function Alpha() { return <div>甲</div>; }",
      "src/b.tsx": "const Beta = () => <div>乙</div>;\nexport default Beta;",
      "src/c.tsx": "export function Gamma() { return <div>丙</div>; }",
      "src/plain-helper.ts": "export const pi = 3.14;",
    });
    const names = Object.fromEntries(buildSourceIndex(root).map((e) => [e.file, e.componentName]));
    expect(names["src/a.tsx"]).toBe("Alpha");
    expect(names["src/b.tsx"]).toBe("Beta");
    expect(names["src/c.tsx"]).toBe("Gamma");
    expect(names["src/plain-helper.ts"]).toBe("plain-helper");
  });

  it("extracts JSX text literals with their lines, including multi-line literals", () => {
    const root = fixture({
      "src/nav.tsx": [
        "export default function Nav() {",
        "  return (",
        '    <a className="nav-link">',
        "      总览",
        "    </a>",
        "  );",
        "}",
      ].join("\n"),
    });
    const entry = buildSourceIndex(root)[0]!;
    expect(entry.texts).toEqual([{ value: "总览", line: 4 }]);
  });

  it("extracts class tokens from strings and template literals", () => {
    const root = fixture({
      "src/b.tsx": [
        "export default function B({ ghost }: { ghost: boolean }) {",
        "  return <button className={`btn ${ghost ? 'btn-ghost' : 'btn-primary'}`}>保存</button>;",
        "}",
      ].join("\n"),
    });
    const tokens = buildSourceIndex(root)[0]!.classNames.map((hit) => hit.value);
    expect(tokens).toEqual(["btn", "btn-ghost", "btn-primary"]);
  });

  it("extracts lowercase tags and id literals, ignoring component tags", () => {
    const root = fixture({
      "src/card.tsx": [
        "export default function Card() {",
        '  return <section id="overview"><Button /><h2>标题</h2></section>;',
        "}",
      ].join("\n"),
    });
    const entry = buildSourceIndex(root)[0]!;
    expect(entry.tags.map((hit) => hit.value)).toEqual(["section", "h2"]);
    expect(entry.ids).toEqual([{ value: "overview", line: 2 }]);
  });

  it("indexes plain .html files (static projects keep source in index.html)", () => {
    const root = fixture({
      "index.html": [
        "<!doctype html>",
        '<html><body><span class="fb-range" id="gRangeText"></span></body></html>',
      ].join("\n"),
    });
    const entry = buildSourceIndex(root)[0]!;
    expect(entry.file).toBe("index.html");
    expect(entry.ids).toEqual([{ value: "gRangeText", line: 2 }]);
    expect(entry.classNames.map((hit) => hit.value)).toEqual(["fb-range"]);
    expect(entry.tags.map((hit) => hit.value)).toContain("span");
  });

  it("extracts class= (HTML) as well as className= (JSX)", () => {
    const root = fixture({
      // No src/ here, so the root is scanned — the static-HTML case.
      "a.html": '<div class="html-cls">y</div>',
      "b.html": '<span class="other-cls">z</span>',
    });
    const byFile = Object.fromEntries(
      buildSourceIndex(root).map((e) => [e.file, e.classNames.map((h) => h.value)]),
    );
    expect(byFile["a.html"]).toEqual(["html-cls"]);
    expect(byFile["b.html"]).toEqual(["other-cls"]);
  });

  it("does not treat the JS `class` keyword or class fields as className", () => {
    const root = fixture({
      "src/plain.ts": "class Foo {}\nexport const bar = 1;",
    });
    expect(buildSourceIndex(root)[0]!.classNames).toEqual([]);
  });
});
