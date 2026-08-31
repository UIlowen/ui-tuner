// Runs all three Vite builds in watch mode so dist/ stays loadable in Chrome
// while developing. Ctrl-C stops everything.
import { spawn } from "node:child_process";

const configs = ["vite.config.sidepanel.ts", "vite.config.content.ts", "vite.config.background.ts"];

const children = configs.map((config) =>
  spawn("pnpm", ["exec", "vite", "build", "--watch", "--config", config], {
    stdio: "inherit",
  }),
);

const shutdown = () => {
  for (const child of children) child.kill("SIGTERM");
};

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
