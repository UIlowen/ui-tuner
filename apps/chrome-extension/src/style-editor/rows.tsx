import { useState, type ReactNode } from "react";
import { formatCssValue, parseCssValue, rgbToHex } from "@ui-tuner/inspector";
import { useT } from "../i18n/use-t";
import { ChevronDownIcon, UndoIcon } from "../ui/icons";
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

/** Whether the property has been modified in the current card session. */
export function useIsDirty(property: string | readonly string[]): boolean {
  const { dirty } = useStyleEdit();
  return typeof property === "string"
    ? dirty.has(property)
    : property.some((name) => dirty.has(name));
}

/** Shared shell: label left, control right (Figma-style density, §48). */
export function Row({
  label,
  children,
  changed = false,
  dirty = false,
  onReset,
}: {
  label: string;
  children: ReactNode;
  changed?: boolean;
  dirty?: boolean;
  onReset?: () => void;
}) {
  const t = useT();
  const resetLabel = t("changes.revertProperty", { property: label });
  return (
    <div
      {...(changed ? { "data-changed": "true", title: t("style.changed") } : {})}
      className={`flex min-h-6 items-center gap-1 rounded-[3px] py-0.5 px-1 transition-all ${
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
      <div className="flex min-w-0 items-center justify-end gap-1">
        {children}
        {(changed || dirty) && onReset && (
          <button
            type="button"
            onClick={onReset}
            aria-label={resetLabel}
            title={resetLabel}
            className="grid size-5 shrink-0 place-items-center rounded-pill text-faint transition-colors hover:bg-control hover:text-danger-text"
          >
            <UndoIcon className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export function GroupHeader({ title, icon }: { title: string; icon?: ReactNode }) {
  return (
    <p className="mt-4 flex items-center gap-1.5 border-t border-edge pt-2.5 text-[10px] font-medium tracking-wider text-faint uppercase first:mt-0 first:border-t-0 first:pt-0">
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
  const { values, updateStyle, revertStyle } = useStyleEdit();
  const isChanged = useIsChanged(property);
  const isDirty = useIsDirty(property);
  const raw = values[property] ?? "";
  const parsed = parseCssValue(raw);

  if (raw === "" || !parsed) {
    return <TextRow property={property} label={label} placeholder={raw || "—"} />;
  }

  const unit = parsed.unit === "" && fallbackUnit !== "" ? "" : parsed.unit || fallbackUnit;

  return (
    <Row label={label} changed={isChanged} dirty={isDirty} onReset={() => revertStyle(property)}>
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
  const { values, updateStyle, revertStyle } = useStyleEdit();
  const isChanged = useIsChanged(property);
  const isDirty = useIsDirty(property);
  const value = values[property] ?? "";

  return (
    <Row label={label} changed={isChanged} dirty={isDirty} onReset={() => revertStyle(property)}>
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
        className="h-6 min-w-[120px] truncate rounded-control border border-edge bg-inset px-1.5 font-mono text-[11px] text-text-strong outline-none placeholder:text-ghost transition-colors hover:bg-control focus:bg-control focus:ring-2 focus:ring-accent-text/70"
      />
    </Row>
  );
}

/** Color value: swatch (native color input) + hex text. */
export function ColorRow({ property, label }: { property: string; label: string }) {
  const t = useT();
  const { values, updateStyle, revertStyle } = useStyleEdit();
  const isChanged = useIsChanged(property);
  const isDirty = useIsDirty(property);
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
    <Row label={label} changed={isChanged} dirty={isDirty} onReset={() => revertStyle(property)}>
      <div className="flex h-6 min-w-[140px] items-center gap-1.5 rounded-control border border-edge bg-inset px-1.5">
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
          className="size-4 shrink-0 cursor-pointer rounded-[3px] border border-edge-strong bg-transparent p-0 transition-shadow hover:ring-1 hover:ring-accent-text/40 focus:ring-2 focus:ring-accent-text/70"
        />
        <span className="truncate font-mono text-[10px] text-text">{raw}</span>
      </div>
    </Row>
  );
}

/**
 * One-of-N property value as a collapsed dropdown: the alternatives stay hidden
 * until the control is opened, so the row costs one line however many values the
 * property takes, and nothing is highlighted until the designer actually
 * adjusts it (the option buttons this replaced ringed the current value in the
 * accent color permanently).
 *
 * The page's computed value may not be on the offered list (`display: inline`,
 * `text-align: start`, `font-weight: 300`). A `<select>` whose value matches no
 * option silently shows its first one, which would state a value the element
 * does not have — so the current value is prepended when it is missing.
 */
export function SelectRow({
  property,
  label,
  options,
}: {
  property: string;
  label: string;
  options: { value: string; label: string }[];
}) {
  const { values, updateStyle, revertStyle } = useStyleEdit();
  const isChanged = useIsChanged(property);
  const isDirty = useIsDirty(property);
  const raw = values[property] ?? "";
  const offered = options.some((option) => option.value === raw)
    ? options
    : [{ value: raw, label: raw === "" ? "—" : raw }, ...options];

  return (
    <Row label={label} changed={isChanged} dirty={isDirty} onReset={() => revertStyle(property)}>
      <div className="relative flex h-6 min-w-[120px] items-center rounded-control border border-edge bg-inset">
        <select
          value={raw}
          aria-label={label}
          onChange={(event) => {
            if (event.target.value !== raw) void updateStyle(property, event.target.value, true);
          }}
          className="h-6 w-full appearance-none rounded-control bg-transparent pr-5 pl-1.5 font-mono text-[10px] text-text-strong outline-none transition-colors hover:bg-control focus:bg-control focus:ring-2 focus:ring-accent-text/70"
        >
          {offered.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {/* The native arrow is gone with appearance-none; this is the affordance. */}
        <ChevronDownIcon className="pointer-events-none absolute right-1 size-3 text-faint" />
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
