import { useState } from "react";
import type { ApplyScope } from "@ui-tuner/protocol";
import { useSidepanelStore } from "../../state/sidepanel-store";
import { useT } from "../../i18n/use-t";

/**
 * Apply to Code flow (M8, plan §29/§30/§31/§34). The Changes tab footer Apply
 * button opens the §30 dialog (scope + agent); Apply hands the ChangeSet to the
 * bridge → Codex edits source → §31 result card (success / honest failure).
 */
export function ApplySection() {
  const t = useT();
  const changes = useSidepanelStore((s) => s.changes);
  const selection = useSidepanelStore((s) => s.selection);
  const source = useSidepanelStore((s) => s.source);
  const elementNames = useSidepanelStore((s) => s.elementNames);
  const bridgeStatus = useSidepanelStore((s) => s.bridgeStatus);
  const agents = useSidepanelStore((s) => s.agents);
  const applyState = useSidepanelStore((s) => s.applyState);
  const applyResult = useSidepanelStore((s) => s.applyResult);
  const applyConfirmedCount = useSidepanelStore((s) => s.applyConfirmedCount);
  const applyNeedsReload = useSidepanelStore((s) => s.applyNeedsReload);
  const applyChanges = useSidepanelStore((s) => s.applyChanges);
  const clearApplyState = useSidepanelStore((s) => s.clearApplyState);
  const reloadPage = useSidepanelStore((s) => s.reloadPage);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [scope, setScope] = useState<ApplyScope>("instance");

  const selectedElementId = selection?.element.id ?? null;
  const elementChanges = selectedElementId
    ? changes.filter((c) => c.elementId === selectedElementId)
    : [];
  const agent = agents.find((a) => a.id === "codex") ?? agents[0] ?? null;
  const bridgeConnected = bridgeStatus === "connected";

  const componentLabel =
    source && source.confidence !== "unknown" && source.componentName
      ? source.componentName
      : selectedElementId
        ? (elementNames[selectedElementId] ?? selection?.element.tagName ?? "element")
        : "element";
  const sourceUnknown = !source || source.confidence === "unknown";

  // --- Result card (§31) ---------------------------------------------------
  if (applyState === "applied" && applyResult) {
    return (
      <section className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
        <p className="text-[12px] font-semibold text-ok-text">{t("apply.applied")}</p>
        <p className="mt-1 text-[11px] text-ok-text/90">
          {t("apply.appliedCount", {
            count: applyConfirmedCount ?? applyResult.files?.length ?? 0,
          })}
        </p>
        {applyResult.files && applyResult.files.length > 0 && (
          <p className="mt-0.5 truncate font-mono text-[10px] text-ok-text/80" title={applyResult.files.join(", ")}>
            {applyResult.files.join(", ")}
          </p>
        )}
        {applyResult.summary && (
          <p className="mt-1 text-[10px] leading-relaxed text-ok-text/70">{applyResult.summary}</p>
        )}
        {applyNeedsReload && (
          <p className="mt-2 rounded bg-amber-500/10 px-2 py-1 text-[10px] leading-relaxed text-warn-text/90">
            {t("apply.needsReload")}
          </p>
        )}
        <div className="mt-2 flex gap-2">
          {applyNeedsReload && (
            <button
              type="button"
              onClick={reloadPage}
              className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-ok-text hover:bg-emerald-500/25"
            >
              {t("apply.reload")}
            </button>
          )}
          <button
            type="button"
            onClick={clearApplyState}
            className="rounded border border-emerald-500/40 px-2.5 py-1 text-[11px] font-medium text-ok-text hover:bg-emerald-500/20"
          >
            {t("apply.done")}
          </button>
        </div>
      </section>
    );
  }

  if (applyState === "failed" && applyResult) {
    return (
      <section className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5">
        <p className="text-[12px] font-semibold text-danger-text">{t("apply.failed")}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-danger-text/90">
          {t("apply.failedReason", { message: applyResult.error?.message ?? "Unknown error." })}
        </p>
        <p className="mt-1 text-[10px] text-danger-text/70">{t("apply.failedHint")}</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="rounded border border-red-500/40 px-2.5 py-1 text-[11px] font-medium text-danger-text hover:bg-red-500/20"
          >
            {t("apply.retry")}
          </button>
          <button
            type="button"
            onClick={clearApplyState}
            className="rounded px-2.5 py-1 text-[11px] text-dim hover:text-text"
          >
            {t("apply.dismiss")}
          </button>
        </div>
      </section>
    );
  }

  if (applyState === "applying") {
    return (
      <section className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2.5">
        <p className="flex items-center gap-2 text-[12px] font-medium text-info-text">
          <span className="size-1.5 animate-pulse rounded-full bg-sky-400" />
          {t("apply.applying")}
        </p>
        <p className="mt-1 text-[10px] text-info-text/70">
          {t("apply.applyingAgent", { agent: agent?.name ?? "Agent" })}
        </p>
      </section>
    );
  }

  // --- Apply Dialog (§30) ---------------------------------------------------
  if (dialogOpen) {
    return (
      <section className="rounded-md border border-edge-strong bg-surface-solid px-3 py-2.5">
        <p className="text-[12px] font-semibold text-text-strong">{t("apply.dialogTitle")}</p>
        <p className="mt-1 truncate font-mono text-[11px] text-accent-text">{componentLabel}</p>
        <p className="mt-0.5 text-[10px] text-faint">
          {t("apply.changeCount", { count: elementChanges.length })}
        </p>

        <div className="mt-2.5">
          <p className="text-[10px] font-medium tracking-wider text-faint uppercase">
            {t("apply.scope")}
          </p>
          <label className="mt-1 flex items-center gap-2 text-[11px] text-text">
            <input
              type="radio"
              name="apply-scope"
              checked={scope === "instance"}
              onChange={() => setScope("instance")}
              className="accent-violet-500"
            />
            {t("apply.scopeInstance")}
          </label>
          <label className="mt-1 flex items-center gap-2 text-[11px] text-text">
            <input
              type="radio"
              name="apply-scope"
              checked={scope === "component"}
              onChange={() => setScope("component")}
              className="accent-violet-500"
            />
            {t("apply.scopeComponent")}
          </label>
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <span className="text-[10px] font-medium tracking-wider text-faint uppercase">
            {t("agent.title")}
          </span>
          <span className="text-[11px] text-text">{agent?.name ?? "—"}</span>
          {agent && (
            <span
              className={`ml-auto size-1.5 rounded-full ${agent.available ? "bg-emerald-400" : "bg-ghost"}`}
            />
          )}
        </div>

        {sourceUnknown && (
          <p className="mt-2 rounded bg-amber-500/10 px-2 py-1 text-[10px] leading-relaxed text-warn-text/90">
            {t("apply.sourceUnknown")}
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setDialogOpen(false)}
            className="flex-1 rounded-md border border-edge-strong px-3 py-1.5 text-[12px] font-medium text-text hover:bg-control"
          >
            {t("action.cancel")}
          </button>
          <button
            type="button"
            disabled={!bridgeConnected || elementChanges.length === 0 || sourceUnknown}
            title={
              sourceUnknown
                ? t("apply.titleSourceUnknown")
                : !bridgeConnected
                  ? t("apply.titleBridgeOffline")
                  : elementChanges.length === 0
                    ? t("apply.titleNoChanges")
                    : t("apply.titleApply")
            }
            onClick={() => {
              setDialogOpen(false);
              applyChanges(scope);
            }}
            className="flex-1 rounded-md bg-inverse px-3 py-1.5 text-[12px] font-semibold text-inverse-text enabled:hover:bg-inverse-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("apply.confirm")}
          </button>
        </div>
      </section>
    );
  }

  // --- Idle: Apply button ---------------------------------------------------
  if (elementChanges.length === 0 && applyState === "idle") return null;
  return (
    <button
      type="button"
      onClick={() => setDialogOpen(true)}
      disabled={!bridgeConnected || elementChanges.length === 0 || sourceUnknown}
      title={
        !bridgeConnected
          ? t("apply.titleBridgeOffline")
          : elementChanges.length === 0
            ? t("apply.titleNoChanges")
            : sourceUnknown
              ? t("apply.titleManualCopy")
              : t("apply.titleApply")
      }
      className="w-full rounded-md bg-violet-500/20 px-3 py-1.5 text-[12px] font-semibold text-accent-text ring-1 ring-violet-500/50 transition-colors enabled:hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {t("apply.button")}
    </button>
  );
}
