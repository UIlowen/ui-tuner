import { spawn } from "node:child_process";
import type { ApplyChangeRequest, ApplyChangeResult } from "@ui-tuner/protocol";
import { applyNotImplementedMessage, type AgentAdapter } from "./types.js";
import { defaultVersionRunner, type VersionRunner } from "./detect.js";
import { buildCodexApplyPrompt } from "./prompt.js";
import { detectChangedFiles, snapshotSourceFiles } from "./fileDiff.js";

/** Result of one `codex exec` run. */
export interface CodexRunOutcome {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * Spawns `codex exec` — injectable so tests never launch a real agent.
 * Resolved with the process outcome; never rejects on non-zero exit.
 */
export type CodexRunner = (opts: {
  cwd: string;
  prompt: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}) => Promise<CodexRunOutcome>;

const CODEX_MODEL = process.env.UI_TUNER_CODEX_MODEL ?? "gpt-5.5";
const APPLY_TIMEOUT_MS = 10 * 60 * 1000; // applying source edits can take minutes

/**
 * Environment for the Codex subprocess: inherit the bridge's env, pass proxy
 * vars through, and always keep loopback off the proxy so the MCP endpoint
 * stays reachable (the codex model stream needs the proxy; localhost does not).
 */
function codexEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const noProxy = new Set(
    (env.NO_PROXY ?? env.no_proxy ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );
  noProxy.add("localhost").add("127.0.0.1").add("::1");
  env.NO_PROXY = [...noProxy].join(",");
  env.no_proxy = env.NO_PROXY;
  return env;
}

export const defaultCodexRunner: CodexRunner = ({ cwd, prompt, env, timeoutMs }) =>
  new Promise((resolvePromise) => {
    const child = spawn(
      "codex",
      [
        "exec",
        "--skip-git-repo-check",
        "--dangerously-bypass-approvals-and-sandbox",
        "-m",
        CODEX_MODEL,
        prompt,
      ],
      // stdin must be "ignore" (→ /dev/null): a piped-but-never-closed stdin
      // makes codex block on "Reading additional input from stdin…" forever.
      { cwd, env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolvePromise({ exitCode: -1, stdout, stderr: String(error), timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (process.env.UI_TUNER_DEBUG_CODEX) {
        void import("node:fs").then((fs) =>
          fs.writeFileSync(
            "/tmp/ui-tuner-codex-last.log",
            `exit=${code} timedOut=${timedOut}\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`,
          ),
        );
      }
      resolvePromise({ exitCode: code ?? -1, stdout, stderr, timedOut });
    });
  });

/**
 * Codex adapter (plan §44, priority agent). `applyChanges` drives a real
 * `codex exec` in the project root to edit the source file, then reports the
 * files that actually changed on disk. Never fabricates success.
 */
export class CodexAdapter implements AgentAdapter {
  readonly id = "codex";
  readonly name = "Codex";

  constructor(
    private readonly versionRunner: VersionRunner = defaultVersionRunner,
    private readonly codexRunner: CodexRunner = defaultCodexRunner,
  ) {}

  isAvailable(): Promise<boolean> {
    return this.versionRunner("codex", ["--version"], 3_000);
  }

  async applyChanges(request: ApplyChangeRequest): Promise<ApplyChangeResult> {
    // §43 rule 15 / §47: never guess-and-edit when the source is unknown.
    const sourceFile = request.context.component?.source?.file;
    if (!sourceFile) {
      return {
        success: false,
        error: {
          code: "SOURCE_NOT_FOUND",
          message:
            "Source could not be resolved for this element — reselect an element with a linked source. Preview changes are still active.",
        },
      };
    }

    if (!(await this.isAvailable())) {
      return {
        success: false,
        error: {
          code: "AGENT_OFFLINE",
          message: "Codex CLI is not available on this machine. Preview changes are safe.",
        },
      };
    }

    const prompt = buildCodexApplyPrompt(request);
    const before = snapshotSourceFiles(request.project.root);

    let outcome: CodexRunOutcome;
    try {
      outcome = await this.codexRunner({
        cwd: request.project.root,
        prompt,
        env: codexEnv(),
        timeoutMs: APPLY_TIMEOUT_MS,
      });
    } catch (error) {
      return {
        success: false,
        error: { code: "APPLY_FAILED", message: `Codex run failed: ${String(error)}` },
      };
    }

    if (outcome.timedOut) {
      return {
        success: false,
        error: { code: "APPLY_FAILED", message: "Codex timed out while editing source." },
      };
    }

    const files = detectChangedFiles(request.project.root, before);
    if (outcome.exitCode !== 0) {
      return {
        success: false,
        files: files.length > 0 ? files : undefined,
        error: {
          code: "APPLY_FAILED",
          message: `Codex exited with code ${outcome.exitCode}. ${outcome.stderr.slice(-300)}`.trim(),
        },
      };
    }
    if (files.length === 0) {
      return {
        success: false,
        error: {
          code: "APPLY_FAILED",
          message: "Codex finished but no source file changed. Preview changes are still active.",
        },
      };
    }

    return {
      success: true,
      files,
      summary:
        request.changes.length === 0
          ? `Applied the user instruction to ${files.join(", ")}`
          : `Applied ${request.changes.length} change(s) to ${files.join(", ")}`,
    };
  }
}

/** Placeholder adapter (plan §44): real detection, honest NOT_IMPLEMENTED apply. */
class PlaceholderAdapter implements AgentAdapter {
  constructor(
    readonly id: string,
    readonly name: string,
    private readonly binary: string,
    private readonly runner: VersionRunner,
  ) {}

  isAvailable(): Promise<boolean> {
    return this.runner(this.binary, ["--version"], 3_000);
  }

  applyChanges(): Promise<ApplyChangeResult> {
    return Promise.resolve({
      success: false,
      error: { code: "AGENT_OFFLINE", message: applyNotImplementedMessage(this.name) },
    });
  }
}

/** Claude Code adapter — placeholder with real detection (plan §44). */
export function createClaudeCodeAdapter(runner: VersionRunner = defaultVersionRunner): AgentAdapter {
  return new PlaceholderAdapter("claude-code", "Claude Code", "claude", runner);
}

/** Cursor adapter — placeholder with real detection (plan §44). */
export function createCursorAdapter(runner: VersionRunner = defaultVersionRunner): AgentAdapter {
  return new PlaceholderAdapter("cursor", "Cursor", "cursor", runner);
}

/** All known adapters, Codex first (plan §44). */
export function createAdapters(
  runner: VersionRunner = defaultVersionRunner,
  codexRunner: CodexRunner = defaultCodexRunner,
): AgentAdapter[] {
  return [
    new CodexAdapter(runner, codexRunner),
    createClaudeCodeAdapter(runner),
    createCursorAdapter(runner),
  ];
}
