import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../i18n/use-t";
import { StyleEditContext, type StyleEditApi } from "../../style-editor/StyleEditContext";
import { StylePanel } from "../../style-editor/StylePanel";
import { CheckIcon, DragIcon, MicIcon, SlidersIcon, TrashIcon } from "../../ui/icons";
import type { EditorCardProps } from "./types";

/**
 * Page-side annotation card, aligned with Codex UI:
 *
 *   compact  — one row: handle · ⚙ · "how should this element change?" · mic · ✓
 *   expanded — ⚙ · instruction text · drag handle, element tag below,
 *              flat property list (no group headers), and a 删除 / 取消 / 保存 footer
 *
 * The opening state is derived from the element's existing annotation rather
 * than remembered: something already annotated (a bubble number, recorded
 * property changes, or a saved instruction) opens expanded so its changed rows
 * are visible and scrolled to; a freshly picked element opens compact, because
 * the common case there is one sentence.
 *
 * Dragging is the mount layer's job — it starts on whatever carries
 * `data-drag-handle`; the handles here are affordances only.
 */

/**
 * Speech input is deliberately not wired up yet. The button is rendered so the
 * affordance is discoverable, and the tooltip lives on a wrapper because a
 * `disabled` button does not reliably receive hover events for its own title.
 */
function MicButton({ hint }: { hint: string }) {
  return (
    <span title={hint} className="shrink-0">
      <button
        type="button"
        disabled
        aria-label={hint}
        className="grid size-7 cursor-not-allowed place-items-center rounded-pill text-ghost"
      >
        <MicIcon className="size-4" />
      </button>
    </span>
  );
}

/**
 * The one control that opens and closes the property panel — the compact row's
 * second item and the expanded header's first item.
 */
function PropertiesToggle({
  open,
  label,
  onToggle,
}: {
  open: boolean;
  label: string;
  onToggle(): void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-expanded={open}
      title={label}
      className={`grid size-7 shrink-0 place-items-center rounded-pill transition-colors ${
        open
          ? "bg-accent-text/15 text-accent-text hover:bg-accent-text/25"
          : "bg-inset text-dim hover:bg-control hover:text-text"
      }`}
    >
      <SlidersIcon className="size-4" />
    </button>
  );
}

export function EditorCard(props: EditorCardProps) {
  const t = useT();
  const annotated =
    props.number !== null ||
    props.changedProperties.length > 0 ||
    props.initialInstruction.trim() !== "";
  const [viewState, setViewState] = useState<"compact" | "expanded">(
    annotated ? "expanded" : "compact",
  );
  const [values, setValues] = useState<Record<string, string>>(props.initialValues);
  const [instruction, setInstruction] = useState(props.initialInstruction);
  /** Properties edited in this card session. Used to enable the save button. */
  const [dirtySet, setDirtySet] = useState<Set<string>>(new Set());
  /** Properties the user has reset inside this session. They stop being highlighted. */
  const [reverted, setReverted] = useState<Set<string>>(new Set());

  const changed = useMemo(() => {
    const set = new Set(props.changedProperties);
    for (const property of reverted) set.delete(property);
    return set;
  }, [props.changedProperties, reverted]);
  const dirty = useMemo(() => {
    const set = new Set(dirtySet);
    for (const property of reverted) set.delete(property);
    return set;
  }, [dirtySet, reverted]);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Bring the first changed row into view: the body scrolls, and a highlight
  // below the fold is no highlight at all.
  useEffect(() => {
    bodyRef.current?.querySelector('[data-changed="true"]')?.scrollIntoView({ block: "nearest" });
  }, []);

  const api: StyleEditApi = {
    values,
    changed,
    dirty,
    updateStyle: (property, value, committed) => {
      props.onStage(property, value, committed);
      if (committed) {
        setValues((v) => ({ ...v, [property]: value }));
        setReverted((prev) => {
          if (!prev.has(property)) return prev;
          const next = new Set(prev);
          next.delete(property);
          return next;
        });
        setDirtySet((prev) => {
          const next = new Set(prev);
          if (value !== props.initialValues[property]) {
            next.add(property);
          } else {
            next.delete(property);
          }
          return next;
        });
      }
    },
    revertStyle: (property) => {
      const properties = typeof property === "string" ? [property] : property;
      const nextValues = { ...values };
      const nextReverted = new Set(reverted);
      const nextDirty = new Set(dirtySet);
      let any = false;
      for (const p of properties) {
        if (nextReverted.has(p)) continue;
        const recorded = props.onRevert(p);
        if (recorded !== null) {
          nextValues[p] = recorded;
          nextDirty.add(p);
        } else if (nextDirty.has(p)) {
          const original = props.initialValues[p];
          if (original === undefined) continue;
          nextValues[p] = original;
          nextDirty.delete(p);
        } else {
          continue;
        }
        nextReverted.add(p);
        any = true;
      }
      if (any) {
        setValues(nextValues);
        setReverted(nextReverted);
        setDirtySet(nextDirty);
      }
    },
  };

  const instructionDirty = instruction.trim() !== props.initialInstruction.trim();
  const canSave = dirtySet.size > 0 || instructionDirty;

  const submit = (): void => props.onSave(instruction);

  const tagName = props.tagName ?? "";

  if (viewState === "compact") {
    return (
      <div className="flex w-[320px] items-center gap-1 rounded-card border border-edge bg-surface-solid py-2.5 px-2 shadow-2xl ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
        {props.number === null ? (
          <span
            data-drag-handle
            aria-label={t("card.dragHandle")}
            title={t("card.dragHandle")}
            className="grid h-7 w-7 shrink-0 cursor-grab place-items-center rounded-pill bg-inset text-dim transition-colors hover:bg-control hover:text-text select-none"
          >
            <DragIcon className="size-3.5" />
          </span>
        ) : (
          <span
            data-drag-handle
            title={t("card.dragHandle")}
            className="grid h-7 shrink-0 cursor-grab place-items-center rounded-pill bg-accent-text/15 px-1.5 text-[10px] font-semibold text-accent-text select-none"
          >
            {String(props.number)}
          </span>
        )}
        <PropertiesToggle
          open={false}
          label={t("card.expand")}
          onToggle={() => setViewState("expanded")}
        />
        <input
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
          placeholder={t("card.instructionPlaceholder")}
          aria-label={t("card.instructionPlaceholder")}
          className="h-7 min-w-0 flex-1 rounded-control bg-inset px-2 text-[12px] text-text-strong outline-none placeholder:text-ghost transition-colors hover:bg-control focus:bg-control focus:ring-1 focus:ring-accent-text/50"
        />
        <MicButton hint={t("card.micSoon")} />
        <button
          type="button"
          onClick={submit}
          disabled={!canSave}
          aria-label={t("card.submit")}
          title={t("card.submit")}
          className="grid size-7 shrink-0 place-items-center rounded-pill bg-inverse text-inverse-text transition-colors enabled:hover:bg-inverse-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CheckIcon className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-[320px] flex-col overflow-hidden rounded-card border border-edge bg-surface-solid shadow-2xl ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
      {/* Header: row 1 = ⚙ + instruction, row 2 = tag name + drag handle */}
      <div className="flex shrink-0 flex-col border-b border-edge">
        <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-0.5">
          <PropertiesToggle
            open
            label={t("card.collapse")}
            onToggle={() => setViewState("compact")}
          />
          {props.number !== null && (
            <span className="grid h-5 shrink-0 place-items-center rounded-pill bg-accent-text/15 px-1.5 text-[10px] font-semibold text-accent-text">
              {String(props.number)}
            </span>
          )}
          <input
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder={t("card.instructionPlaceholder")}
            aria-label={t("card.instructionPlaceholder")}
            className="h-7 min-w-0 flex-1 rounded-control bg-transparent px-1 text-[12px] font-medium text-text-strong outline-none placeholder:text-ghost"
          />
        </div>
        <div className="flex items-center gap-1.5 px-2 pb-1.5">
          {tagName && (
            <span className="text-[10px] font-medium uppercase tracking-wider text-faint">
              {tagName}
            </span>
          )}
          <span className="ml-auto" />
          <span
            data-drag-handle
            aria-label={t("card.dragHandle")}
            title={t("card.dragHandle")}
            className="grid h-7 w-7 shrink-0 cursor-grab place-items-center rounded-pill bg-inset text-dim select-none transition-colors hover:bg-control hover:text-text"
          >
            <DragIcon className="size-3.5" />
          </span>
        </div>
      </div>

      {/* Body: flat property list */}
      <div ref={bodyRef} className="max-h-[320px] min-h-0 overflow-y-auto px-3 py-3">
        <StyleEditContext.Provider value={api}>
          <StylePanel />
        </StyleEditContext.Provider>
      </div>

      {/* Footer */}
      <footer className="flex shrink-0 items-center gap-1 border-t border-edge px-2 py-1.5">
        <button
          type="button"
          onClick={() => props.onDelete()}
          aria-label={t("card.delete")}
          title={t("card.delete")}
          className="grid size-7 shrink-0 place-items-center rounded-control text-danger-text transition-colors hover:bg-red-500/15"
        >
          <TrashIcon className="size-4" />
        </button>
        <MicButton hint={t("card.micSoon")} />
        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={() => props.onCancel()}
            className="rounded-control bg-control px-2.5 py-1 text-[11px] font-medium text-dim transition-colors hover:bg-control-hover hover:text-text"
          >
            {t("action.cancel")}
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={submit}
            className="rounded-control bg-inverse px-2.5 py-1 text-[11px] font-semibold text-inverse-text transition-colors enabled:hover:bg-inverse-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("card.save")}
          </button>
        </div>
      </footer>
    </div>
  );
}
