import { useMemo, useState } from "react";
import {
  assembleAgentContext,
  type AgentInclude,
  type ContextLevel,
} from "@ui-tuner/protocol";
import { useSidepanelStore } from "../../state/sidepanel-store";
import { useT } from "../../i18n/use-t";
import type { MessageKey } from "../../i18n/messages";

/**
 * Agent tab (plan §23–§27). Assembles the prompt context the coding agent
 * (Codex) will read over MCP, mirrors it as a live §26 preview, and hands the
 * instruction to the bridge. Apply to Code is M8 — this tab never claims to
 * change source itself.
 */

const INCLUDE_LABELS: { key: keyof AgentInclude; labelKey: MessageKey }[] = [
  { key: "dom", labelKey: "include.dom" },
  { key: "styles", labelKey: "include.styles" },
  { key: "source", labelKey: "include.source" },
  { key: "screenshot", labelKey: "include.screenshot" },
  { key: "parentTree", labelKey: "include.parentTree" },
];

const LEVELS: ContextLevel[] = [1, 2, 3];

function formatTime(at: number): string {
  return new Date(at).toTimeString().slice(0, 8);
}

export function AgentTab() {
  const t = useT();
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
  const agentName = agent?.name ?? "Agent";

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
    <div className="space-y-2.5">
      {lastApplied && (
        <section className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] leading-relaxed text-ok-text">
              {t("agent.applied", {
                agent: agentName,
                summary: lastApplied.summary,
                count: lastApplied.files.length,
              })}
            </p>
            <button
              type="button"
              onClick={dismissApplied}
              aria-label={t("action.close")}
              className="shrink-0 text-ok-text/70 hover:text-ok-text"
            >
              ✕
            </button>
          </div>
          <p className="mt-1 text-[10px] text-ok-text/70">{t("agent.appliedHint")}</p>
        </section>
      )}

      {/* Context card (§23) */}
      <section className="rounded-md border border-edge bg-surface px-3 py-2.5">
        <p className="text-[10px] font-medium tracking-wider text-faint uppercase">
          {t("agent.context")}
        </p>
        {selection ? (
          <>
            <p className="mt-1 truncate font-mono text-[12px] font-semibold text-accent-text">
              {"<"}
              {selection.element.tagName}
              {">"}
              <span className="ml-1.5 rounded bg-control px-1 py-px text-[9px] font-normal text-dim">
                {selection.element.id}
              </span>
            </p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-faint">
              {source?.confidence === "exact" && source.file
                ? `${source.componentName ?? selection.element.tagName} · ${source.file}${source.line !== undefined ? `:${source.line}` : ""}`
                : source?.confidence === "inferred" && source.file
                  ? `${t("source.possible")}${source.file}`
                  : t("source.previewOnlyLong")}
            </p>
          </>
        ) : (
          <p className="mt-1 text-[11px] text-ghost">{t("selection.empty")}</p>
        )}
        <div className="mt-2 flex h-16 items-center justify-center rounded border border-dashed border-edge text-[10px] text-ghost">
          {t("agent.screenshotHint", { agent: agentName })}
        </div>
      </section>

      {/* Instruction */}
      <section>
        <p className="mb-1.5 text-[10px] font-medium tracking-wider text-faint uppercase">
          {t("agent.instruction")}
        </p>
        <textarea
          value={agentInstruction}
          onChange={(event) => setAgentInstruction(event.target.value)}
          placeholder={t("agent.instructionPlaceholder")}
          rows={3}
          className="w-full resize-none rounded-md border border-edge bg-surface px-3 py-2 text-[12px] leading-relaxed text-text placeholder:text-ghost focus:border-edge-strong focus:outline-none"
        />
      </section>

      {/* Agent row + include flags */}
      <section className="rounded-md border border-edge bg-surface px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium tracking-wider text-faint uppercase">
            {t("agent.title")}
          </span>
          <span className="text-[12px] font-medium text-text">{agent?.name ?? "—"}</span>
          {agent && (
            <span
              className={`ml-auto flex items-center gap-1 text-[10px] font-medium ${
                agent.available ? "text-ok-text" : "text-faint"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${agent.available ? "bg-emerald-400" : "bg-ghost"}`}
              />
              {agent.available ? t("agent.available") : t("agent.notFound")}
            </span>
          )}
        </div>
        {!connected && (
          <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
            {t("agent.unavailableHint")}
          </p>
        )}

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
          {INCLUDE_LABELS.map(({ key, labelKey }) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-1.5 text-[11px] text-text"
            >
              <input
                type="checkbox"
                checked={agentInclude[key]}
                onChange={(event) => setAgentInclude(key, event.target.checked)}
                className="size-3 accent-violet-500"
              />
              {t(labelKey)}
            </label>
          ))}
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <span className="text-[10px] font-medium tracking-wider text-faint uppercase">
            {t("agent.contextLevel")}
          </span>
          <div className="flex gap-1">
            {LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setAgentContextLevel(level)}
                className={`rounded px-2 py-0.5 text-[10px] font-medium tabular-nums ${
                  agentContextLevel === level
                    ? "bg-violet-500/25 text-accent-text"
                    : "bg-control text-faint hover:text-dim"
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
          <p className="text-[10px] font-medium tracking-wider text-faint uppercase">
            {t("agent.promptTitle")}
          </p>
          <button
            type="button"
            onClick={() => void copyPrompt()}
            className="rounded border border-edge-strong px-2 py-0.5 text-[10px] font-medium text-text hover:bg-control"
          >
            {copied ? t("action.copied") : t("agent.copyPrompt")}
          </button>
        </div>
        <pre className="max-h-56 overflow-auto rounded-md border border-edge bg-inset-deep px-3 py-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-dim">
          {prompt}
        </pre>
      </section>

      <button
        type="button"
        onClick={sendAgentRequest}
        disabled={!connected}
        className="w-full rounded-md bg-inverse px-3 py-1.5 text-[12px] font-semibold text-inverse-text enabled:hover:bg-inverse-hover disabled:opacity-40"
      >
        {t("agent.send")}
      </button>
      {agentSent && (
        <p className="text-center text-[10px] text-faint">
          {t("agent.sent", { time: formatTime(agentSent.at), agent: agentName })}
        </p>
      )}
    </div>
  );
}
