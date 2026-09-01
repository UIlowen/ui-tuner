import { describe, expect, it } from "vitest";
import {
  createAdapters,
  createClaudeCodeAdapter,
  createCodexAdapter,
  createCursorAdapter,
} from "./adapters";
import { applyNotImplemented } from "./types";
import type { VersionRunner } from "./detect";

/** Runner that reports only the given binaries as installed. */
function runnerWith(installed: string[]): VersionRunner {
  return (binary) => Promise.resolve(installed.includes(binary));
}

describe("agent adapters (plan §44)", () => {
  it("detects an installed CLI as available", async () => {
    const codex = createCodexAdapter(runnerWith(["codex"]));
    await expect(codex.isAvailable()).resolves.toBe(true);
  });

  it("detects a missing CLI as unavailable", async () => {
    const cursor = createCursorAdapter(runnerWith([]));
    await expect(cursor.isAvailable()).resolves.toBe(false);
  });

  it("runs detection against the right binary per agent", async () => {
    const seen: string[] = [];
    const spy: VersionRunner = (binary) => {
      seen.push(binary);
      return Promise.resolve(true);
    };
    await createCodexAdapter(spy).isAvailable();
    await createClaudeCodeAdapter(spy).isAvailable();
    await createCursorAdapter(spy).isAvailable();
    expect(seen).toEqual(["codex", "claude", "cursor"]);
  });

  it("lists Codex first among all adapters", () => {
    const adapters = createAdapters(runnerWith([]));
    expect(adapters.map((a) => a.id)).toEqual(["codex", "claude-code", "cursor"]);
  });

  it("never fakes Apply to Code success before M8 (plan §44)", async () => {
    for (const adapter of createAdapters(runnerWith(["codex", "claude", "cursor"]))) {
      const result = await adapter.applyChanges();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("NOT_IMPLEMENTED");
        expect(result.error.message).toMatch(/Milestone 8/);
      }
    }
  });

  it("applyNotImplemented names the agent", () => {
    const result = applyNotImplemented("Codex");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("Codex");
  });
});
