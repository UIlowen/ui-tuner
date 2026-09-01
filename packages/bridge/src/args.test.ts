import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveCwd } from "./args";

describe("resolveCwd", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "ui-tuner-args-"));
    dirs.push(dir);
    return dir;
  }

  it("returns the fallback when no --cwd is given", () => {
    expect(resolveCwd([], "/fallback")).toBe("/fallback");
    expect(resolveCwd(["--other", "x"], "/fallback")).toBe("/fallback");
  });

  it("resolves --cwd to an absolute existing directory", () => {
    const dir = tempDir();
    expect(resolveCwd(["--cwd", dir], "/fallback")).toBe(resolve(dir));
  });

  it("rejects a missing --cwd value", () => {
    expect(resolveCwd(["--cwd"], "/fallback")).toBeNull();
    expect(resolveCwd(["--cwd", "--port"], "/fallback")).toBeNull();
  });

  it("rejects a non-existent path", () => {
    expect(resolveCwd(["--cwd", "/definitely/not/here"], "/fallback")).toBeNull();
  });

  it("rejects a path that is a file, not a directory", () => {
    const dir = tempDir();
    const file = join(dir, "package.json");
    writeFileSync(file, "{}");
    expect(resolveCwd(["--cwd", file], "/fallback")).toBeNull();
  });
});
