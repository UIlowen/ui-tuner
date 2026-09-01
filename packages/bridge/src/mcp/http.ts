import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer, type McpDeps } from "./server.js";

/**
 * Stateless Streamable-HTTP endpoint for the MCP server (plan §27). Each POST
 * gets a fresh McpServer + transport pair, so no session state leaks between
 * agent calls; the deps closures read the bridge's live state per request.
 */

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        rejectPromise(error instanceof Error ? error : new Error(String(error)));
      }
    });
    request.on("error", rejectPromise);
  });
}

function writeJsonRpcError(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32_000, message }, id: null }));
}

export async function handleMcpRequest(
  deps: McpDeps,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "POST") {
    // Stateless mode: no GET stream / DELETE session (SDK §stateless).
    writeJsonRpcError(response, 405, "Method not allowed — POST JSON-RPC to /mcp");
    return;
  }

  let body: unknown;
  try {
    body = await readBody(request);
  } catch {
    writeJsonRpcError(response, 400, "Invalid JSON body");
    return;
  }

  const server = createMcpServer(deps);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  response.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(request, response, body);
}
