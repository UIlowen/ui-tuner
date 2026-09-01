#!/usr/bin/env node
import { detectProject } from "./detect/project.js";
import { probeDevServer } from "./detect/devserver.js";
import { BridgeServer } from "./server/BridgeServer.js";

/**
 * `npx ui-tuner` (plan §15): detect the project, start the bridge on
 * 127.0.0.1:47321 and print the startup banner. Stays in the foreground.
 */
async function main(): Promise<void> {
  const cwd = process.cwd();
  const project = await detectProject(cwd);

  process.stdout.write("UI Tuner\n\n");
  process.stdout.write("✓ Project detected\n");
  process.stdout.write(`  ${project.framework}\n\n`);
  process.stdout.write("✓ Root\n");
  process.stdout.write(`  ${project.root}\n\n`);

  const devServerUrl = await probeDevServer();
  process.stdout.write("✓ Dev server\n");
  process.stdout.write(`  ${devServerUrl ?? "not detected"}\n\n`);

  const server = new BridgeServer({
    port: BridgeServer.DEFAULT_PORT,
    project,
    devServerUrl,
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
  process.stdout.write("Chrome extension: open the Side Panel to connect.\n\n");

  const shutdown = () => {
    void server.stop().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main();
