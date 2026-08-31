import { useSidepanelStore } from "../../state/sidepanel-store";

/**
 * Changes tab (plan §13). Milestone 3 lists the recorded page-side changes;
 * Revert / Reset All arrive with the full ChangeSet lifecycle in Milestone 4.
 */
export function ChangesTab() {
  const changes = useSidepanelStore((s) => s.changes);

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
      <div className="flex items-baseline justify-between">
        <p className="text-[12px] font-semibold text-zinc-200">Preview · {changes.length}</p>
        <span className="font-mono text-[10px] text-zinc-600">M4: Revert / Reset</span>
      </div>

      {changes.length === 0 ? (
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
          在 Style 面板调整样式后，修改会记录在这里。Preview 只改浏览器，不动源码。
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {changes.map((change) => (
            <li key={change.id} className="flex items-baseline gap-2 text-[11px]">
              <span className="w-9 shrink-0 truncate font-mono text-[10px] text-violet-300/80">
                {change.elementId.replace("ut-", "")}
              </span>
              <span className="shrink-0 text-zinc-300">{change.property}</span>
              <span className="ml-auto min-w-0 truncate font-mono text-[10px] text-zinc-500">
                <span className="text-zinc-500 line-through decoration-zinc-700">
                  {change.previousValue || "—"}
                </span>
                {" → "}
                <span className="text-emerald-300">{change.nextValue}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
