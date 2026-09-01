import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectProject } from "./project";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ui-tuner-bridge-"));
}

async function writePackageJson(dir: string, contents: unknown): Promise<void> {
  await writeFile(join(dir, "package.json"), JSON.stringify(contents), "utf8");
}

describe("detectProject", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await tempDir();
  });

  afterEach(async () => {
    await mkdir(dir, { recursive: true }).catch(() => {});
  });

  it("detects Next.js from dependencies", async () => {
    await writePackageJson(dir, {
      name: "demo-app",
      dependencies: { next: "15.0.0", react: "19.0.0" },
    });
    const project = await detectProject(dir);
    expect(project.framework).toBe("Next.js");
    expect(project.name).toBe("demo-app");
    expect(project.root).toBe(dir);
  });

  it("detects Vite from devDependencies", async () => {
    await writePackageJson(dir, {
      dependencies: { react: "19.0.0" },
      devDependencies: { vite: "^6.0.0" },
    });
    expect((await detectProject(dir)).framework).toBe("Vite");
  });

  it("prefers Next.js over React when both are present", async () => {
    await writePackageJson(dir, {
      dependencies: { react: "19.0.0", next: "15.0.0" },
    });
    expect((await detectProject(dir)).framework).toBe("Next.js");
  });

  it("falls back to Unknown without crashing when package.json is missing", async () => {
    const project = await detectProject(dir);
    expect(project.framework).toBe("Unknown");
    expect(project.root).toBe(dir);
  });

  it("falls back to Unknown for malformed package.json", async () => {
    await writeFile(join(dir, "package.json"), "{not json", "utf8");
    expect((await detectProject(dir)).framework).toBe("Unknown");
  });

  it("uses the directory basename as name when package.json has none", async () => {
    await writePackageJson(dir, { dependencies: { vite: "6" } });
    const project = await detectProject(dir);
    expect(project.name).toBeTruthy();
  });
});
