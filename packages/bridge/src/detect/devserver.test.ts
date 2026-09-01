import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { probeDevServer } from "./devserver";

describe("probeDevServer", () => {
  const servers: ReturnType<typeof createServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );
  });

  function startTempServer(): Promise<number> {
    const server = createServer((_request, response) => {
      response.writeHead(200).end("dev");
    });
    servers.push(server);
    return new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        resolve((server.address() as { port: number }).port);
      });
    });
  }

  it("returns the first answering candidate", async () => {
    const port = await startTempServer();
    const alive = `http://127.0.0.1:${port}`;
    expect(await probeDevServer(["http://127.0.0.1:1", alive])).toBe(alive);
  });

  it("returns null when nothing answers", async () => {
    expect(await probeDevServer(["http://127.0.0.1:1", "http://127.0.0.1:2"])).toBeNull();
  });
});
