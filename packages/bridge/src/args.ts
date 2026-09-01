import { statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Resolve the project directory from CLI arguments.
 *
 * `npx ui-tuner` (plan §15) runs inside the user's project, so the process
 * working directory is the project root. Until the package is published,
 * the bridge is started from the UI Tuner repo (`pnpm bridge`) — `--cwd`
 * points detection at the actual project instead.
 *
 * Returns null for a missing value or a path that is not an existing
 * directory; the CLI reports that and exits.
 */
export function resolveCwd(argv: readonly string[], fallback: string): string | null {
  const index = argv.indexOf("--cwd");
  if (index === -1) return fallback;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) return null;
  const path = resolve(value);
  try {
    return statSync(path).isDirectory() ? path : null;
  } catch {
    return null;
  }
}
