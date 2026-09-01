import { useMemo, useState } from "react";
import {
  assembleAgentContext,
  type AgentInclude,
  type ContextLevel,
} from "@ui-tuner/protocol";
import { useSidepanelStore } from "../../state/sidepanel-store";

/**
 * Agent tab (plan §23–§27). Assembles the prompt context the coding agent
 * (Codex) will read over MCP, mirrors it as a live §26 preview, and hands the
 * instruction to the bridge. Apply to Code is M8 — this tab never claims to
 * change source itself.
 */

const INCLUDE_LABELS: { key: keyof AgentInclude; label: string }[] = [
  { key: "dom", label: "DOM" },
  { key: "styles", label: "Styles" },
  { key: "source", label: "Source" },
  { key: "screenshot", label: "Screenshot" },
  { key: "parentTree", label: "Parent Tree" },
];

const LEVELS: ContextLevel[] = [1, 2, 3];

function formatTime(at: number): string {
  return new Date(at).toTimeString().slice(0, 8);
}

export function AgentTab() {
  const selection = useSidepanelStore((s) => s.selection);
  const source = useSidepanelStore((s) => s.source);
  const changes = useSidepanelStore((s) => s.changes);
  const bridgeStatus = useSidepanelStore((s) => s.bridgeStatus);
  const agents = useSidepanelStore((s) => s.agents);
  const agentInstruction = useSidepanelStore((s) => s.agentInstruction);
  const agentInclude = useSidepanelStore((s) => s.agentInclude);
  const agentContextLevel = useSidepanelStore((s) => s.agentContextLevel);
  const agentSent = useSidepanelStore((s) => s.agentSent);
  const lastApplied = useSidepanelStore((s) => s.lastApplied);
  const setAgentInstruction = useSidepanelStore((s) => s.setAgentInstruction);
  const setAgentInclude = useSidepanelStore((s) => s.setAgentInclude);
  const setAgentContextLevel = useSidepanelStore((s) => s.setAgentContextLevel);
  const sendAgentRequest = useSidepanelStore((s) => s.sendAgentRequest);
  const dismissApplied = useSidepanelStore((s) => s.dismissApplied);
  const [copied, setCopied] = useState(false);

  // Codex is the priority agent (plan §44); fall back to the first detected.
  const agent = agents.find((a) => a.id === "codex") ?? agents[0] ?? null;
  const connected = bridgeStatus === "connected";

  const prompt = useMemo(
    () =>
      assembleAgentContext({
        selection,
        source,
        changes,
        instruction: agentInstruction,
        include: agentInclude,
        level: agentContextLevel,
      }),
    [selection, source, changes, agentInstruction, agentInclude, agentContextLevel],
  );

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-3">
      {lastApplied && (
        <section className="rounded-md border border-emerald-900/60 bg-emerald-950/40 px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] leading-relaxed text-emerald-200">
              <span className="font-semibold">{agent?.name ?? "Agent"} 已修改源码：</span>
              {lastApplied.summary}（{lastApplied.files.length} 个文件）
            </p>
            <button
              type="button"
              onClick={dismissApplied}
              aria-label="关闭"
              className="shrink-0 text-emerald-400/70 hover:text-emerald-300"
            >
              ✕
            </button>
          </div>
          <p className="mt-1 text-[10px] text-emerald-400/70">刷新页面后可重新核对 Preview</p>
        </section>
      )}

      {/* Context card (§23) */}
      <section className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
        <p className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">Context</p>
        {selection ? (
          <>
            <p className="mt-1 truncate font-mono text-[12px] font-semibold text-violet-300">
              {"<"}
              {selection.element.tagName}
              {">"}
              <span className="ml-1.5 rounded bg-zinc-800 px-1 py-px text-[9px] font-normal text-zinc-400">
                {selection.element.id}
              </span>
            </p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">
              {source?.confidence === "exact" && source.file
                ? `${source.componentName ?? selection.element.tagName} · ${source.file}${source.line !== undefined ? `:${source.line}` : ""}`
                : source?.confidence === "inferred" && source.file
                  ? `Possible: ${source.file}`
                  : "Preview only — 未定位源码"}
            </p>
          </>
        ) : (
          <p className="mt-1 text-[11px] text-zinc-600">未选中元素</p>
        )}
        <div className="mt-2 flex h-16 items-center justify-center rounded border border-dashed border-zinc-800 text-[10px] text-zinc-600">
          截图由 {agent?.name ?? "Agent"} 经 ui_capture 抓取
        </div>
      </section>

      {/* Instruction */}
      <section>
        <p className="mb-1.5 text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
          Instruction
        </p>
        <textarea
          value={agentInstruction}
          onChange={(event) => setAgentInstruction(event.target.value)}
          placeholder="整体紧凑一点，标题不要变小…"
          rows={3}
          className="w-full resize-none rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[12px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
      </section>

      {/* Agent row + include flags */}
      <section className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
            Agent
          </span>
          <span className="text-[12px] font-medium text-zinc-200">{agent?.name ?? "—"}</span>
          {agent && (
            <span
              className={`ml-auto flex items-center gap-1 text-[10px] font-medium ${
                agent.available ? "text-emerald-400" : "text-zinc-500"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${agent.available ? "bg-emerald-400" : "bg-zinc-600"}`}
              />
              {agent.available ? "available" : "not found"}
            </span>
          )}
        </div>
        {!connected && (
          <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500">
            Agent unavailable — Preview changes are safe（§36）。启动 Bridge 后 Codex 即可经 MCP
            获取上下文。
          </p>
        )}

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
          {INCLUDE_LABELS.map(({ key, label }) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-300"
            >
              <input
                type="checkbox"
                checked={agentInclude[key]}
                onChange={(event) => setAgentInclude(key, event.target.checked)}
                className="size-3 accent-violet-500"
              />
              {label}
            </label>
          ))}
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <span className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
            Context Level
          </span>
          <div className="flex gap-1">
            {LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setAgentContextLevel(level)}
                className={`rounded px-2 py-0.5 text-[10px] font-medium tabular-nums ${
                  agentContextLevel === level
                    ? "bg-violet-500/25 text-violet-300"
                    : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* §26 prompt preview */}
      <section>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
            Prompt Context（§26）
          </p>
          <button
            type="button"
            onClick={() => void copyPrompt()}
            className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-300 hover:bg-zinc-800"
          >
            {copied ? "已复制" : "Copy"}
          </button>
        </div>
        <pre className="max-h-56 overflow-auto rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-zinc-400">
          {prompt}
        </pre>
      </section>

      <button
        type="button"
        onClick={sendAgentRequest}
        disabled={!connected}
        className="w-full rounded-md bg-zinc-100 px-3 py-1.5 text-[12px] font-semibold text-zinc-900 enabled:hover:bg-white disabled:opacity-40"
      >
        发送至 Bridge
      </button>
      {agentSent && (
        <p className="text-center text-[10px] text-zinc-500">
          已发送至 Bridge · {formatTime(agentSent.at)} — {agent?.name ?? "Codex"} 可经 MCP
          ui_get_context 获取
        </p>
      )}
    </div>
  );
}
