#!/usr/bin/env node
import { resolveCwd } from "./args.js";
import { detectProject } from "./detect/project.js";
import { probeDevServer } from "./detect/devserver.js";
import { createAdapters } from "./adapter/adapters.js";
import { BridgeServer } from "./server/BridgeServer.js";
import type { AgentInfo } from "@ui-tuner/protocol";

/**
 * Bridge CLI (plan §15). Published target: `npx ui-tuner` inside the user's
 * project. Local equivalent until then: `pnpm bridge --cwd <project>` from
 * the UI Tuner repo, or `node …/packages/bridge/dist/cli.js` from the
 * project directory. Detects the project, listens on 127.0.0.1:47321 and
 * stays in the foreground.
 */
async function main(): Promise<void> {
  const cwd = resolveCwd(process.argv.slice(2), process.cwd());
  if (cwd === null) {
    process.stderr.write("✗ --cwd expects an existing directory\n");
    process.exitCode = 1;
    return;
  }
  const project = await detectProject(cwd);

  process.stdout.write("UI Tuner\n\n");
  process.stdout.write("✓ Project detected\n");
  process.stdout.write(`  ${project.framework}\n\n`);
  process.stdout.write("✓ Root\n");
  process.stdout.write(`  ${project.root}\n\n`);

  const devServerUrl = await probeDevServer();
  process.stdout.write("✓ Dev server\n");
  process.stdout.write(`  ${devServerUrl ?? "not detected"}\n\n`);

  // M7 (plan §44): detect which coding agents are actually installed.
  const adapters = createAdapters();
  const agents: AgentInfo[] = await Promise.all(
    adapters.map(async (adapter) => ({
      id: adapter.id,
      name: adapter.name,
      available: await adapter.isAvailable(),
    })),
  );
  const available = agents.filter((agent) => agent.available);
  process.stdout.write("✓ Agents\n");
  process.stdout.write(
    `  ${available.length > 0 ? available.map((agent) => agent.name).join(", ") : "none detected"}\n\n`,
  );

  const server = new BridgeServer({
    port: BridgeServer.DEFAULT_PORT,
    project,
    devServerUrl,
    agents,
  });

  try {
    await server.start();
  } catch (error) {
    process.stderr.write(`✗ Bridge failed to start: ${String(error)}\n`);
    process.stderr.write("  Is another ui-tuner bridge already running on 47321?\n");
    process.exitCode = 1;
    return;
  }

  process.stdout.write("✓ Bridge listening\n");
  process.stdout.write(`  ${server.address}\n\n`);
  process.stdout.write("Chrome extension: open the Side Panel to connect.\n");
  process.stdout.write("MCP endpoint: http://127.0.0.1:47321/mcp (codex mcp add ui-tuner --url …)\n\n");

  const shutdown = () => {
    void server.stop().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main();
