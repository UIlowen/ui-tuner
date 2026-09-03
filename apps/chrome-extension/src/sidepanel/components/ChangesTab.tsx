import { useSidepanelStore } from "../../state/sidepanel-store";
import { useT } from "../../i18n/use-t";

/**
 * Changes list: changes grouped per element, each row revertable, per-element
 * Revert, Reset All in the header. The element's natural-language instruction
 * (entered in the page-side editor card) shows under the group header when
 * present. The copy/apply actions live in the panel's sticky footer
 * (App.tsx FooterActions).
 */
export function ChangesTab() {
  const t = useT();
  const changes = useSidepanelStore((s) => s.changes);
  const elementNames = useSidepanelStore((s) => s.elementNames);
  const instructions = useSidepanelStore((s) => s.instructions);
  const revertChange = useSidepanelStore((s) => s.revertChange);
  const revertElement = useSidepanelStore((s) => s.revertElement);
  const resetChanges = useSidepanelStore((s) => s.resetChanges);

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
      <div className="flex items-center gap-2">
        <p className="text-[12px] font-semibold text-text">
          {t("changes.title", { count: changes.length })}
        </p>
        {changes.length > 0 && (
          <button
            type="button"
            onClick={resetChanges}
            className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium text-danger-text hover:bg-red-500/15"
          >
            {t("changes.resetAll")}
          </button>
        )}
      </div>

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
              {instructions[group.elementId] && (
                <p className="mt-1 text-[10px] text-dim">
                  {t("changes.instruction")}：{instructions[group.elementId]}
                </p>
              )}
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
    </section>
  );
}
