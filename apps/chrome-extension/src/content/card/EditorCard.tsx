import { useState } from "react";
import { useT } from "../../i18n/use-t";
import { StyleEditContext, type StyleEditApi } from "../../style-editor/StyleEditContext";
import { StylePanel } from "../../style-editor/StylePanel";
import type { EditorCardProps } from "./types";

/**
 * Page-side editor card: header (drag handle + sequence badge + collapse
 * toggle), a 属性精调 / 自然语言 segmented toggle, the full StylePanel fed by
 * an internal StyleEditContext, a natural-language textarea, and a
 * 删除 / 取消 / 保存 footer.
 *
 * Dragging itself is the mount layer's job (Task 8 moves the card via
 * transform); the handle here is a visual affordance only.
 */
export function EditorCard(props: EditorCardProps) {
  const t = useT();
  const [mode, setMode] = useState<"properties" | "nl">("properties");
  const [collapsed, setCollapsed] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(props.initialValues);
  const [instruction, setInstruction] = useState(props.initialInstruction);
  const [dirtyProps, setDirtyProps] = useState(false);

  const api: StyleEditApi = {
    values,
    updateStyle: (property, value, committed) => {
      props.onStage(property, value, committed);
      if (committed) {
        setValues((v) => ({ ...v, [property]: value }));
        setDirtyProps(true);
      }
    },
  };

  const instructionDirty = instruction.trim() !== props.initialInstruction.trim();
  const canSave = dirtyProps || instructionDirty;

  const badge = props.number === null ? t("card.unsaved") : String(props.number);

  if (collapsed) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-edge bg-surface-solid px-2 py-1 shadow-lg">
        <span className="text-[10px] font-medium text-faint">{badge}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text">
          {props.tagName}
        </span>
        <button
          type="button"
          aria-label={t("card.expand")}
          onClick={() => setCollapsed(false)}
          className="rounded px-1.5 py-0.5 text-[10px] text-dim hover:bg-control"
        >
          ▾
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-[280px] flex-col overflow-hidden rounded-lg border border-edge bg-surface-solid shadow-lg">
      {/* Header: drag handle + tag + badge + collapse toggle */}
      <header className="flex shrink-0 items-center gap-1.5 border-b border-edge px-2 py-1.5">
        <span
          data-drag-handle
          aria-label={t("card.dragHandle")}
          title={t("card.dragHandle")}
          className="cursor-grab select-none px-0.5 text-[11px] leading-none text-ghost"
        >
          ⠿
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium text-text-strong">
          {props.tagName}
        </span>
        <span className="shrink-0 rounded-full bg-control px-1.5 py-0.5 text-[9px] font-medium leading-none text-dim">
          {badge}
        </span>
        <button
          type="button"
          aria-label={t("card.collapse")}
          onClick={() => setCollapsed(true)}
          className="shrink-0 rounded px-1 py-0.5 text-[10px] leading-none text-faint hover:bg-control hover:text-dim"
        >
          ▴
        </button>
      </header>

      {/* Mode toggle */}
      <div className="flex shrink-0 gap-1 border-b border-edge p-1.5">
        <button
          type="button"
          aria-pressed={mode === "properties"}
          onClick={() => setMode("properties")}
          className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
            mode === "properties"
              ? "bg-inverse text-inverse-text"
              : "bg-control text-dim hover:bg-control-hover"
          }`}
        >
          {t("card.properties")}
        </button>
        <button
          type="button"
          aria-pressed={mode === "nl"}
          onClick={() => setMode("nl")}
          className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
            mode === "nl"
              ? "bg-inverse text-inverse-text"
              : "bg-control text-dim hover:bg-control-hover"
          }`}
        >
          {t("card.naturalLanguage")}
        </button>
      </div>

      {/* Body */}
      <div className="max-h-[320px] min-h-0 overflow-y-auto px-2 py-1.5">
        {mode === "properties" ? (
          <StyleEditContext.Provider value={api}>
            <StylePanel />
          </StyleEditContext.Provider>
        ) : (
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={t("card.instructionPlaceholder")}
            rows={5}
            className="w-full resize-y rounded border border-edge bg-inset px-2 py-1.5 text-[12px] leading-relaxed text-text placeholder:text-ghost focus:border-edge-strong focus:outline-none"
          />
        )}
      </div>

      {/* Footer */}
      <footer className="flex shrink-0 items-center gap-1.5 border-t border-edge px-2 py-1.5">
        <button
          type="button"
          onClick={() => props.onDelete()}
          className="rounded border border-red-500/40 px-2 py-1 text-[11px] font-medium text-danger-text hover:bg-red-500/20"
        >
          {t("card.delete")}
        </button>
        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={() => props.onCancel()}
            className="rounded bg-control px-2.5 py-1 text-[11px] font-medium text-dim hover:bg-control-hover"
          >
            {t("action.cancel")}
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => props.onSave(instruction)}
            className="rounded bg-inverse px-2.5 py-1 text-[11px] font-semibold text-inverse-text enabled:hover:bg-inverse-hover disabled:opacity-40"
          >
            {t("card.save")}
          </button>
        </div>
      </footer>
    </div>
  );
}
