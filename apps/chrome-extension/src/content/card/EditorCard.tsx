import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../i18n/use-t";
import { StyleEditContext, type StyleEditApi } from "../../style-editor/StyleEditContext";
import { StylePanel } from "../../style-editor/StylePanel";
import { CheckFillIcon, MicFillIcon, MoveArrowsIcon, SlidersFillIcon } from "../../ui/icons";
import { appendUtterance, useVoiceDictation, type VoiceDictation } from "./speech";
import type { EditorCardProps } from "./types";

/**
 * Page-side editor card, restyled to the Figma design (180:759 / 180:824):
 *
 *   compact  — one row: ⠿ drag grip · sliders circle · instruction · mic · ✓
 *   expanded — header (sliders circle · instruction · mic · ✓), a purple
 *              element bar (tag name + drag grip — the whole bar drags),
 *              the property panel in six divider-separated groups, and a
 *              footer (取消 pill · mic · ✓)
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

/** Pseudo-property key for the element-text row (staged in the content layer,
 *  outside the CSS-only StagingEngine). */
export const TEXT_CONTENT_PROPERTY = "text-content";

/** 28px circular button, 4% white fill (Figma). Used for mic / ✓ / sliders. */
const CIRCLE_BTN =
  "grid size-7 shrink-0 place-items-center rounded-full transition-colors";

/**
 * Dictates the instruction (Web Speech API). Unsupported browsers keep the old
 * disabled "coming soon" affordance — the tooltip lives on a wrapper there
 * because a `disabled` button doesn't reliably receive hover for its own title.
 * While listening the circle flips red and pulses; an error surfaces as the tooltip.
 */
function MicButton({ voice }: { voice: VoiceDictation }) {
  const t = useT();
  if (!voice.supported) {
    const hint = t("card.micSoon");
    return (
      <span title={hint} className="shrink-0">
        <button
          type="button"
          disabled
          aria-label={hint}
          className={`${CIRCLE_BTN} cursor-not-allowed bg-inset text-text-strong opacity-80`}
        >
          <MicFillIcon className="size-[18px]" />
        </button>
      </span>
    );
  }
  const label = voice.errorKey
    ? t(voice.errorKey)
    : voice.listening
      ? t("card.micListening")
      : t("card.mic");
  return (
    <button
      type="button"
      onClick={voice.toggle}
      aria-label={label}
      aria-pressed={voice.listening}
      title={label}
      className={`${CIRCLE_BTN} ${
        voice.listening
          ? "animate-pulse bg-red-500/25 text-red-400"
          : "bg-inset text-text-strong hover:bg-control"
      }`}
    >
      <MicFillIcon className="size-[18px]" />
    </button>
  );
}

/** ✓ submit — white glyph on the 4% circle; dims when there is nothing to save. */
function SubmitButton({
  disabled,
  label,
  onSubmit,
}: {
  disabled: boolean;
  label: string;
  onSubmit(): void;
}) {
  return (
    <button
      type="button"
      onClick={onSubmit}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`${CIRCLE_BTN} bg-inset text-text-strong enabled:hover:bg-control disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <CheckFillIcon className="size-6" />
    </button>
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
      className={`${CIRCLE_BTN} bg-inset text-text-strong hover:bg-control`}
    >
      <SlidersFillIcon className="size-7" />
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
  // The element's text rides along as a pseudo-property so the existing
  // dirty/changed machinery (reset button, save enablement, row highlight)
  // works for it unchanged. `initialValues` is CSS-only, so the text baseline
  // is merged in here and every comparison goes through this map.
  const initialValues = useMemo<Record<string, string>>(() => {
    if (props.initialText === undefined) return props.initialValues;
    return { ...props.initialValues, [TEXT_CONTENT_PROPERTY]: props.initialText };
  }, [props.initialValues, props.initialText]);
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [instruction, setInstruction] = useState(props.initialInstruction);
  // Voice dictation feeds the instruction; interim text is rendered live but
  // only committed on a final result, so cancel drops it without touching text.
  const voice = useVoiceDictation(setInstruction);
  /** Properties edited in this card session. Used to enable the save button. */
  const [dirtySet, setDirtySet] = useState<Set<string>>(new Set());
  /** Properties the user has reset inside this session. They stop being highlighted. */
  const [reverted, setReverted] = useState<Set<string>>(new Set());
  /** Linked property pairs. The width/height aspect lock starts on (changing
   *  one scales the other); spacing pairs start unlocked — pairKeys are
   *  "width-height", "padding-top-bottom", "margin-left-right", … */
  const [linkedSet, setLinkedSet] = useState<Set<string>>(new Set(["width-height"]));
  /** Property currently being scrubbed. Non-null → the card shell goes
   *  transparent and every other row hides, leaving one floating bar. */
  const [scrubbing, setScrubbing] = useState<string | null>(null);

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
    linked: linkedSet,
    scrubbing,
    setScrubbing,
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
          if (value !== initialValues[property]) {
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
          const original = initialValues[p];
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
    toggleLinked: (pairKey) => {
      setLinkedSet((prev) => {
        const next = new Set(prev);
        if (next.has(pairKey)) {
          next.delete(pairKey);
        } else {
          next.add(pairKey);
        }
        return next;
      });
    },
  };

  const instructionDirty = instruction.trim() !== props.initialInstruction.trim();
  const canSave = dirtySet.size > 0 || instructionDirty;

  const submit = (): void => props.onSave(instruction);

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.stopPropagation();
      // Esc while dictating cancels the session first, not the card.
      if (voice.listening) {
        voice.cancel();
        return;
      }
      if (viewState === "expanded") {
        setViewState("compact");
      } else {
        props.onDismiss();
      }
    }
  };

  const tagName = props.tagName ?? "";

  const instructionInput = (
    <input
      value={voice.listening ? appendUtterance(instruction, voice.interim) : instruction}
      onChange={(event) => setInstruction(event.target.value)}
      // While listening the field shows the live transcript; typing then would
      // fight the recognizer, so it's read-only until the session ends.
      readOnly={voice.listening}
      onKeyDown={(event) => {
        if (event.key === "Enter") submit();
      }}
      placeholder={t("card.instructionPlaceholder")}
      aria-label={t("card.instructionPlaceholder")}
      className="ut-font-label h-7 min-w-0 flex-1 bg-transparent text-[12px] text-text-strong outline-none placeholder:text-ghost"
    />
  );

  if (viewState === "compact") {
    return (
      <div
        onKeyDown={handleKeyDown}
        className="flex w-[340px] items-center justify-between rounded-[13px] bg-surface-solid px-4 py-[9px] shadow-2xl ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
      >
        <div className="flex items-center gap-[9px]">
          <span
            data-drag-handle
            aria-label={t("card.dragHandle")}
            title={t("card.dragHandle")}
            className="grid size-6 shrink-0 cursor-grab place-items-center text-text-strong opacity-80 select-none"
          >
            <MoveArrowsIcon className="size-6" />
          </span>
          <div className="flex items-center gap-2">
            <PropertiesToggle
              open={false}
              label={t("card.expand")}
              onToggle={() => setViewState("expanded")}
            />
            {instructionInput}
          </div>
        </div>
        <div className="flex items-center gap-[10px]">
          <MicButton voice={voice} />
          <SubmitButton disabled={!canSave} label={t("card.submit")} onSubmit={submit} />
        </div>
      </div>
    );
  }

  return (
    <div
      onKeyDown={handleKeyDown}
      className={`flex w-[340px] flex-col overflow-hidden rounded-[13px] ${
        scrubbing !== null
          ? "bg-transparent shadow-none ring-0"
          : "bg-surface-solid shadow-2xl ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
      }`}
    >
      {/* Header + element bar stay mounted while scrubbing (layout stable)
          but invisible. */}
      <div className={`flex shrink-0 flex-col${scrubbing !== null ? " invisible" : ""}`}>
        <div className="flex items-center justify-between px-4 pt-[10px] pb-[11px]">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <PropertiesToggle
              open
              label={t("card.collapse")}
              onToggle={() => setViewState("compact")}
            />
            {instructionInput}
          </div>
        </div>
        <div
          data-drag-handle
          className="ut-element-bar flex cursor-grab items-center justify-between px-4 py-2 select-none"
          aria-label={t("card.dragHandle")}
          title={t("card.dragHandle")}
        >
          {tagName && (
            <span className="ut-font-label text-[12px] text-text-strong">{tagName}</span>
          )}
          <MoveArrowsIcon className="size-[14px] shrink-0 text-text-strong opacity-60" />
        </div>
      </div>

      {/* Body: six divider-separated property groups; the list scrolls and the
          first changed row is scrolled into view on mount. */}
      <div ref={bodyRef} className="max-h-[60vh] min-h-0 overflow-y-auto px-4 pt-[22px] pb-4">
        <StyleEditContext.Provider value={api}>
          <StylePanel />
        </StyleEditContext.Provider>
      </div>

      {/* Footer: 取消 pill on the left, mic + submit circles on the right. */}
      <footer className={`flex shrink-0 items-center justify-between border-t px-4 py-3${
        scrubbing !== null ? " invisible border-transparent" : " border-edge"
      }`}>
        <button
          type="button"
          onClick={() => props.onCancel()}
          className="ut-font-value flex h-7 items-center justify-center rounded-[18px] bg-inset px-[10px] text-[12px] text-text-strong transition-colors hover:bg-control"
        >
          {t("action.cancel")}
        </button>
        <div className="flex items-center gap-[10px]">
          <MicButton voice={voice} />
          <SubmitButton disabled={!canSave} label={t("card.save")} onSubmit={submit} />
        </div>
      </footer>
    </div>
  );
}
