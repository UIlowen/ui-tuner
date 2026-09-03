import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ApplyChangeRequest } from "@ui-tuner/protocol";
import {
  CodexAdapter,
  createAdapters,
  createClaudeCodeAdapter,
  createCursorAdapter,
  type CodexRunner,
} from "./adapters";
import { applyNotImplementedMessage } from "./types";
import type { VersionRunner } from "./detect";
import { buildCodexApplyPrompt } from "./prompt";
import { detectChangedFiles, snapshotSourceFiles } from "./fileDiff";

/** Runner that reports only the given binaries as installed. */
function runnerWith(installed: string[]): VersionRunner {
  return (binary) => Promise.resolve(installed.includes(binary));
}

function makeRequest(root: string, withSource = true): ApplyChangeRequest {
  return {
    project: { root, framework: "Vite", styling: "css" },
    context: {
      page: { url: "http://localhost:5173/" },
      element: {
        id: "ut-000001",
        tagName: "button",
        selector: "body > button",
        text: "查看详情",
        bounds: { x: 0, y: 0, width: 100, height: 40 },
      },
      ...(withSource
        ? { component: { name: "Card", source: { file: "src/components/Card.tsx", line: 10 } } }
        : {}),
      styles: { gap: "24px", padding: "24px" },
    },
    changes: [
      {
        id: "ch-1",
        elementId: "ut-000001",
        property: "gap",
        previousValue: "24px",
        nextValue: "16px",
        source: "manual",
        createdAt: 1,
      },
    ],
    instruction: "整体紧凑一点",
    scope: "instance",
  };
}

describe("adapters detection (plan §44)", () => {
  it("detects installed vs missing CLIs", async () => {
    await expect(new CodexAdapter(runnerWith(["codex"])).isAvailable()).resolves.toBe(true);
    await expect(createCursorAdapter(runnerWith([])).isAvailable()).resolves.toBe(false);
  });

  it("runs detection against the right binary per agent", async () => {
    const seen: string[] = [];
    const spy: VersionRunner = (binary) => {
      seen.push(binary);
      return Promise.resolve(true);
    };
    await new CodexAdapter(spy).isAvailable();
    await createClaudeCodeAdapter(spy).isAvailable();
    await createCursorAdapter(spy).isAvailable();
    expect(seen).toEqual(["codex", "claude", "cursor"]);
  });

  it("lists Codex first among all adapters", () => {
    expect(createAdapters(runnerWith([])).map((a) => a.id)).toEqual([
      "codex",
      "claude-code",
      "cursor",
    ]);
  });

  it("placeholder adapters never fake Apply success (plan §44)", async () => {
    for (const adapter of [createClaudeCodeAdapter(runnerWith([])), createCursorAdapter(runnerWith([]))]) {
      const result = await adapter.applyChanges(makeRequest("/tmp/x"));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("AGENT_OFFLINE");
    }
  });

  it("applyNotImplementedMessage names the agent", () => {
    expect(applyNotImplementedMessage("Codex")).toContain("Codex");
  });
});

describe("buildCodexApplyPrompt (plan §28/§45)", () => {
  it("includes source location, changes, instruction, scope and §28 constraints", () => {
    const prompt = buildCodexApplyPrompt(makeRequest("/tmp/demo"));
    expect(prompt).toContain("src/components/Card.tsx:10");
    expect(prompt).toContain("Card");
    expect(prompt).toContain("gap: 24px → 16px");
    expect(prompt).toContain("整体紧凑一点");
    expect(prompt).toContain("only this element instance");
    expect(prompt).toContain("Tailwind");
    expect(prompt).toContain("CSS Module");
    expect(prompt).toContain("component abstraction");
  });

  it("omits instruction block when empty", () => {
    const request = makeRequest("/tmp/demo");
    request.instruction = "";
    expect(buildCodexApplyPrompt(request)).not.toContain("User instruction:");
  });

  it("renders a composed (per-element + global) instruction verbatim", () => {
    // The side panel composes the card's per-element instruction ahead of the
    // global Agent-tab note into the single `instruction` field.
    const request = makeRequest("/tmp/demo");
    request.instruction = "圆角更大\n全局备注";
    const prompt = buildCodexApplyPrompt(request);
    expect(prompt).toContain("User instruction:\n圆角更大\n全局备注");
  });
});

describe("fileDiff", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ui-tuner-diff-"));
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "a.tsx"), "export const a = 1;");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("detects a modified source file", async () => {
    const before = snapshotSourceFiles(dir);
    await new Promise((r) => setTimeout(r, 10));
    writeFileSync(join(dir, "src", "a.tsx"), "export const a = 2; // changed");
    expect(detectChangedFiles(dir, before)).toEqual(["src/a.tsx"]);
  });

  it("detects a new source file and ignores unchanged ones", async () => {
    const before = snapshotSourceFiles(dir);
    await new Promise((r) => setTimeout(r, 10));
    writeFileSync(join(dir, "src", "b.css"), ".x{color:red}");
    expect(detectChangedFiles(dir, before)).toEqual(["src/b.css"]);
  });

  it("returns empty when nothing changed", () => {
    const before = snapshotSourceFiles(dir);
    expect(detectChangedFiles(dir, before)).toEqual([]);
  });
});

describe("CodexAdapter.applyChanges (plan §45/§46)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ui-tuner-apply-"));
    mkdirSync(join(dir, "src", "components"), { recursive: true });
    writeFileSync(join(dir, "src", "components", "Card.tsx"), "export function Card() {}");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const available = runnerWith(["codex"]);

  it("returns SOURCE_NOT_FOUND when the element has no resolved source (§43 rule 15)", async () => {
    const adapter = new CodexAdapter(available);
    const result = await adapter.applyChanges(makeRequest(dir, false));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("SOURCE_NOT_FOUND");
  });

  it("returns AGENT_OFFLINE when codex is not installed", async () => {
    const adapter = new CodexAdapter(runnerWith([]));
    const result = await adapter.applyChanges(makeRequest(dir));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("AGENT_OFFLINE");
  });

  it("succeeds and reports the file codex actually changed", async () => {
    const runner: CodexRunner = async ({ cwd }) => {
      // Simulate codex editing the file.
      writeFileSync(join(cwd, "src", "components", "Card.tsx"), "export function Card() { /* edited */ }");
      return { exitCode: 0, stdout: "done", stderr: "", timedOut: false };
    };
    const adapter = new CodexAdapter(available, runner);
    const result = await adapter.applyChanges(makeRequest(dir));
    expect(result.success).toBe(true);
    expect(result.files).toEqual(["src/components/Card.tsx"]);
    expect(result.summary).toContain("1 change");
  });

  it("fails honestly when codex exits non-zero", async () => {
    const runner: CodexRunner = async () => ({ exitCode: 1, stdout: "", stderr: "boom", timedOut: false });
    const adapter = new CodexAdapter(available, runner);
    const result = await adapter.applyChanges(makeRequest(dir));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("APPLY_FAILED");
  });

  it("fails honestly when codex succeeds but changed nothing", async () => {
    const runner: CodexRunner = async () => ({ exitCode: 0, stdout: "", stderr: "", timedOut: false });
    const adapter = new CodexAdapter(available, runner);
    const result = await adapter.applyChanges(makeRequest(dir));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("APPLY_FAILED");
    expect(result.error?.message).toMatch(/no source file changed/);
  });

  it("reports timeout as APPLY_FAILED", async () => {
    const runner: CodexRunner = async () => ({ exitCode: -1, stdout: "", stderr: "", timedOut: true });
    const adapter = new CodexAdapter(available, runner);
    const result = await adapter.applyChanges(makeRequest(dir));
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/timed out/);
  });
});
