import { useCallback, useEffect, useRef, useState } from "react";
import { clamp, formatNumber, parseCssValue, scrubMultiplier } from "@ui-tuner/inspector";
import { useT } from "../i18n/use-t";

/** Round `value` to the nearest `step`, trimming float artifacts via toFixed. */
function snapToStep(value: number, step: number): number {
  const decimals = Math.max(0, Math.round(-Math.log10(step)));
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

/**
 * ScrubInput (plan §10, P0): drag to scrub a numeric CSS value.
 *
 *   drag ±1 · Shift+drag ±10 · Option+drag ±0.1 (scaled by `step`)
 *   ↑/↓ ±step · Shift+↑↓ ×10 · double-click → type an exact value
 *
 * Drag frames fire `onPreview` only (rAF-throttled, no React re-render — the
 * label is written to the DOM directly); releasing fires `onCommit`. The drag
 * also reports `onDragStart`/`onDragEnd` so the surrounding card can collapse
 * to this row alone (Codex behavior: everything else fades away mid-scrub).
 */
export interface ScrubInputProps {
  value: number;
  min?: number;
  max?: number;
  /** Value delta per pixel of drag. Default 1. */
  step?: number;
  /** Unit suffix shown next to the number ("" for unitless). */
  unit?: string;
  /** CSS property being scrubbed. Stamped as `data-scrub-property` on the
   *  slider root so a locked sibling's drag can live-update this control's
   *  displayed number (preview frames deliberately skip the React snapshot). */
  property?: string;
  onPreview(value: number): void;
  onCommit(value: number): void;
  /** Pointer pressed on the control — the card hides every other row. */
  onDragStart?(): void;
  /** Pointer released (drag committed or cancelled) — the card restores. */
  onDragEnd?(): void;
}

export function ScrubInput({
  value,
  min,
  max,
  step = 1,
  unit = "",
  property,
  onPreview,
  onCommit,
  onDragStart,
  onDragEnd,
}: ScrubInputProps) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [draft, setDraft] = useState("");

  const displayRef = useRef<HTMLSpanElement>(null);
  const dragStart = useRef<{ x: number; value: number } | null>(null);
  const currentValue = useRef(value);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** The edit-mode ref callback runs on EVERY render (inline function), so the
   *  "select all on focus" must be gated — otherwise each typed character
   *  re-selects the whole draft and the next keystroke replaces it, making it
   *  impossible to type past a couple of digits. */
  const didAutoSelect = useRef(false);

  // Sync the live ref from the prop only while idle. During a drag (or text
  // edit) the ref holds the live value and must NOT be reset by a re-render
  // carrying the stale prop — preview frames never update the store, so `value`
  // lags behind the drag, and resetting here would make pointerUp commit the
  // ORIGINAL value (the page snaps back / a no-op change is recorded).
  useEffect(() => {
    if (!dragging && !editing) currentValue.current = value;
  }, [value, dragging, editing]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const flushPreview = useCallback(
    (next: number) => {
      pendingRef.current = next;
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const pending = pendingRef.current;
        if (pending !== null) onPreview(pending);
      });
    },
    [onPreview],
  );

  const applyDragValue = useCallback((next: number) => {
    currentValue.current = next;
    if (displayRef.current) displayRef.current.textContent = formatNumber(next);
  }, []);

  const commit = useCallback(
    (next: number) => {
      applyDragValue(next);
      onCommit(next);
    },
    [applyDragValue, onCommit],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (editing || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { x: event.clientX, value: currentValue.current };
    setDragging(true);
    onDragStart?.();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    const multiplier = scrubMultiplier({ shift: event.shiftKey, alt: event.altKey });
    const raw = start.value + (event.clientX - start.x) * step * multiplier;
    const snapped = snapToStep(raw, step);
    const next = clamp(snapped, min, max);
    applyDragValue(next);
    flushPreview(next);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const startValue = dragStart.current.value;
    dragStart.current = null;
    setDragging(false);
    onDragEnd?.();
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const next = clamp(currentValue.current, min, max);
    pendingRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer already released — safe to ignore.
    }
    // A click without movement must not count as a change.
    if (next === startValue) return;
    commit(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (editing) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const direction = event.key === "ArrowUp" ? 1 : -1;
    const multiplier = event.shiftKey ? 10 : 1;
    const next = clamp(snapToStep(currentValue.current + direction * step * multiplier, step), min, max);
    if (next === currentValue.current) return;
    commit(next);
  };

  const startEditing = () => {
    didAutoSelect.current = false;
    setDraft(`${formatNumber(currentValue.current)}${unit}`);
    setEditing(true);
  };

  const finishEditing = () => {
    setEditing(false);
    const parsed =
      parseCssValue(draft) ??
      (Number.isFinite(Number(draft)) ? { value: Number(draft), unit: "" } : null);
    if (!parsed) return;
    const next = clamp(parsed.value, min, max);
    if (next === currentValue.current) return;
    commit(next);
  };

  if (editing) {
    return (
      <input
        ref={(node) => {
          inputRef.current = node;
          if (node && !didAutoSelect.current) {
            didAutoSelect.current = true;
            node.select();
          }
        }}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") finishEditing();
          else if (event.key === "Escape") setEditing(false);
        }}
        onBlur={finishEditing}
        className="ut-font-value h-[30px] w-full rounded-[8px] bg-transparent px-3 text-[12px] text-text-strong ring-1 ring-accent-text/60 outline-none"
      />
    );
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-valuenow={currentValue.current}
      aria-valuemin={min}
      aria-valuemax={max}
      data-scrub-property={property}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      onDoubleClick={startEditing}
      title={t("scrub.hint")}
      className={`ut-font-value flex h-[30px] w-[108px] min-w-0 items-center justify-between rounded-[8px] border px-3 text-[12px] outline-none select-none transition-colors ${
        dragging
          ? "cursor-ew-resize border-accent-text/50 bg-accent-text/15 text-text-strong ring-1 ring-accent-text/60"
          : // `focus:` not `focus-visible:` — a scrub field is a div, and Chrome
            // never matches :focus-visible for a mouse click on one, so the
            // control the designer just grabbed would stay unhighlighted.
            "cursor-ew-resize border-edge bg-transparent text-text-strong hover:bg-control focus:bg-control focus:ring-1 focus:ring-accent-text/60"
      }`}
      style={{ touchAction: "none" }}
    >
      <span ref={displayRef} className="truncate tabular-nums">
        {formatNumber(value)}
      </span>
      {unit !== "" && <span className="shrink-0 text-dim">{unit}</span>}
    </div>
  );
}
