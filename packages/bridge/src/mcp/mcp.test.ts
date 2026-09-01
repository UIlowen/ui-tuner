import WebSocket from "ws";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  createAgentCaptureResult,
  createAgentRequest,
  createBridgeHello,
  createBridgeSync,
  isAgentCaptureMessage,
  isUiTunerMessage,
  type AgentCaptureMessage,
} from "@ui-tuner/protocol";
import { BridgeServer } from "../server/BridgeServer";

const PROJECT = { name: "demo", framework: "Vite", root: "/tmp/demo" };

const SELECTION = {
  element: {
    id: "ut-000001",
    tagName: "button",
    selector: "body > button",
    text: "查看详情",
    bounds: { x: 0, y: 0, width: 100, height: 40 },
  },
  breadcrumb: [{ tagName: "button", id: "ut-000001" }],
  styles: { gap: "24px", padding: "24px" },
  pickedAt: 1,
};

function portOf(address: string): number {
  return Number(new URL(address).port);
}

/** Extract the concatenated text of an MCP tool result. */
function textOf(result: unknown): string {
  const content = (result as { content?: { type: string; text?: string }[] }).content ?? [];
  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
}

describe("MCP server (plan §27)", () => {
  let server: BridgeServer;
  let client: Client;
  let socket: WebSocket;
  let received: unknown[];
  let dir: string;

  async function connectWs(address: string): Promise<void> {
    socket = new WebSocket(address);
    received = [];
    socket.on("message", (raw) => {
      const parsed: unknown = JSON.parse(raw.toString());
      if (isUiTunerMessage(parsed)) received.push(parsed);
    });
    await new Promise((resolve) => socket.on("open", resolve));
    socket.send(
      JSON.stringify(createBridgeHello({ extensionVersion: "0.1.0", pageUrl: null })),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "ui-tuner-mcp-"));
    server = new BridgeServer({
      port: 0,
      project: PROJECT,
      devServerUrl: null,
      resolveSource: () => ({
        elementId: "ut-000001",
        confidence: "exact",
        componentName: "Card",
        file: "src/components/Card.tsx",
        line: 10,
      }),
    });
    const address = await server.start();
    client = new Client({ name: "test-client", version: "0.0.1" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${portOf(address)}/mcp`)),
    );
    (server as unknown as { testAddress: string }).testAddress = address;
  });

  afterEach(async () => {
    await client.close();
    if (socket && socket.readyState === socket.OPEN) socket.terminate();
    await server.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  function wsAddress(): string {
    return (server as unknown as { testAddress: string }).testAddress;
  }

  it("lists the five §27 tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "ui_capture",
      "ui_get_changes",
      "ui_get_context",
      "ui_get_selection",
      "ui_notify_applied",
    ]);
  });

  it("ui_get_selection is honest when nothing is selected", async () => {
    const result = await client.callTool({ name: "ui_get_selection", arguments: {} });
    expect(textOf(result)).toMatch(/No element is selected/);
  });

  it("ui_get_selection + ui_get_changes serve the synced mirror", async () => {
    await connectWs(wsAddress());
    socket.send(
      JSON.stringify(
        createBridgeSync({
          selection: SELECTION,
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
        }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    const selection = textOf(await client.callTool({ name: "ui_get_selection", arguments: {} }));
    expect(selection).toContain("查看详情");
    expect(selection).toContain("Card");
    expect(selection).toContain("src/components/Card.tsx");

    const changes = textOf(await client.callTool({ name: "ui_get_changes", arguments: {} }));
    expect(changes).toContain('"gap"');
    expect(changes).toContain('"16px"');
  });

  it("ui_get_context assembles §26 prompt from selection + agent.request", async () => {
    await connectWs(wsAddress());
    socket.send(JSON.stringify(createBridgeSync({ selection: SELECTION, changes: [] })));
    socket.send(
      JSON.stringify(
        createAgentRequest({
          instruction: "整体紧凑一点",
          include: { dom: true, styles: true, source: true, screenshot: false, parentTree: false },
          contextLevel: 1,
          sentAt: 2,
        }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    const context = textOf(
      await client.callTool({ name: "ui_get_context", arguments: { level: 1 } }),
    );
    expect(context).toContain("Selected Component:\nCard");
    expect(context).toContain("Source:\nsrc/components/Card.tsx:10");
    expect(context).toContain("Instruction:\n整体紧凑一点");
  });

  it("ui_capture round-trips the Side Panel and returns a screenshot image", async () => {
    await connectWs(wsAddress());
    socket.send(JSON.stringify(createBridgeSync({ selection: SELECTION, changes: [] })));
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Respond as the Side Panel would when the capture request arrives.
    socket.on("message", (raw) => {
      const parsed: unknown = JSON.parse(raw.toString());
      if (isUiTunerMessage(parsed) && isAgentCaptureMessage(parsed)) {
        const request = (parsed as AgentCaptureMessage).payload;
        socket.send(
          JSON.stringify(
            createAgentCaptureResult({
              captureId: request.captureId,
              selection: SELECTION,
              changes: [],
              screenshot: "data:image/png;base64,iVBORw0KGgo=",
            }),
          ),
        );
      }
    });

    const result = await client.callTool({
      name: "ui_capture",
      arguments: { withScreenshot: true },
    });
    const content = (result as { content: { type: string }[] }).content;
    expect(content.some((part) => part.type === "image")).toBe(true);
    expect(textOf(result)).toContain("查看详情");

    // The panel was asked to capture.
    expect(
      received.some(
        (message) => isUiTunerMessage(message) && isAgentCaptureMessage(message),
      ),
    ).toBe(true);
  });

  it("ui_capture fails honestly when no Side Panel is connected", async () => {
    const result = await client.callTool({ name: "ui_capture", arguments: {} });
    expect(textOf(result)).toMatch(/Side Panel is not connected/);
  });

  it("ui_notify_applied relays agent.applied to the Side Panel", async () => {
    await connectWs(wsAddress());
    await client.callTool({
      name: "ui_notify_applied",
      arguments: { files: ["src/components/Card.tsx"], summary: "收紧间距" },
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const applied = received.find(
      (message) => isUiTunerMessage(message) && message.type === "agent.applied",
    );
    expect(applied).toBeDefined();
    expect((applied as { payload: { files: string[] } }).payload.files).toEqual([
      "src/components/Card.tsx",
    ]);
    expect(server.applied?.summary).toBe("收紧间距");
  });
});
