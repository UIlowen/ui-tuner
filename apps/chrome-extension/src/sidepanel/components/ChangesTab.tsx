import { useSidepanelStore } from "../../state/sidepanel-store";
import { useT } from "../../i18n/use-t";
import { CursorIcon, RotateCcwIcon } from "../../ui/icons";

/**
 * Pick-mode toggle. Shared by the Preview tab's empty state (big, centered)
 * and the sticky footer (next to 复制改动). While picking it flips to the
 * sky "exit annotation mode" affordance.
 */
export function PickButton({ className = "" }: { className?: string }) {
  const t = useT();
  const picking = useSidepanelStore((s) => s.picking);
  const status = useSidepanelStore((s) => s.status);
  const setPicking = useSidepanelStore((s) => s.setPicking);
  return (
    <button
      type="button"
      onClick={() => setPicking(!picking)}
      disabled={status !== "connected"}
      // 断连时仍要可读：设计稿没有禁用变体，opacity-40 会把图标文字压成一团死灰。
      // 用 opacity-60 保持接近其它未选择按钮的亮度，cursor-not-allowed 仍示意不可点。
      className={`flex items-center justify-center gap-2 rounded-lg text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        picking
          ? "bg-info-text/30 text-info-text"
          : "bg-brand/12 text-text/90 hover:bg-brand hover:text-white"
      } ${className}`}
    >
      <CursorIcon className="size-4" />
      {picking ? t("pick.exit") : t("pick.start")}
    </button>
  );
}

/**
 * Preview tab: changes grouped per element, each card revertable as a whole
 * (还原), each property row individually (↺), and — when the element also has
 * property changes — its instruction line individually (↺). An instruction-
 * only card skips that per-line button because 还原 already covers it.
 *
 * The empty state is the design's 图1: centered hint + big pick button.
 */
export function ChangesTab() {
  const t = useT();
  const changes = useSidepanelStore((s) => s.changes);
  const elementNames = useSidepanelStore((s) => s.elementNames);
  const instructions = useSidepanelStore((s) => s.instructions);
  const revertChange = useSidepanelStore((s) => s.revertChange);
  const revertElement = useSidepanelStore((s) => s.revertElement);
  const revertInstruction = useSidepanelStore((s) => s.revertInstruction);
  const resetChanges = useSidepanelStore((s) => s.resetChanges);

  // Group changes by element, preserving first-seen order. Elements with a
  // saved instruction but zero property changes are first-class too — they
  // get a group with an empty change list plus the 指令 line.
  const groups: { elementId: string; tagName: string; changes: typeof changes }[] = [];
  const ensureGroup = (elementId: string) => {
    let group = groups.find((entry) => entry.elementId === elementId);
    if (!group) {
      group = {
        elementId,
        tagName: elementNames[elementId] ?? elementId.replace("ut-", ""),
        changes: [],
      };
      groups.push(group);
    }
    return group;
  };
  for (const change of changes) {
    ensureGroup(change.elementId).changes.push(change);
  }
  for (const elementId of Object.keys(instructions)) {
    if (instructions[elementId]?.trim()) ensureGroup(elementId);
  }

  // An instruction-only element is one item despite having no change rows; an
  // element with both is counted by its change rows alone (no double-count).
  const itemCount = changes.length + groups.filter((group) => group.changes.length === 0).length;

  if (groups.length === 0) {
    // 2:3 spacers put the content at ~40% height — 中偏上 (设计图1), not dead center.
    return (
      <div className="flex h-full flex-col items-center px-6">
        {/* 设计稿空态内容靠上（约主区 14%），不是垂直居中。 */}
        <div className="flex-[1]" />
        {/* 设计稿把提示限宽 w-228 + 居中 + 0.48px 字距 → 自然折成三行。 */}
        <p className="w-[228px] text-center text-[12px] leading-relaxed tracking-[0.48px] text-ghost">
          {t("changes.emptyHint")}
        </p>
        <PickButton className="mt-[26px] h-11 w-full" />
        <div className="flex-[5]" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center px-1">
        <p className="flex items-center gap-2 text-[14px] font-medium text-text">
          {t("tab.preview")}
          <span className="font-semibold text-live">{itemCount}</span>
        </p>
        <button
          type="button"
          onClick={resetChanges}
          className="ml-auto text-[12px] text-text transition-colors hover:text-brand-hover"
        >
          {t("changes.resetAll")}
        </button>
      </div>

      <div className="mt-3 space-y-4">
        {groups.map((group) => {
          const instruction = instructions[group.elementId];
          return (
            <div
              key={group.elementId}
              className="rounded-lg border border-card-edge bg-surface px-4 py-3 transition-colors hover:border-brand hover:bg-brand-soft/12"
            >
              <div className="flex items-center gap-4.5">
                <span className="font-mono text-[14px] font-semibold text-tag-text">
                  {"<"}{group.tagName}{">"}
                </span>
                <span className="font-mono text-[12px] text-text">{group.elementId}</span>
                <button
                  type="button"
                  onClick={() => revertElement(group.elementId)}
                  className="ml-auto shrink-0 text-[12px] text-text transition-colors hover:text-brand-hover"
                >
                  {t("changes.revertElement")}
                </button>
              </div>
              {instruction && (
                <p className="mt-3 flex items-center gap-1 text-[12px] text-text/80">
                  <span className="min-w-0 truncate">
                    {t("changes.instruction")}：{instruction}
                  </span>
                  {group.changes.length > 0 && (
                    <button
                      type="button"
                      title={t("changes.revertInstruction")}
                      aria-label={t("changes.revertInstruction")}
                      onClick={() => revertInstruction(group.elementId)}
                      className="ml-auto grid size-4 shrink-0 place-items-center text-faint transition-colors hover:text-brand-hover"
                    >
                      <RotateCcwIcon className="size-3" />
                    </button>
                  )}
                </p>
              )}
              <ul className="mt-2 space-y-1">
                {group.changes.map((change) => (
                  <li key={change.id} className="flex items-center gap-2 text-[12px]">
                    <span className="shrink-0 text-faint">{change.property}</span>
                    <span className="ml-auto min-w-0 truncate font-mono text-[12px]">
                      <span className="text-dim">{change.previousValue || "—"}</span>
                      <span className="text-dim">{" → "}</span>
                      <span className="text-value-new">{change.nextValue}</span>
                    </span>
                    <button
                      type="button"
                      title={t("changes.revertProperty", { property: change.property })}
                      aria-label={t("changes.revertProperty", { property: change.property })}
                      onClick={() => revertChange(change.id)}
                      className="grid size-4 shrink-0 place-items-center text-faint transition-colors hover:text-brand-hover"
                    >
                      <RotateCcwIcon className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
