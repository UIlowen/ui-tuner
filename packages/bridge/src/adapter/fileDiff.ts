import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Detect which source files an agent actually modified (plan §46 `files`),
 * without assuming the project is a git repo: snapshot mtime+size of source
 * files before the edit, compare after. Honest — we report what changed on
 * disk, never a guess.
 */

const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".scss", ".html", ".vue", ".svelte"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".next", "build", "out", "coverage"]);
const MAX_FILES = 2_000;

/** file path (relative to root) → mtime+size signature. */
export type FileSnapshot = Map<string, string>;

function extOf(file: string): string {
  const dot = file.lastIndexOf(".");
  return dot === -1 ? "" : file.slice(dot);
}

/** Recursively snapshot source files under `root/src` (or `root` when no src). */
export function snapshotSourceFiles(root: string): FileSnapshot {
  const base = readdirSync(root, { withFileTypes: true }).some((e) => e.isDirectory() && e.name === "src")
    ? join(root, "src")
    : root;
  const snapshot: FileSnapshot = new Map();
  let count = 0;

  const walk = (dir: string): void => {
    if (count >= MAX_FILES) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (count >= MAX_FILES) return;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
      } else if (SOURCE_EXT.has(extOf(entry.name))) {
        try {
          const stat = statSync(full);
          snapshot.set(relative(root, full), `${stat.mtimeMs}:${stat.size}`);
          count += 1;
        } catch {
          // unreadable — skip
        }
      }
    }
  };
  walk(base);
  return snapshot;
}

/** Files whose signature changed or that are new since `before`. */
export function detectChangedFiles(root: string, before: FileSnapshot): string[] {
  const after = snapshotSourceFiles(root);
  const changed: string[] = [];
  for (const [file, signature] of after) {
    if (before.get(file) !== signature) changed.push(file);
  }
  return changed.sort();
}
