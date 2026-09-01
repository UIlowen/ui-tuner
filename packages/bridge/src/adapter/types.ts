/**
 * Agent adapter contract (plan §44). The bridge exposes context to coding
 * agents over MCP; an adapter represents one agent product (Codex, Claude
 * Code, Cursor, …) and knows how to detect it and — from M8 on — hand it an
 * apply request.
 *
 * Honesty rule (plan §44): an adapter may be a placeholder, but it must never
 * fake success. Until Apply to Code ships (M8), `applyChanges` reports
 * `NOT_IMPLEMENTED` truthfully.
 */

/** Result of an apply request. M7 only ever produces the failure branch. */
export type AgentApplyResult =
  | { ok: true }
  | {
      ok: false;
      error: {
        /** `NOT_IMPLEMENTED` until Apply to Code (M8) lands. */
        code: "NOT_IMPLEMENTED";
        message: string;
      };
    };

export interface AgentAdapter {
  /** Stable id used in `bridge.agents` and the Agent tab selector. */
  readonly id: string;
  /** Display name (plan §23 Agent row). */
  readonly name: string;
  /** True when the agent's CLI is actually usable on this machine. */
  isAvailable(): Promise<boolean>;
  /**
   * Apply to Code (plan §45/§46) — M8 scope. M7 adapters must return the
   * honest `NOT_IMPLEMENTED` failure, never a fabricated success.
   */
  applyChanges(): Promise<AgentApplyResult>;
}

/** The honest M7 result every adapter returns from `applyChanges`. */
export function applyNotImplemented(agentName: string): AgentApplyResult {
  return {
    ok: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: `${agentName}: Apply to Code ships in Milestone 8 — UI Tuner currently only exposes context over MCP.`,
    },
  };
}
