import { useState } from "react";
import { useSidepanelStore } from "../../state/sidepanel-store";
import { useT } from "../../i18n/use-t";
import { ApplySection } from "./ApplySection";
import { formatChangesetForCopy } from "../format-changeset";

/**
 * Changes tab (plan §13/§14): changes grouped per element, each row revertable,
 * per-element Revert, and Reset All at the bottom. Apply is Milestone 8.
 */
export function ChangesTab() {
  const t = useT();
  const changes = useSidepanelStore((s) => s.changes);
  const elementNames = useSidepanelStore((s) => s.elementNames);
  const selection = useSidepanelStore((s) => s.selection);
  const source = useSidepanelStore((s) => s.source);
  const revertChange = useSidepanelStore((s) => s.revertChange);
  const revertElement = useSidepanelStore((s) => s.revertElement);
  const resetChanges = useSidepanelStore((s) => s.resetChanges);
  const [copied, setCopied] = useState(false);

  const copyChanges = async () => {
    try {
      await navigator.clipboard.writeText(
        formatChangesetForCopy({ changes, elementNames, source, selection }),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  // Group changes by element, preserving first-seen order.
  const groups: { elementId: string; tagName: string; changes: typeof changes }[] = [];
  for (const change of changes) {
    let group = groups.find((entry) => entry.elementId === change.elementId);
    if (!group) {
      group = {
        elementId: change.elementId,
        tagName: elementNames[change.elementId] ?? change.elementId.replace("ut-", ""),
        changes: [],
      };
      groups.push(group);
    }
    group.changes.push(change);
  }

  return (
    <section className="rounded-md border border-edge bg-surface px-3 py-2.5">
      <p className="text-[12px] font-semibold text-text">{t("changes.title", { count: changes.length })}</p>

      {changes.length === 0 ? (
        <p className="mt-2 text-[11px] leading-relaxed text-ghost">{t("changes.emptyHint")}</p>
      ) : (
        <div className="mt-2 space-y-2.5">
          {groups.map((group) => (
            <div key={group.elementId} className="rounded bg-inset px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-mono text-[11px] font-semibold text-accent-text/90">
                  {group.tagName}
                </span>
                <span className="shrink-0 font-mono text-[9px] text-ghost">
                  {group.elementId}
                </span>
                <button
                  type="button"
                  onClick={() => revertElement(group.elementId)}
                  className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] text-dim hover:bg-control hover:text-text"
                >
                  {t("changes.revertElement")}
                </button>
              </div>
              <ul className="mt-1 space-y-0.5">
                {group.changes.map((change) => (
                  <li key={change.id} className="flex items-baseline gap-2 text-[11px]">
                    <span className="shrink-0 text-text">{change.property}</span>
                    <span className="ml-auto min-w-0 truncate font-mono text-[10px] text-faint">
                      <span className="line-through decoration-edge-strong">
                        {change.previousValue || "—"}
                      </span>
                      {" → "}
                      <span className="text-ok-text">{change.nextValue}</span>
                    </span>
                    <button
                      type="button"
                      title={t("changes.revertProperty", { property: change.property })}
                      onClick={() => revertChange(change.id)}
                      className="shrink-0 rounded px-1 py-px text-[10px] text-faint hover:bg-control hover:text-text"
                    >
                      ↩
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {changes.length > 0 && (
        <div className="mt-3 flex items-center gap-2 border-t border-edge pt-2.5">
          <button
            type="button"
            onClick={() => void copyChanges()}
            title={t("changes.copyTitle")}
            className="rounded-md bg-sky-500/15 px-2.5 py-1 text-[11px] font-medium text-info-text ring-1 ring-sky-500/40 transition-colors hover:bg-sky-500/25"
          >
            {copied ? t("action.copied") : t("changes.copy")}
          </button>
          <button
            type="button"
            onClick={resetChanges}
            className="rounded-md bg-red-500/15 px-2.5 py-1 text-[11px] font-medium text-danger-text ring-1 ring-red-500/40 transition-colors hover:bg-red-500/25"
          >
            {t("changes.resetAll")}
          </button>
          <span className="ml-auto font-mono text-[10px] text-ghost">
            {t("changes.pending", { count: changes.length })}
          </span>
        </div>
      )}

      {/* M8 Apply to Code: dialog / applying / result, or the Apply button. */}
      <div className="mt-2.5">
        <ApplySection />
      </div>
    </section>
  );
}
