import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  assembleAgentContext,
  type AgentRequestMessage,
  type BridgeProject,
  type BridgeSyncMessage,
  type ContextLevel,
  type SourceResolution,
} from "@ui-tuner/protocol";

/**
 * MCP server (plan §27) — the read-only window a coding agent (Codex) gets
 * into the current browser state. It is embedded in the bridge process so it
 * shares the `bridge.sync` mirror and the pending capture channel with the
 * WebSocket side, and is served on the same HTTP server at `/mcp`.
 *
 * Five tools, all honest about empty state (plan §20 discipline):
 *  - ui_get_selection  — current element + source resolution
 *  - ui_get_changes    — the preview change records
 *  - ui_get_context    — assembled prompt context (plan §26), level 1/2/3
 *  - ui_capture        — round-trips the Side Panel for a fresh snapshot
 *  - ui_notify_applied — agent reports it changed source files (M8 preview)
 */

/** Fresh context returned by the Side Panel after an `agent.capture` request. */
export interface CaptureResult {
  selection: BridgeSyncMessage["payload"]["selection"];
  changes: BridgeSyncMessage["payload"]["changes"];
  /** dataURL PNG of the visible tab, when requested and available. */
  screenshot?: string;
}

export interface McpDeps {
  getSync(): BridgeSyncMessage["payload"] | null;
  getSource(): SourceResolution | null;
  getAgentRequest(): AgentRequestMessage["payload"] | null;
  getProject(): BridgeProject;
  getDevServerUrl(): string | null;
  /** Trigger an `agent.capture` round-trip to the Side Panel. */
  capture(withScreenshot: boolean): Promise<CaptureResult>;
  /** Broadcast `agent.applied` to the Side Panel + record it. */
  notifyApplied(files: string[], summary: string): void;
}

const SERVER_NAME = "ui-tuner";
const SERVER_VERSION = "0.1.0";

function text(value: unknown): { content: { type: "text"; text: string }[] } {
  const body = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text: body }] };
}

/** Split a `data:<mime>;base64,<data>` URL into its parts; null when malformed. */
function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  return match ? { mimeType: match[1] ?? "image/png", data: match[2] ?? "" } : null;
}

/** Build a fresh MCP server instance (stateless: one per HTTP request). */
export function createMcpServer(deps: McpDeps): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "ui_get_selection",
    {
      title: "Get current selection",
      description:
        "Current UI Tuner element selection plus its source-code resolution (component, file, line when exact).",
    },
    () => {
      const sync = deps.getSync();
      const source = deps.getSource();
      if (!sync?.selection) {
        return text("No element is selected. Ask the user to pick an element in the browser.");
      }
      return text({
        project: deps.getProject(),
        devServerUrl: deps.getDevServerUrl(),
        selection: sync.selection,
        source: source ?? { elementId: sync.selection.element.id, confidence: "unknown" },
      });
    },
  );

  server.registerTool(
    "ui_get_changes",
    {
      title: "Get preview changes",
      description: "The style overrides the user previewed in the browser (old → new values).",
    },
    () => {
      const sync = deps.getSync();
      return text({ changes: sync?.changes ?? [] });
    },
  );

  server.registerTool(
    "ui_get_context",
    {
      title: "Get assembled context",
      description:
        "Assembled prompt context (plan §26) for the selected element: component, source, styles, preview changes, and the user's instruction. Level 1 = essentials, 2 = + parent/DOM structure, 3 = + screenshot.",
      inputSchema: {
        level: z
          .union([z.literal(1), z.literal(2), z.literal(3)])
          .optional()
          .describe("Context depth (plan §25); default 1"),
      },
    },
    (args) => {
      const level: ContextLevel = args?.level ?? 1;
      const sync = deps.getSync();
      const request = deps.getAgentRequest();
      const context = assembleAgentContext({
        selection: sync?.selection ?? null,
        source: deps.getSource(),
        changes: sync?.changes ?? [],
        instruction: request?.instruction ?? "",
        include: request?.include,
        level,
      });
      return text(context);
    },
  );

  server.registerTool(
    "ui_capture",
    {
      title: "Capture fresh context",
      description:
        "Re-grab the live page state from the browser (fresh selection, changes, and a screenshot of the visible tab). Requires the UI Tuner Side Panel to be open.",
      inputSchema: {
        withScreenshot: z
          .boolean()
          .optional()
          .describe("Include a screenshot of the visible tab (default true)"),
      },
    },
    async (args) => {
      const withScreenshot = args?.withScreenshot ?? true;
      let result: CaptureResult;
      try {
        result = await deps.capture(withScreenshot);
      } catch (error) {
        return text(`Capture failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      const content: (
        | { type: "text"; text: string }
        | { type: "image"; data: string; mimeType: string }
      )[] = [{ type: "text", text: JSON.stringify({ selection: result.selection, changes: result.changes }, null, 2) }];
      const image = result.screenshot ? parseDataUrl(result.screenshot) : null;
      if (image) content.push({ type: "image", data: image.data, mimeType: image.mimeType });
      return { content };
    },
  );

  server.registerTool(
    "ui_notify_applied",
    {
      title: "Notify applied",
      description:
        "Report that the agent changed source files. UI Tuner relays this to the Side Panel so the user knows the preview can be refreshed/verified.",
      inputSchema: {
        files: z.array(z.string()).describe("Source files the agent modified"),
        summary: z.string().describe("One-line human summary of the change"),
      },
    },
    (args) => {
      const files = args?.files ?? [];
      const summary = args?.summary ?? "";
      deps.notifyApplied(files, summary);
      return text(`Recorded: ${files.length} file(s) — ${summary}`);
    },
  );

  return server;
}
