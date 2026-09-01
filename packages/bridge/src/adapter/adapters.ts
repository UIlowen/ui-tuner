import { applyNotImplemented, type AgentAdapter, type AgentApplyResult } from "./types.js";
import { defaultVersionRunner, type VersionRunner } from "./detect.js";

/**
 * Generic CLI-detected adapter (plan §44). Detection is real (`<binary>
 * --version`); apply is honestly unimplemented until M8.
 */
class CliAgentAdapter implements AgentAdapter {
  constructor(
    readonly id: string,
    readonly name: string,
    private readonly binary: string,
    private readonly runner: VersionRunner,
  ) {}

  isAvailable(): Promise<boolean> {
    return this.runner(this.binary, ["--version"], 3_000);
  }

  applyChanges(): Promise<AgentApplyResult> {
    return Promise.resolve(applyNotImplemented(this.name));
  }
}

/**
 * Codex adapter — the priority agent for M7 (plan §44). Its MCP context is
 * served over the bridge's `/mcp` HTTP endpoint; this adapter only reports
 * whether the `codex` CLI exists.
 */
export function createCodexAdapter(runner: VersionRunner = defaultVersionRunner): AgentAdapter {
  return new CliAgentAdapter("codex", "Codex", "codex", runner);
}

/** Claude Code adapter — placeholder with real detection (plan §44). */
export function createClaudeCodeAdapter(runner: VersionRunner = defaultVersionRunner): AgentAdapter {
  return new CliAgentAdapter("claude-code", "Claude Code", "claude", runner);
}

/** Cursor adapter — placeholder with real detection (plan §44). */
export function createCursorAdapter(runner: VersionRunner = defaultVersionRunner): AgentAdapter {
  return new CliAgentAdapter("cursor", "Cursor", "cursor", runner);
}

/** All known adapters, Codex first (plan §44). */
export function createAdapters(runner: VersionRunner = defaultVersionRunner): AgentAdapter[] {
  return [createCodexAdapter(runner), createClaudeCodeAdapter(runner), createCursorAdapter(runner)];
}
