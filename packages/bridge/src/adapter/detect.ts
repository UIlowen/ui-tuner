import { execFile } from "node:child_process";

/**
 * Binary detection shared by the CLI-based adapters (Codex / Claude Code /
 * Cursor, plan §44). Runs `<binary> --version` and reports whether it exits
 * within the timeout. Injectable runner keeps the adapters testable without
 * depending on what is installed on the dev machine.
 */
export type VersionRunner = (
  binary: string,
  args: string[],
  timeoutMs: number,
) => Promise<boolean>;

export const defaultVersionRunner: VersionRunner = (binary, args, timeoutMs) =>
  new Promise((resolvePromise) => {
    const child = execFile(binary, args, { timeout: timeoutMs }, (error) => {
      resolvePromise(!error);
    });
    child.on("error", () => resolvePromise(false));
  });
