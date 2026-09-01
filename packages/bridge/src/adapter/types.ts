import type { ApplyChangeRequest, ApplyChangeResult } from "@ui-tuner/protocol";

/**
 * Agent adapter contract (plan §44). The bridge hands an apply request to one
 * agent product (Codex, Claude Code, Cursor, …); the adapter detects it and
 * drives it to edit the project source.
 *
 * Honesty rule (plan §44/§43.15): an adapter must never fake success, and when
 * the source cannot be resolved it must return `SOURCE_NOT_FOUND` rather than
 * guess-and-edit.
 */

export interface AgentAdapter {
  /** Stable id used in `bridge.agents` and the Agent tab selector. */
  readonly id: string;
  /** Display name (plan §23 Agent row). */
  readonly name: string;
  /** True when the agent's CLI is actually usable on this machine. */
  isAvailable(): Promise<boolean>;
  /** Apply to Code (plan §45/§46): modify the project source. */
  applyChanges(request: ApplyChangeRequest): Promise<ApplyChangeResult>;
}

/** Honest "not implemented" message for placeholder adapters (plan §44). */
export function applyNotImplementedMessage(agentName: string): string {
  return `${agentName}: Apply to Code is not implemented for this agent yet — only Codex applies changes in V0.1.`;
}
