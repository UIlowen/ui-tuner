import WebSocket from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBridgeHello, createBridgeSync } from "@ui-tuner/protocol";
import { BridgeServer } from "./BridgeServer";

const PROJECT = { name: "demo", framework: "Vite", root: "/tmp/demo" };

function portOf(address: string): number {
  return Number(new URL(address).port);
}

describe("BridgeServer", () => {
  let server: BridgeServer;

  beforeEach(() => {
    server = new BridgeServer({ port: 0, project: PROJECT, devServerUrl: null });
  });

  afterEach(async () => {
    await server.stop();
  });

  it("binds to 127.0.0.1 only", async () => {
    const address = await server.start();
    expect(address).toMatch(/^ws:\/\/127\.0\.0\.1:\d+$/);
  });

  it("serves /health with project info", async () => {
    const address = await server.start();
    const response = await fetch(`http://127.0.0.1:${portOf(address)}/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; project: typeof PROJECT };
    expect(body.ok).toBe(true);
    expect(body.project).toEqual(PROJECT);
  });

  it("replies to bridge.hello with bridge.welcome (plan §15 banner data)", async () => {
    const address = await server.start();
    const socket = new WebSocket(address);
    const received: unknown[] = [];
    socket.on("message", (raw) => received.push(JSON.parse(raw.toString())));
    await new Promise((resolve) => socket.on("open", resolve));

    socket.send(
      JSON.stringify(
        createBridgeHello({ extensionVersion: "0.1.0", pageUrl: "http://localhost:5173/" }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    socket.terminate();

    expect(received).toEqual([
      {
        type: "bridge.welcome",
        payload: { bridgeVersion: "0.1.0", project: PROJECT, devServerUrl: null },
      },
    ]);
  });

  it("stores the latest bridge.sync payload for the M7 MCP tools", async () => {
    const address = await server.start();
    const socket = new WebSocket(address);
    await new Promise((resolve) => socket.on("open", resolve));

    const sync = createBridgeSync({
      selection: null,
      changes: [
        {
          id: "ch-000001",
          elementId: "ut-000001",
          property: "gap",
          previousValue: "24px",
          nextValue: "16px",
          source: "manual" as const,
          createdAt: 1,
        },
      ],
    });
    socket.send(JSON.stringify(sync));
    await new Promise((resolve) => setTimeout(resolve, 100));
    socket.terminate();

    expect(server.synced).toEqual(sync.payload);
  });

  it("drops non-JSON and non-protocol messages without dying", async () => {
    const address = await server.start();
    const socket = new WebSocket(address);
    await new Promise((resolve) => socket.on("open", resolve));

    socket.send("not json");
    socket.send(JSON.stringify({ type: "evil.message", payload: {} }));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(server.synced).toBeNull();
    expect(server.connectionCount).toBe(1);
    socket.terminate();
  });

  it("tracks connections and releases the port on stop", async () => {
    const address = await server.start();
    const port = portOf(address);
    const socket = new WebSocket(address);
    await new Promise((resolve) => socket.on("open", resolve));
    expect(server.connectionCount).toBe(1);

    socket.terminate();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(server.connectionCount).toBe(0);

    await server.stop();
    // Port is free again — a second server can take it.
    const second = new BridgeServer({ port, project: PROJECT });
    await expect(second.start()).resolves.toBe(`ws://127.0.0.1:${port}`);
    await second.stop();
  });

  it("rejects cleanly when the port is already taken (no unhandled 'error')", async () => {
    const address = await server.start();
    const second = new BridgeServer({ port: portOf(address), project: PROJECT });
    // ws re-emits the http 'error' on the WebSocketServer — before the fix
    // this crashed the test process with an unhandled 'error' event.
    await expect(second.start()).rejects.toThrow();
    // The original server is unaffected and still healthy.
    const response = await fetch(`http://127.0.0.1:${portOf(address)}/health`);
    expect(response.status).toBe(200);
  });
});
