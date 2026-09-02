import { useState } from "react";
import { useSidepanelStore } from "../../state/sidepanel-store";
import { ApplySection } from "./ApplySection";
import { formatChangesetForCopy } from "../format-changeset";

/**
 * Changes tab (plan §13/§14): changes grouped per element, each row revertable,
 * per-element Revert, and Reset All at the bottom. Apply is Milestone 8.
 */
export function ChangesTab() {
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
    <section className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
      <p className="text-[12px] font-semibold text-zinc-200">Preview · {changes.length}</p>

      {changes.length === 0 ? (
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
          在 Style 面板调整样式后，修改会记录在这里。Preview 只改浏览器，不动源码。
        </p>
      ) : (
        <div className="mt-2 space-y-2.5">
          {groups.map((group) => (
            <div key={group.elementId} className="rounded bg-zinc-950/40 px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-mono text-[11px] font-semibold text-violet-300/90">
                  {group.tagName}
                </span>
                <span className="shrink-0 font-mono text-[9px] text-zinc-600">
                  {group.elementId}
                </span>
                <button
                  type="button"
                  onClick={() => revertElement(group.elementId)}
                  className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  Revert
                </button>
              </div>
              <ul className="mt-1 space-y-0.5">
                {group.changes.map((change) => (
                  <li key={change.id} className="flex items-baseline gap-2 text-[11px]">
                    <span className="shrink-0 text-zinc-300">{change.property}</span>
                    <span className="ml-auto min-w-0 truncate font-mono text-[10px] text-zinc-500">
                      <span className="line-through decoration-zinc-700">
                        {change.previousValue || "—"}
                      </span>
                      {" → "}
                      <span className="text-emerald-300">{change.nextValue}</span>
                    </span>
                    <button
                      type="button"
                      title={`Revert ${change.property}`}
                      onClick={() => revertChange(change.id)}
                      className="shrink-0 rounded px-1 py-px text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
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
        <div className="mt-3 flex items-center gap-2 border-t border-zinc-800 pt-2.5">
          <button
            type="button"
            onClick={() => void copyChanges()}
            title="复制全部改动（含源码位置），粘贴到 Claude / Codex 对话框"
            className="rounded-md bg-sky-500/15 px-2.5 py-1 text-[11px] font-medium text-sky-300 ring-1 ring-sky-500/40 transition-colors hover:bg-sky-500/25"
          >
            {copied ? "已复制 ✓" : "复制改动"}
          </button>
          <button
            type="button"
            onClick={resetChanges}
            className="rounded-md bg-red-500/15 px-2.5 py-1 text-[11px] font-medium text-red-300 ring-1 ring-red-500/40 transition-colors hover:bg-red-500/25"
          >
            Reset All
          </button>
          <span className="ml-auto font-mono text-[10px] text-zinc-600">{changes.length} 项待应用</span>
        </div>
      )}

      {/* M8 Apply to Code: dialog / applying / result, or the Apply button. */}
      <div className="mt-2.5">
        <ApplySection />
      </div>
    </section>
  );
}
