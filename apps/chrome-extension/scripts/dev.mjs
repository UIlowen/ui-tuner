// Runs all three Vite builds in watch mode so dist/ stays loadable in Chrome
// while developing. Ctrl-C stops everything. UI_TUNER_WATCH tells the
// sidepanel config to keep emptyOutDir off — the three watchers share dist/,
// and emptying it would delete the other builds' outputs until their own
// (unchanged) inputs next trigger a rebuild.
import { spawn } from "node:child_process";

const configs = ["vite.config.sidepanel.ts", "vite.config.content.ts", "vite.config.background.ts"];

const children = configs.map((config) =>
  spawn("pnpm", ["exec", "vite", "build", "--watch", "--config", config], {
    stdio: "inherit",
    env: { ...process.env, UI_TUNER_WATCH: "1" },
  }),
);

const shutdown = () => {
  for (const child of children) child.kill("SIGTERM");
};

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
