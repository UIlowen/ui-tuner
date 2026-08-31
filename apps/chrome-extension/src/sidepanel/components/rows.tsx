import type { ReactNode } from "react";
import { formatCssValue, parseCssValue, rgbToHex } from "@ui-tuner/inspector";
import { useSidepanelStore } from "../../state/sidepanel-store";
import { ScrubInput } from "./ScrubInput";

/**
 * Property rows for the Style tab (plan §9). Every row reads the committed
 * `styleValues` snapshot and dispatches `updateStyle`; scrub frames go out as
 * preview messages without touching the store, so dragging never re-renders
 * the panel.
 */

/** Shared shell: label left, control right (Figma-style density, §48). */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-6 items-center gap-2">
      <span className="w-[74px] shrink-0 truncate text-[11px] text-zinc-400" title={label}>
        {label}
      </span>
      <div className="flex min-w-0 flex-1 justify-end">{children}</div>
    </div>
  );
}

export function GroupHeader({ title }: { title: string }) {
  return (
    <p className="mt-3 border-t border-zinc-800 pt-2 text-[10px] font-medium tracking-wider text-zinc-500 uppercase first:mt-1 first:border-t-0 first:pt-0">
      {title}
    </p>
  );
}

/**
 * Numeric CSS value. Scrubs when the current value parses as
 * number+unit (keeping that unit); keywords like `auto` fall back to a text
 * input that accepts any CSS value.
 */
export function ScrubField({
  property,
  label,
  step = 1,
  fallbackUnit = "px",
  min,
  max,
}: {
  property: string;
  label: string;
  step?: number;
  fallbackUnit?: string;
  min?: number;
  max?: number;
}) {
  const raw = useSidepanelStore((s) => s.styleValues?.[property] ?? "");
  const updateStyle = useSidepanelStore((s) => s.updateStyle);
  const parsed = parseCssValue(raw);

  if (raw === "" || !parsed) {
    return <TextRow property={property} label={label} placeholder={raw || "—"} />;
  }

  const unit = parsed.unit === "" && fallbackUnit !== "" ? "" : parsed.unit || fallbackUnit;

  return (
    <Row label={label}>
      <ScrubInput
        value={parsed.value}
        unit={unit}
        step={step}
        min={min}
        max={max}
        onPreview={(value) => void updateStyle(property, formatCssValue(value, unit), false)}
        onCommit={(value) => void updateStyle(property, formatCssValue(value, unit), true)}
      />
    </Row>
  );
}

/** Free-form CSS value (font-family, box-shadow, keywords). Commit on Enter/blur. */
export function TextRow({
  property,
  label,
  placeholder,
}: {
  property: string;
  label: string;
  placeholder?: string;
}) {
  const value = useSidepanelStore((s) => s.styleValues?.[property] ?? "");
  const updateStyle = useSidepanelStore((s) => s.updateStyle);

  return (
    <Row label={label}>
      <input
        value={value}
        placeholder={placeholder ?? "—"}
        onChange={(event) => {
          // Typing is a sequence of committed values — simple and predictable.
          void updateStyle(property, event.target.value, true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
        className="h-6 w-full truncate rounded bg-zinc-800/70 px-1.5 font-mono text-[11px] text-zinc-200 outline-none placeholder:text-zinc-600 hover:bg-zinc-700/70 focus-visible:bg-zinc-700/70 focus-visible:ring-1 focus-visible:ring-zinc-500"
      />
    </Row>
  );
}

/** Color value: swatch (native color input) + hex text. */
export function ColorRow({ property, label }: { property: string; label: string }) {
  const raw = useSidepanelStore((s) => s.styleValues?.[property] ?? "");
  const updateStyle = useSidepanelStore((s) => s.updateStyle);
  const hex = rgbToHex(raw) ?? "#000000";

  return (
    <Row label={label}>
      <div className="flex h-6 min-w-0 flex-1 items-center justify-end gap-1">
        <span className="truncate font-mono text-[10px] text-zinc-500">{raw}</span>
        <input
          type="color"
          value={hex}
          onChange={(event) => void updateStyle(property, event.target.value, false)}
          onBlur={(event) => void updateStyle(property, event.target.value, true)}
          title={`${label}（${raw}）`}
          className="size-6 shrink-0 cursor-pointer rounded border border-zinc-700 bg-transparent p-0"
        />
      </div>
    </Row>
  );
}

export function SegmentRow({
  property,
  label,
  options,
}: {
  property: string;
  label: string;
  options: { value: string; label: string; title?: string }[];
}) {
  const raw = useSidepanelStore((s) => s.styleValues?.[property] ?? "");
  const updateStyle = useSidepanelStore((s) => s.updateStyle);

  return (
    <Row label={label}>
      <div className="flex min-w-0 overflow-hidden rounded bg-zinc-800/70">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.title ?? option.label}
            onClick={() => void updateStyle(property, option.value, true)}
            className={`min-w-0 flex-1 px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap transition-colors ${
              raw === option.value
                ? "bg-zinc-100 font-semibold text-zinc-900"
                : "text-zinc-400 hover:bg-zinc-700/70 hover:text-zinc-200"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </Row>
  );
}

/** Read-only value display (e.g. computed transform, background-image). */
export function ReadOnlyRow({ property, label }: { property: string; label: string }) {
  const raw = useSidepanelStore((s) => s.styleValues?.[property] ?? "");
  return (
    <Row label={label}>
      <span className="truncate font-mono text-[10px] text-zinc-500" title={raw}>
        {raw === "" ? "—" : raw}
      </span>
    </Row>
  );
}
