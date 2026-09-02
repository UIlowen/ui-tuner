import { useState } from "react";
import type { ApplyScope } from "@ui-tuner/protocol";
import { useSidepanelStore } from "../../state/sidepanel-store";

/**
 * Apply to Code flow (M8, plan §29/§30/§31/§34). The Changes tab footer Apply
 * button opens the §30 dialog (scope + agent); Apply hands the ChangeSet to the
 * bridge → Codex edits source → §31 result card (success / honest failure).
 */
export function ApplySection() {
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
      <section className="rounded-md border border-emerald-900/60 bg-emerald-950/40 px-3 py-2.5">
        <p className="text-[12px] font-semibold text-emerald-300">✓ Applied</p>
        <p className="mt-1 text-[11px] text-emerald-200/90">
          {applyConfirmedCount ?? applyResult.files?.length ?? 0} changes
        </p>
        {applyResult.files && applyResult.files.length > 0 && (
          <p className="mt-0.5 truncate font-mono text-[10px] text-emerald-400/80" title={applyResult.files.join(", ")}>
            {applyResult.files.join(", ")}
          </p>
        )}
        {applyResult.summary && (
          <p className="mt-1 text-[10px] leading-relaxed text-emerald-200/70">{applyResult.summary}</p>
        )}
        {applyNeedsReload && (
          <p className="mt-2 rounded bg-amber-500/10 px-2 py-1 text-[10px] leading-relaxed text-amber-300/90">
            改动已写入源码。静态页面无热更新，需刷新后才会生效。
          </p>
        )}
        <div className="mt-2 flex gap-2">
          {applyNeedsReload && (
            <button
              type="button"
              onClick={reloadPage}
              className="rounded border border-emerald-700 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/25"
            >
              刷新页面查看
            </button>
          )}
          <button
            type="button"
            onClick={clearApplyState}
            className="rounded border border-emerald-800 px-2.5 py-1 text-[11px] font-medium text-emerald-200 hover:bg-emerald-900/40"
          >
            Done
          </button>
        </div>
      </section>
    );
  }

  if (applyState === "failed" && applyResult) {
    return (
      <section className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2.5">
        <p className="text-[12px] font-semibold text-red-300">Unable to apply changes</p>
        <p className="mt-1 text-[11px] leading-relaxed text-red-200/90">
          Reason: {applyResult.error?.message ?? "Unknown error."}
        </p>
        <p className="mt-1 text-[10px] text-red-300/70">Preview changes are still active.</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="rounded border border-red-800 px-2.5 py-1 text-[11px] font-medium text-red-200 hover:bg-red-900/40"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={clearApplyState}
            className="rounded px-2.5 py-1 text-[11px] text-zinc-400 hover:text-zinc-200"
          >
            Dismiss
          </button>
        </div>
      </section>
    );
  }

  if (applyState === "applying") {
    return (
      <section className="rounded-md border border-sky-900/60 bg-sky-950/40 px-3 py-2.5">
        <p className="flex items-center gap-2 text-[12px] font-medium text-sky-300">
          <span className="size-1.5 animate-pulse rounded-full bg-sky-400" />
          Applying to source…
        </p>
        <p className="mt-1 text-[10px] text-sky-200/70">{agent?.name ?? "Agent"} 正在修改源码</p>
      </section>
    );
  }

  // --- Apply Dialog (§30) ---------------------------------------------------
  if (dialogOpen) {
    return (
      <section className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2.5">
        <p className="text-[12px] font-semibold text-zinc-100">Apply Changes</p>
        <p className="mt-1 truncate font-mono text-[11px] text-violet-300">{componentLabel}</p>
        <p className="mt-0.5 text-[10px] text-zinc-500">{elementChanges.length} visual changes</p>

        <div className="mt-2.5">
          <p className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">Scope</p>
          <label className="mt-1 flex items-center gap-2 text-[11px] text-zinc-300">
            <input
              type="radio"
              name="apply-scope"
              checked={scope === "instance"}
              onChange={() => setScope("instance")}
              className="accent-violet-500"
            />
            This instance
          </label>
          <label className="mt-1 flex items-center gap-2 text-[11px] text-zinc-300">
            <input
              type="radio"
              name="apply-scope"
              checked={scope === "component"}
              onChange={() => setScope("component")}
              className="accent-violet-500"
            />
            Component
          </label>
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <span className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">Agent</span>
          <span className="text-[11px] text-zinc-200">{agent?.name ?? "—"}</span>
          {agent && (
            <span
              className={`ml-auto size-1.5 rounded-full ${agent.available ? "bg-emerald-400" : "bg-zinc-600"}`}
            />
          )}
        </div>

        {sourceUnknown && (
          <p className="mt-2 rounded bg-amber-500/10 px-2 py-1 text-[10px] leading-relaxed text-amber-300/90">
            无法定位源码（Preview only）。Apply 需要 ● Source linked 的元素。
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setDialogOpen(false)}
            className="flex-1 rounded-md border border-zinc-700 px-3 py-1.5 text-[12px] font-medium text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!bridgeConnected || elementChanges.length === 0 || sourceUnknown}
            title={
              sourceUnknown
                ? "无法定位源码（Preview only）——Apply 需要 ● Source linked 的元素"
                : !bridgeConnected
                  ? "Bridge 未连接"
                  : elementChanges.length === 0
                    ? "当前选中元素没有待应用的修改"
                    : "把修改落到源码"
            }
            onClick={() => {
              setDialogOpen(false);
              applyChanges(scope);
            }}
            className="flex-1 rounded-md bg-zinc-100 px-3 py-1.5 text-[12px] font-semibold text-zinc-900 enabled:hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply
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
          ? "Bridge 未连接"
          : elementChanges.length === 0
            ? "当前选中元素没有待应用的修改"
            : sourceUnknown
              ? "无法定位源码（Preview only）——Apply 需要 ● Source linked 的元素；可改用「复制改动」手动粘贴给 AI"
              : "把修改落到源码"
      }
      className="w-full rounded-md bg-violet-500/20 px-3 py-1.5 text-[12px] font-semibold text-violet-300 ring-1 ring-violet-500/50 transition-colors enabled:hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-40"
    >
      Apply to Code
    </button>
  );
}
