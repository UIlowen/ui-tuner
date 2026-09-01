import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import {
  createAgentApplied,
  createAgentCapture,
  createApplyResult,
  createBridgeAgents,
  createBridgeSourceResolved,
  createBridgeWelcome,
  isAgentCaptureResultMessage,
  isAgentRequestMessage,
  isBridgeHelloMessage,
  isBridgeSyncMessage,
  isChangesApplyMessage,
  isUiTunerMessage,
  type AgentInfo,
  type AgentRequestMessage,
  type ApplyChangeRequest,
  type BridgeProject,
  type BridgeSyncMessage,
  type ChangesApplyMessage,
  type SelectionPayload,
  type SourceResolution,
  type UiTunerMessage,
} from "@ui-tuner/protocol";
import { resolveSource } from "../resolver/resolve.js";
import { handleMcpRequest } from "../mcp/http.js";
import type { CaptureResult, McpDeps } from "../mcp/server.js";
import type { AgentAdapter } from "../adapter/types.js";

/**
 * Local bridge server (plan §15/§16): one HTTP server on 127.0.0.1 with a
 * `/health` JSON endpoint, upgraded with a WebSocket endpoint the Chrome
 * extension connects to. Holds the last synced selection + change set so the
 * M7 MCP tools (`ui_get_selection` / `ui_get_changes`) can serve them.
 *
 * Bind address is always 127.0.0.1 (plan §38: never 0.0.0.0).
 */
export interface BridgeServerOptions {
  /** Fixed port in production (47321, plan §15); 0 = random free port (tests). */
  port: number;
  project: BridgeProject;
  devServerUrl?: string | null;
  bridgeVersion?: string;
  /**
   * Source resolver (plan §19). Defaults to a static scan of `project.root`;
   * injectable for tests and future adapters.
   */
  resolveSource?: (selection: SelectionPayload) => SourceResolution;
  /** Agent availability detected at startup (plan §44); default none. */
  agents?: AgentInfo[];
  /** Agent adapters for Apply to Code (plan §44). Codex first. */
  adapters?: AgentAdapter[];
}

/** Pending ui_capture round-trip waiting on the Side Panel's reply. */
interface PendingCapture {
  captureId: string;
  resolve: (result: CaptureResult) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

const CAPTURE_TIMEOUT_MS = 10_000;

export class BridgeServer {
  static readonly DEFAULT_PORT = 47_321;

  private httpServer: Server | null = null;
  private wss: WebSocketServer | null = null;
  private readonly sockets = new Set<WebSocket>();

  private lastSync: BridgeSyncMessage["payload"] | null = null;
  private lastResolution: SourceResolution | null = null;
  private lastAgentRequest: AgentRequestMessage["payload"] | null = null;
  private lastApplied: { files: string[]; summary: string; at: number } | null = null;
  private pendingCapture: PendingCapture | null = null;

  constructor(private readonly options: BridgeServerOptions) {}

  get address(): string | null {
    const address = this.httpServer?.address();
    if (address === null || typeof address !== "object") return null;
    return `ws://127.0.0.1:${address.port}`;
  }

  get synced(): BridgeSyncMessage["payload"] | null {
    return this.lastSync;
  }

  get connectionCount(): number {
    return this.sockets.size;
  }

  /** M7: latest instruction from the Agent tab (plan §24). */
  get agentRequest(): AgentRequestMessage["payload"] | null {
    return this.lastAgentRequest;
  }

  /** M7: latest ui_notify_applied report (plan §27). */
  get applied(): { files: string[]; summary: string; at: number } | null {
    return this.lastApplied;
  }

  start(): Promise<string> {
    return new Promise((resolvePromise, rejectPromise) => {
      const httpServer = createServer((request, response) => {
        if (request.url === "/health") {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              ok: true,
              project: this.options.project,
              devServerUrl: this.options.devServerUrl ?? null,
              connections: this.sockets.size,
            }),
          );
          return;
        }
        if (request.url === "/mcp") {
          // MCP endpoint (plan §27) — same process, same state as the WS side.
          void handleMcpRequest(this.mcpDeps(), request, response).catch(() => {
            if (!response.headersSent) response.writeHead(500);
            response.end();
          });
          return;
        }
        response.writeHead(404).end();
      });

      const wss = new WebSocketServer({ server: httpServer });
      wss.on("connection", (socket) => {
        this.sockets.add(socket);
        socket.on("close", () => this.sockets.delete(socket));
        socket.on("message", (raw) => this.handleRaw(socket, raw.toString()));
      });

      // ws re-emits the http server's 'error' on the WebSocketServer itself;
      // without a listener there, EADDRINUSE at listen time is an unhandled
      // 'error' event that kills the process before the rejection lands.
      httpServer.once("error", rejectPromise);
      wss.once("error", rejectPromise);
      httpServer.listen(this.options.port, "127.0.0.1", () => {
        httpServer.off("error", rejectPromise);
        wss.off("error", rejectPromise);
        this.httpServer = httpServer;
        this.wss = wss;
        resolvePromise(this.address ?? "");
      });
    });
  }

  async stop(): Promise<void> {
    if (this.pendingCapture) {
      clearTimeout(this.pendingCapture.timer);
      this.pendingCapture.reject(new Error("Bridge stopped."));
      this.pendingCapture = null;
    }
    for (const socket of this.sockets) socket.terminate();
    this.sockets.clear();
    await new Promise<void>((resolvePromise) => {
      if (!this.httpServer) return resolvePromise();
      this.wss?.close();
      this.httpServer.close(() => resolvePromise());
      this.httpServer = null;
      this.wss = null;
    });
  }

  /** Send a message to every connected client (M7 agent channel). */
  broadcast(message: UiTunerMessage): void {
    const raw = JSON.stringify(message);
    for (const socket of this.sockets) {
      if (socket.readyState === socket.OPEN) socket.send(raw);
    }
  }

  private handleRaw(socket: WebSocket, raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // Not JSON — silently drop (same policy as the port boundary).
    }
    if (!isUiTunerMessage(parsed)) return;

    if (isBridgeHelloMessage(parsed)) {
      socket.send(
        JSON.stringify(
          createBridgeWelcome({
            bridgeVersion: this.options.bridgeVersion ?? "0.1.0",
            project: this.options.project,
            devServerUrl: this.options.devServerUrl ?? null,
          }),
        ),
      );
      // M7 (plan §44): tell the Agent tab which coding agents are available.
      socket.send(JSON.stringify(createBridgeAgents(this.options.agents ?? [])));
    } else if (isBridgeSyncMessage(parsed)) {
      this.lastSync = parsed.payload;
      const selection = parsed.payload.selection;
      if (selection) {
        this.resolveAndSend(socket, selection);
      } else {
        // Selection cleared — the stored resolution is stale (plan §20).
        this.lastResolution = null;
      }
    } else if (isAgentRequestMessage(parsed)) {
      // M7 (plan §24): the Agent tab's instruction + include flags, served
      // back to agents through ui_get_context.
      this.lastAgentRequest = parsed.payload;
    } else if (isAgentCaptureResultMessage(parsed)) {
      this.settleCapture(parsed.payload);
    } else if (isChangesApplyMessage(parsed)) {
      // M8 (plan §29): Apply to Code. Async — reply with apply.result.
      void this.handleApply(socket, parsed);
    }
    // Everything else (channel / picker messages) is accepted at the boundary
    // but ignored until its milestone wires it in.
  }

  /**
   * M8 (plan §29/§44): hand the ChangeSet to the first available adapter
   * (Codex) to edit the project source, then report the honest outcome.
   */
  private async handleApply(socket: WebSocket, message: ChangesApplyMessage): Promise<void> {
    const { requestId, context, changes, instruction, scope } = message.payload;
    const adapter = (this.options.adapters ?? [])[0];

    let result;
    if (!adapter) {
      result = {
        success: false,
        error: { code: "AGENT_OFFLINE", message: "No agent adapter is configured." },
      };
    } else if (!(await adapter.isAvailable())) {
      result = {
        success: false,
        error: {
          code: "AGENT_OFFLINE",
          message: `${adapter.name} is not available. Preview changes are safe.`,
        },
      };
    } else {
      const request: ApplyChangeRequest = {
        project: {
          root: this.options.project.root,
          framework: this.options.project.framework,
        },
        context,
        changes,
        ...(instruction !== undefined ? { instruction } : {}),
        scope,
      };
      try {
        result = await adapter.applyChanges(request);
      } catch (error) {
        result = {
          success: false,
          error: { code: "APPLY_FAILED", message: String(error) },
        };
      }
    }

    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(createApplyResult({ requestId, result })));
    }
  }

  /**
   * M7 ui_capture (plan §27): ask the Side Panel to re-grab fresh page state.
   * Honest failure when no Side Panel is connected.
   */
  capture(withScreenshot: boolean): Promise<CaptureResult> {
    const hasOpenSocket = [...this.sockets].some((socket) => socket.readyState === socket.OPEN);
    if (!hasOpenSocket) {
      return Promise.reject(
        new Error("UI Tuner Side Panel is not connected — open it in Chrome to capture."),
      );
    }
    if (this.pendingCapture) {
      return Promise.reject(new Error("A capture is already in flight."));
    }
    return new Promise<CaptureResult>((resolvePromise, rejectPromise) => {
      const captureId = randomUUID();
      const timer = setTimeout(() => {
        this.pendingCapture = null;
        rejectPromise(new Error("Capture timed out waiting for the Side Panel."));
      }, CAPTURE_TIMEOUT_MS);
      this.pendingCapture = { captureId, resolve: resolvePromise, reject: rejectPromise, timer };
      this.broadcast(createAgentCapture({ captureId, withScreenshot }));
    });
  }

  /** M7 ui_notify_applied (plan §27): record + relay to the Side Panel. */
  notifyApplied(files: string[], summary: string): void {
    this.lastApplied = { files, summary, at: Date.now() };
    this.broadcast(createAgentApplied({ files, summary, at: this.lastApplied.at }));
  }

  private settleCapture(payload: {
    captureId: string;
    selection: SelectionPayload | null;
    changes: BridgeSyncMessage["payload"]["changes"];
    screenshot?: string;
  }): void {
    const pending = this.pendingCapture;
    if (!pending || pending.captureId !== payload.captureId) return;
    clearTimeout(pending.timer);
    this.pendingCapture = null;
    pending.resolve({
      selection: payload.selection,
      changes: payload.changes,
      ...(payload.screenshot !== undefined ? { screenshot: payload.screenshot } : {}),
    });
  }

  /** Live deps for the per-request MCP server (stateless reads of bridge state). */
  private mcpDeps(): McpDeps {
    return {
      getSync: () => this.lastSync,
      getSource: () => this.lastResolution,
      getAgentRequest: () => this.lastAgentRequest,
      getProject: () => this.options.project,
      getDevServerUrl: () => this.options.devServerUrl ?? null,
      capture: (withScreenshot) => this.capture(withScreenshot),
      notifyApplied: (files, summary) => this.notifyApplied(files, summary),
    };
  }

  /**
   * M6 (plan §19/§20): locate the selected element in the project sources
   * and report the confidence-graded result. Resolution failures must never
   * break the sync channel — degrade to `unknown` (Preview only).
   */
  private resolveAndSend(socket: WebSocket, selection: SelectionPayload): void {
    let resolution: SourceResolution;
    try {
      const resolve =
        this.options.resolveSource ??
        ((current: SelectionPayload) => resolveSource(this.options.project.root, current));
      resolution = resolve(selection);
    } catch {
      resolution = { elementId: selection.element.id, confidence: "unknown" };
    }
    this.lastResolution = resolution;
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(createBridgeSourceResolved(resolution)));
    }
  }
}
