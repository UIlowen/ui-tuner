import { useMemo, useState } from "react";
import {
  assembleAgentContext,
  type AgentInclude,
} from "@ui-tuner/protocol";
import { useSidepanelStore } from "../../state/sidepanel-store";
import { useT } from "../../i18n/use-t";
import type { MessageKey } from "../../i18n/messages";
import { CloseIcon, CopyIcon, InfoIcon, SendIcon } from "../../ui/icons";
import { ApplySection } from "./ApplySection";

/**
 * Agent tab (plan §23–§27), laid out per the design's 图3: context card,
 * instruction textarea, include chips + context-level slider, live §26 prompt
 * preview, and the send button. Apply to Code (M8) sits above the send button
 * — it is the agent's other hand-off path.
 */

const CHIPS: { key: keyof AgentInclude; labelKey: MessageKey; active: string; inactive: string }[] = [
  { key: "dom", labelKey: "include.dom", active: "bg-chip-dom text-white", inactive: "bg-chip-dom/10" },
  { key: "styles", labelKey: "include.styles", active: "bg-chip-styles text-white", inactive: "bg-chip-styles/10" },
  { key: "source", labelKey: "include.source", active: "bg-chip-source text-white", inactive: "bg-chip-source/10" },
  { key: "screenshot", labelKey: "include.screenshot", active: "bg-chip-screenshot text-white", inactive: "bg-chip-screenshot/20" },
  { key: "parentTree", labelKey: "include.parentTree", active: "bg-chip-parent text-white", inactive: "bg-chip-parent/20" },
];

function formatTime(at: number): string {
  return new Date(at).toTimeString().slice(0, 8);
}

/** Section label with the design's hover-for-explanation info icon. */
function SectionLabel({ label, hintKey }: { label: string; hintKey: MessageKey }) {
  const t = useT();
  return (
    <p className="mb-3.5 flex items-center gap-2 text-[14px] font-medium text-text">
      {label}
      <span title={t(hintKey)} className="grid place-items-center text-ghost">
        <InfoIcon className="size-3" />
      </span>
    </p>
  );
}

export function AgentTab() {
  const t = useT();
  const selection = useSidepanelStore((s) => s.selection);
  const source = useSidepanelStore((s) => s.source);
  const changes = useSidepanelStore((s) => s.changes);
  const instructions = useSidepanelStore((s) => s.instructions);
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
        instructions,
        include: agentInclude,
        level: agentContextLevel,
      }),
    [selection, source, changes, agentInstruction, instructions, agentInclude, agentContextLevel],
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
              title={t("action.close")}
              className="grid size-5 shrink-0 place-items-center rounded-control text-ok-text/70 hover:text-ok-text"
            >
              <CloseIcon className="size-3.5" />
            </button>
          </div>
          <p className="mt-1 text-[10px] text-ok-text/70">{t("agent.appliedHint")}</p>
        </section>
      )}

      {/* Context card (§23) */}
      <section>
        <SectionLabel label={t("agent.context")} hintKey="hint.context" />
        <div className="rounded-lg border border-card-edge bg-surface px-4 py-4">
          {selection ? (
            <>
              <p className="flex items-baseline gap-4.5">
                <span className="truncate font-mono text-[14px] font-semibold text-tag-text">
                  {"<"}{selection.element.tagName}{">"}
                </span>
                <span className="shrink-0 font-mono text-[14px] text-text">
                  {selection.element.id}
                </span>
              </p>
              <p className="mt-1.5 truncate font-mono text-[12px] text-text/90">
                {source?.confidence === "exact" && source.file
                  ? `${source.componentName ?? selection.element.tagName} · ${source.file}${source.line !== undefined ? `:${source.line}` : ""}`
                  : source?.confidence === "inferred" && source.file
                    ? `${t("source.possible")}${source.file}`
                    : t("source.previewOnlyLong")}
              </p>
            </>
          ) : (
            <p className="text-[12px] text-ghost">{t("selection.empty")}</p>
          )}
        </div>
      </section>

      {/* Instruction */}
      <section>
        <SectionLabel label={t("agent.instruction")} hintKey="hint.instruction" />
        <textarea
          value={agentInstruction}
          onChange={(event) => setAgentInstruction(event.target.value)}
          placeholder={t("agent.instructionPlaceholder")}
          rows={3}
          className="w-full resize-none rounded-lg border border-card-edge bg-surface px-4 py-3 text-[12px] leading-relaxed text-text placeholder:text-ghost focus:border-brand focus:ring-1 focus:ring-brand/40 focus:outline-none"
        />
      </section>

      {/* Include chips + context level slider (one card, per the design's 图3) */}
      <section>
        <SectionLabel label={t("agent.title")} hintKey="hint.agent" />
        <div className="rounded-lg border border-card-edge bg-surface px-4 py-3">
          <div className="flex flex-wrap gap-3.5">
            {CHIPS.map(({ key, labelKey, active, inactive }) => (
              <button
                key={key}
                type="button"
                aria-pressed={agentInclude[key]}
                onClick={() => setAgentInclude(key, !agentInclude[key])}
                className={`rounded px-2.5 py-[3px] text-[12px] font-medium transition-colors ${
                  agentInclude[key] ? active : `${inactive} text-ghost`
                }`}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2.5">
            <span className="shrink-0 text-[12px] text-faint">{t("agent.contextLevel")}</span>
            <input
              type="range"
              min={1}
              max={3}
              step={1}
              value={agentContextLevel}
              aria-label={t("agent.contextLevel")}
              onChange={(event) =>
                setAgentContextLevel(Number(event.target.value) as 1 | 2 | 3)
              }
              className="h-1 min-w-0 flex-1 cursor-pointer accent-brand"
            />
            <span className="shrink-0 text-[12px] font-medium text-brand-hover tabular-nums">
              {t("agent.levelValue", { level: agentContextLevel })}
            </span>
          </div>
        </div>
      </section>

      {/* §26 prompt preview */}
      <section>
        <div className="mb-3.5 flex items-center justify-between">
          <p className="flex items-center gap-2 text-[14px] font-medium text-text">
            {t("agent.promptTitle")}
            <span title={t("hint.prompt")} className="grid place-items-center text-ghost">
              <InfoIcon className="size-3" />
            </span>
          </p>
          <button
            type="button"
            onClick={() => void copyPrompt()}
            title={copied ? t("action.copied") : t("agent.copyPrompt")}
            aria-label={copied ? t("action.copied") : t("agent.copyPrompt")}
            className="grid size-5 place-items-center rounded-control text-faint transition-colors hover:bg-control hover:text-text"
          >
            <CopyIcon className="size-4" />
          </button>
        </div>
        <pre className="max-h-56 overflow-auto rounded-lg border border-card-edge bg-inset-deep px-4 py-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-dim">
          {prompt}
        </pre>
      </section>

      {/* Apply to Code (M8) — the agent tab's other hand-off path. */}
      <ApplySection />

      {!connected && (
        <p className="text-[10px] leading-relaxed text-faint">{t("agent.unavailableHint")}</p>
      )}
      <button
        type="button"
        onClick={sendAgentRequest}
        disabled={!connected}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand/12 px-3 py-2.5 text-[14px] font-medium text-text/90 transition-colors enabled:hover:bg-brand enabled:hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        <SendIcon className="size-4" />
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
