import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { BridgeProject } from "@ui-tuner/protocol";

/**
 * Project detection (plan §15 "Project detected"): read package.json from the
 * bridge's working directory and classify the framework by dependencies.
 * Framework → resolver wiring arrives in Milestone 6; detection itself ships
 * here so the bridge banner is meaningful from day one.
 */

interface PackageJsonShape {
  name?: unknown;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
}

/** Checked in order — first match wins. */
const FRAMEWORK_RULES: { dependency: string; framework: string }[] = [
  { dependency: "next", framework: "Next.js" },
  { dependency: "nuxt", framework: "Nuxt" },
  { dependency: "astro", framework: "Astro" },
  { dependency: "@remix-run/react", framework: "Remix" },
  { dependency: "vite", framework: "Vite" },
  { dependency: "react-scripts", framework: "CRA" },
  { dependency: "react", framework: "React" },
  { dependency: "vue", framework: "Vue" },
  { dependency: "svelte", framework: "Svelte" },
];

export async function detectProject(cwd: string): Promise<BridgeProject> {
  const root = resolve(cwd);
  let parsed: PackageJsonShape;
  try {
    parsed = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as PackageJsonShape;
  } catch {
    // No / unreadable package.json — still report the root (plan §53: degrade
    // gracefully instead of crashing the bridge).
    return { name: null, framework: "Unknown", root };
  }

  const deps = {
    ...(parsed.dependencies ?? {}),
    ...(parsed.devDependencies ?? {}),
  };
  const rule = FRAMEWORK_RULES.find((entry) => entry.dependency in deps);

  return {
    name: typeof parsed.name === "string" ? parsed.name : basename(root),
    framework: rule?.framework ?? "Unknown",
    root,
  };
}
