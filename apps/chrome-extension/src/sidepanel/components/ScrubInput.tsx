import { useCallback, useEffect, useRef, useState } from "react";
import { clamp, formatNumber, parseCssValue, scrubMultiplier } from "@ui-tuner/inspector";

/**
 * ScrubInput (plan §10, P0): drag to scrub a numeric CSS value.
 *
 *   drag ±1 · Shift+drag ±10 · Option+drag ±0.1 (scaled by `step`)
 *   ↑/↓ ±step · Shift+↑↓ ×10 · double-click → type an exact value
 *
 * Drag frames fire `onPreview` only (rAF-throttled, no React re-render — the
 * label is written to the DOM directly); releasing fires `onCommit`.
 */
export interface ScrubInputProps {
  value: number;
  min?: number;
  max?: number;
  /** Value delta per pixel of drag. Default 1. */
  step?: number;
  /** Unit suffix shown next to the number ("" for unitless). */
  unit?: string;
  onPreview(value: number): void;
  onCommit(value: number): void;
}

export function ScrubInput({
  value,
  min,
  max,
  step = 1,
  unit = "",
  onPreview,
  onCommit,
}: ScrubInputProps) {
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [draft, setDraft] = useState("");

  const displayRef = useRef<HTMLSpanElement>(null);
  const dragStart = useRef<{ x: number; value: number } | null>(null);
  const currentValue = useRef(value);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    const multiplier = scrubMultiplier({ shift: event.shiftKey, alt: event.altKey });
    const next = clamp(start.value + (event.clientX - start.x) * step * multiplier, min, max);
    applyDragValue(next);
    flushPreview(next);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    dragStart.current = null;
    setDragging(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // Commit BEFORE releasing capture, and guard the release:
    // releasePointerCapture throws NotFoundError when the pointer was already
    // implicitly released — that must never swallow the commit.
    commit(clamp(currentValue.current, min, max));
    pendingRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer already released — safe to ignore.
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (editing) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const direction = event.key === "ArrowUp" ? 1 : -1;
    const multiplier = event.shiftKey ? 10 : 1;
    commit(clamp(currentValue.current + direction * step * multiplier, min, max));
  };

  const startEditing = () => {
    setDraft(`${formatNumber(currentValue.current)}${unit}`);
    setEditing(true);
  };

  const finishEditing = () => {
    setEditing(false);
    const parsed =
      parseCssValue(draft) ??
      (Number.isFinite(Number(draft)) ? { value: Number(draft), unit: "" } : null);
    if (parsed) commit(clamp(parsed.value, min, max));
  };

  if (editing) {
    return (
      <input
        ref={(node) => {
          inputRef.current = node;
          if (node) node.select();
        }}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") finishEditing();
          else if (event.key === "Escape") setEditing(false);
        }}
        onBlur={finishEditing}
        className="h-6 w-full rounded bg-zinc-950 px-1.5 font-mono text-[11px] text-zinc-100 outline-none ring-1 ring-violet-500/70"
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
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      onDoubleClick={startEditing}
      title="拖动调整 · Shift ×10 · Option ×0.1 · 双击输入"
      className={`flex h-6 min-w-0 flex-1 cursor-ew-resize items-center justify-end gap-0.5 rounded px-1.5 font-mono text-[11px] text-zinc-200 outline-none select-none ${
        dragging
          ? "bg-violet-500/20 ring-1 ring-violet-500/70"
          : "bg-zinc-800/70 hover:bg-zinc-700/70 focus-visible:bg-zinc-700/70 focus-visible:ring-1 focus-visible:ring-zinc-500"
      }`}
      style={{ touchAction: "none" }}
    >
      <span ref={displayRef} className="truncate tabular-nums">
        {formatNumber(value)}
      </span>
      {unit !== "" && <span className="text-[10px] text-zinc-500">{unit}</span>}
    </div>
  );
}
