import { createServer, type Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  createBridgeWelcome,
  isBridgeHelloMessage,
  isBridgeSyncMessage,
  isUiTunerMessage,
  type BridgeProject,
  type BridgeSyncMessage,
  type UiTunerMessage,
} from "@ui-tuner/protocol";

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
}

export class BridgeServer {
  static readonly DEFAULT_PORT = 47_321;

  private httpServer: Server | null = null;
  private wss: WebSocketServer | null = null;
  private readonly sockets = new Set<WebSocket>();

  private lastSync: BridgeSyncMessage["payload"] | null = null;

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
        response.writeHead(404).end();
      });

      const wss = new WebSocketServer({ server: httpServer });
      wss.on("connection", (socket) => {
        this.sockets.add(socket);
        socket.on("close", () => this.sockets.delete(socket));
        socket.on("message", (raw) => this.handleRaw(socket, raw.toString()));
      });

      httpServer.once("error", rejectPromise);
      httpServer.listen(this.options.port, "127.0.0.1", () => {
        httpServer.off("error", rejectPromise);
        this.httpServer = httpServer;
        this.wss = wss;
        resolvePromise(this.address ?? "");
      });
    });
  }

  async stop(): Promise<void> {
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
    } else if (isBridgeSyncMessage(parsed)) {
      this.lastSync = parsed.payload;
    }
    // Everything else (channel / picker messages, future agent traffic) is
    // accepted at the boundary but ignored until its milestone wires it in.
  }
}
