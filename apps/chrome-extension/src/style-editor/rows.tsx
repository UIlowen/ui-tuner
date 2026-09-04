import { useState, type ReactNode } from "react";
import { formatCssValue, parseCssValue, rgbToHex } from "@ui-tuner/inspector";
import { useT } from "../i18n/use-t";
import { ScrubInput } from "./ScrubInput";
import { useStyleEdit } from "./StyleEditContext";

/**
 * Property rows for the Style tab (plan §9). Every row reads the current
 * `values` snapshot from the surrounding StyleEditContext and calls its
 * `updateStyle`; preview (scrub) frames go out with `committed: false` so the
 * context's snapshot is untouched and dragging never re-renders the panel.
 *
 * Rows also read the context's `changed` set: a property an earlier step
 * already modified is tinted and flagged, so reopening a card (e.g. from its
 * bubble) shows what changed instead of a wall of identical-looking rows.
 */

/**
 * Whether an earlier step already changed this property. Composite controls
 * (spacing axes, the alignment grid) write several properties at once, so they
 * pass all of them and light up when any one of them changed.
 */
export function useIsChanged(property: string | readonly string[]): boolean {
  const { changed } = useStyleEdit();
  return typeof property === "string"
    ? changed.has(property)
    : property.some((name) => changed.has(name));
}

/** Shared shell: label left, control right (Figma-style density, §48). */
export function Row({
  label,
  children,
  changed = false,
}: {
  label: string;
  children: ReactNode;
  changed?: boolean;
}) {
  const t = useT();
  return (
    <div
      {...(changed ? { "data-changed": "true", title: t("style.changed") } : {})}
      className={`flex min-h-6 items-center gap-1.5 rounded-[3px] ${
        changed ? "-ml-[2px] border-l-2 border-accent-text bg-accent-text/10" : ""
      }`}
    >
      <span
        className={`w-[64px] shrink-0 truncate text-[11px] ${
          changed ? "font-medium text-accent-text" : "text-faint"
        }`}
        title={label}
      >
        {label}
      </span>
      <div className="flex min-w-0 flex-1 justify-end">{children}</div>
    </div>
  );
}

export function GroupHeader({ title, icon }: { title: string; icon?: ReactNode }) {
  return (
    <p className="mt-2.5 flex items-center gap-1.5 border-t border-edge pt-2 text-[10px] font-medium tracking-wider text-faint uppercase first:mt-0 first:border-t-0 first:pt-0">
      {icon && <span className="text-ghost">{icon}</span>}
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
  const { values, updateStyle } = useStyleEdit();
  const isChanged = useIsChanged(property);
  const raw = values[property] ?? "";
  const parsed = parseCssValue(raw);

  if (raw === "" || !parsed) {
    return <TextRow property={property} label={label} placeholder={raw || "—"} />;
  }

  const unit = parsed.unit === "" && fallbackUnit !== "" ? "" : parsed.unit || fallbackUnit;

  return (
    <Row label={label} changed={isChanged}>
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
  const { values, updateStyle } = useStyleEdit();
  const isChanged = useIsChanged(property);
  const value = values[property] ?? "";

  return (
    <Row label={label} changed={isChanged}>
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
        className="h-6 w-full truncate rounded-control bg-inset px-1.5 font-mono text-[11px] text-text-strong outline-none placeholder:text-ghost transition-colors hover:bg-control focus-visible:bg-control focus-visible:ring-1 focus-visible:ring-accent-text/50"
      />
    </Row>
  );
}

/** Color value: swatch (native color input) + hex text. */
export function ColorRow({ property, label }: { property: string; label: string }) {
  const t = useT();
  const { values, updateStyle } = useStyleEdit();
  const isChanged = useIsChanged(property);
  const raw = values[property] ?? "";
  const storeHex = rgbToHex(raw) ?? "#000000";
  // Live value while picking. Preview frames (`committed:false`) don't touch
  // the store, so `storeHex` lags behind the picker; binding the native input
  // straight to it would snap the swatch back to the original color on every
  // preview.changed re-render and commit the ORIGINAL value on blur. Track the
  // picked value locally (ScrubInput does the same via a ref) and commit it.
  const [draft, setDraft] = useState<string | null>(null);
  const hex = draft ?? storeHex;

  return (
    <Row label={label} changed={isChanged}>
      <div className="flex h-6 min-w-0 flex-1 items-center justify-end gap-1.5">
        <span className="truncate font-mono text-[10px] text-text">{raw}</span>
        <input
          type="color"
          value={hex}
          onChange={(event) => {
            setDraft(event.target.value);
            void updateStyle(property, event.target.value, false);
          }}
          onBlur={(event) => {
            void updateStyle(property, event.target.value, true);
            setDraft(null);
          }}
          title={t("color.rowTitle", { label, raw })}
          className="size-5 shrink-0 cursor-pointer rounded-[5px] border border-edge-strong bg-transparent p-0 transition-shadow hover:ring-1 hover:ring-accent-text/40"
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
  options: { value: string; label: string; title?: string; icon?: ReactNode }[];
}) {
  const { values, updateStyle } = useStyleEdit();
  const isChanged = useIsChanged(property);
  const raw = values[property] ?? "";

  return (
    <Row label={label} changed={isChanged}>
      <div className="flex min-w-0 gap-0.5 overflow-hidden rounded-control bg-inset p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.title ?? option.label}
            // An icon-only segment has no visible text, so its name and state
            // must be carried explicitly or it is invisible to a screen reader.
            aria-label={option.icon ? (option.title ?? option.label) : undefined}
            aria-pressed={raw === option.value}
            onClick={() => void updateStyle(property, option.value, true)}
            className={`flex min-w-0 flex-1 items-center justify-center rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap transition-colors ${
              raw === option.value
                ? "bg-elevated font-medium text-text-strong ring-1 ring-edge-strong"
                : "text-faint hover:bg-control hover:text-text"
            }`}
          >
            {option.icon ?? option.label}
          </button>
        ))}
      </div>
    </Row>
  );
}

/** Read-only value display (e.g. computed transform, background-image). */
export function ReadOnlyRow({ property, label }: { property: string; label: string }) {
  const { values } = useStyleEdit();
  const raw = values[property] ?? "";
  return (
    <Row label={label}>
      <span className="truncate font-mono text-[10px] text-ghost" title={raw}>
        {raw === "" ? "—" : raw}
      </span>
    </Row>
  );
}
