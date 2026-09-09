import { useRef, useState, type ReactNode } from "react";
import { formatCssValue, formatNumber, parseCssValue, rgbToHex, extractAlpha, formatColorWithAlpha, colorKey } from "@ui-tuner/inspector";
import { useT } from "../i18n/use-t";
import { ChevronDownFillIcon, RotateCcwIcon } from "../ui/icons";
import { ScrubInput } from "./ScrubInput";
import { useStyleEdit } from "./StyleEditContext";

/**
 * Property rows for the Style tab (plan §9), restyled to the Figma card design
 * (180:824): 30px rows, label left (PingFang Medium 12px, white 80% dark) and
 * the control right (h-30, 1px white-10% border, 8px radius, Inter 12px).
 * Every row reads the current `values` snapshot from the surrounding
 * StyleEditContext and calls its `updateStyle`; preview (scrub) frames go out
 * with `committed: false` so the context's snapshot is untouched and dragging
 * never re-renders the panel.
 *
 * Rows also read the context's `changed` set: a property an earlier step
 * already modified is tinted and flagged, so reopening a card (e.g. from its
 * bubble) shows what changed instead of a wall of identical-looking rows.
 */

/** Control shell shared by every field: 30px tall, 8px radius, 1px edge border. */
const FIELD =
  "h-[30px] shrink-0 rounded-[8px] border border-edge bg-transparent transition-colors";
/** Focus treatment for interactive fields (ring only, the border stays 1px). */
const FIELD_FOCUS =
  "focus-within:bg-control focus-within:ring-1 focus-within:ring-accent-text/60";

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

/**
 * Scrub-collapse state for one row: while a ScrubInput is being dragged the
 * card collapses to just that row (Codex style) — every other row stays
 * mounted but invisible, and the scrubbed row renders as a floating bar over
 * the now-transparent card shell.
 *
 * A LOCKED pair is the exception: dragging one side moves the other on the
 * page, so the linked sibling stays visible as a second floating bar (and its
 * number follows live — see writeLinkedDisplay in ScrubField).
 */
function useScrubRow(property: string, sync?: PairSync): { scrubHidden: boolean; scrubActive: boolean } {
  const { scrubbing, linked } = useStyleEdit();
  const linkedSibling =
    scrubbing !== null &&
    sync !== undefined &&
    linked.has(sync.pairKey) &&
    scrubbing === sync.sibling;
  return {
    scrubHidden: scrubbing !== null && scrubbing !== property && !linkedSibling,
    scrubActive: scrubbing === property || linkedSibling,
  };
}

/** Shared shell: label left, control right (Figma card design, 180:824). */
export function Row({
  label,
  children,
  changed = false,
  dirty = false,
  onReset,
  scrubHidden = false,
  scrubActive = false,
}: {
  label: string;
  children: ReactNode;
  changed?: boolean;
  dirty?: boolean;
  onReset?: () => void;
  /** Another row is being scrubbed — this row stays mounted but invisible. */
  scrubHidden?: boolean;
  /** This row is being scrubbed — render it as a floating bar (the card shell
   *  around it goes transparent). */
  scrubActive?: boolean;
}) {
  const t = useT();
  const resetLabel = t("changes.revertProperty", { property: label });
  return (
    <div
      {...(changed ? { "data-changed": "true", title: t("style.changed") } : {})}
      className={`flex w-full min-h-[30px] items-center justify-between gap-2 rounded-[3px] transition-all ${
        changed ? "-ml-[2px] border-l-2 border-accent-text bg-accent-text/10 pl-1" : ""
      }${scrubHidden ? " invisible" : ""}${
        scrubActive ? " relative z-10 rounded-[8px] border border-edge bg-surface-solid px-2 shadow-xl" : ""
      }`}
    >
      <span
        className={`ut-font-label shrink-0 truncate text-[12px] ${
          changed ? "text-accent-text" : "text-text"
        }`}
        title={label}
      >
        {label}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        {/* Reset sits immediately left of the control. */}
        {dirty && onReset && (
          <button
            type="button"
            onClick={onReset}
            aria-label={resetLabel}
            title={resetLabel}
            className="grid size-5 shrink-0 place-items-center rounded-pill text-dim transition-colors hover:bg-control hover:text-danger-text"
          >
            <RotateCcwIcon className="size-3" />
          </button>
        )}
        {children}
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
 * How a linked pair couples its two properties:
 *
 *   ratio — the sibling scales by the pair's aspect ratio (width/height lock)
 *   equal — the sibling takes the same value (padding/margin top/bottom, left/right)
 */
export interface PairSync {
  pairKey: string;
  sibling: string;
  mode: "ratio" | "equal";
}

/**
 * Numeric CSS value. Scrubs when the current value parses as
 * number+unit (keeping that unit); keywords like `auto` fall back to a text
 * input that accepts any CSS value.
 *
 * When `sync` is given and the pair is locked in the context, every preview
 * and commit frame also rewrites the sibling property, so the lock is a real
 * coupling (the page shows both sides moving) and not just an icon.
 */
export function ScrubField({
  property,
  label,
  step = 1,
  fallbackUnit = "px",
  min,
  max,
  sync,
}: {
  property: string;
  label: string;
  step?: number;
  fallbackUnit?: string;
  min?: number;
  max?: number;
  sync?: PairSync;
}) {
  const { values, updateStyle, revertStyle, setScrubbing, linked } = useStyleEdit();
  const isChanged = useIsChanged(property);
  const isDirty = useIsDirty(property);
  const { scrubHidden, scrubActive } = useScrubRow(property, sync);
  /** Anchor inside the card's tree, used to find the linked row's display node
   *  without hardcoding the shadow host's id (works in jsdom tests too). */
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const raw = values[property] ?? "";
  const parsed = parseCssValue(raw);

  if (raw === "" || !parsed) {
    return <TextRow property={property} label={label} placeholder={raw || "—"} />;
  }

  const unit = parsed.unit === "" && fallbackUnit !== "" ? "" : parsed.unit || fallbackUnit;
  const isLinked = sync !== undefined && linked.has(sync.pairKey);
  // The values snapshot only advances on commit, so mid-drag these still hold
  // the drag-START values — exactly what a stable aspect ratio needs.
  const siblingParsed = sync ? parseCssValue(values[sync.sibling] ?? "") : null;

  /** Preview frames never touch the values snapshot (dragging must not
   *  re-render the panel), so the linked row's number is written to its DOM
   *  node directly — the same pattern ScrubInput uses for its own label. */
  const writeLinkedDisplay = (sibling: string, value: number) => {
    const rootNode = anchorRef.current?.getRootNode();
    if (!(rootNode instanceof Document || rootNode instanceof ShadowRoot)) return;
    const span = rootNode.querySelector(`[data-scrub-property="${sibling}"] > span`);
    if (span) span.textContent = formatNumber(value);
  };

  const apply = (value: number, committed: boolean) => {
    void updateStyle(property, formatCssValue(value, unit), committed);
    if (!isLinked || !sync) return;
    let siblingValue: number | null = null;
    let siblingUnit = unit;
    if (sync.mode === "equal") {
      siblingValue = value;
    } else if (siblingParsed && parsed.value !== 0) {
      // Round to 2 decimals so ratios like 1/3 don't leak float artifacts.
      siblingValue = Math.round(value * (siblingParsed.value / parsed.value) * 100) / 100;
      siblingUnit = siblingParsed.unit || fallbackUnit;
    }
    if (siblingValue === null) return;
    void updateStyle(sync.sibling, formatCssValue(siblingValue, siblingUnit), committed);
    if (!committed) writeLinkedDisplay(sync.sibling, siblingValue);
  };

  return (
    <Row
      label={label}
      changed={isChanged}
      dirty={isDirty}
      onReset={() => revertStyle(isLinked && sync ? [property, sync.sibling] : property)}
      scrubHidden={scrubHidden}
      scrubActive={scrubActive}
    >
      <span ref={anchorRef} className="contents">
        <ScrubInput
          property={property}
          value={parsed.value}
          unit={unit}
          step={step}
          min={min}
          max={max}
          onDragStart={() => setScrubbing(property)}
          onDragEnd={() => setScrubbing(null)}
          onPreview={(value) => apply(value, false)}
          onCommit={(value) => apply(value, true)}
        />
      </span>
    </Row>
  );
}

/** Free-form CSS value (font-family, box-shadow, keywords). Commit on Enter/blur. */
export function TextRow({
  property,
  label,
  placeholder,
  width = 214,
}: {
  property: string;
  label: string;
  placeholder?: string;
  /** Field width in px (Figma: 文本 row is 214). */
  width?: number;
}) {
  const { values, updateStyle, revertStyle } = useStyleEdit();
  const isChanged = useIsChanged(property);
  const isDirty = useIsDirty(property);
  const { scrubHidden } = useScrubRow(property);
  const value = values[property] ?? "";

  return (
    <Row label={label} changed={isChanged} dirty={isDirty} onReset={() => revertStyle(property)} scrubHidden={scrubHidden}>
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
        style={{ width }}
        className={`${FIELD} ut-font-value truncate px-3 text-[12px] text-text-strong outline-none placeholder:text-ghost hover:bg-control focus:bg-control focus:ring-1 focus:ring-accent-text/60`}
      />
    </Row>
  );
}

/**
 * Color value: one bordered field holding the swatch (native color input) and
 * the current CSS value as editable text (e.g. `rgb(255, 255, 255)`). The
 * native picker only produces opaque `#rrggbb`, so translucent colors are
 * edited by typing `rgba(…)` in the text; picking with the swatch keeps the
 * value's existing alpha. The field has a fixed width — the value notation
 * changes length while adjusting (`rgb()` ↔ `rgba()` ↔ `#hex`) and the row
 * layout must not shift mid-edit.
 */
export function ColorRow({ property, label }: { property: string; label: string }) {
  const t = useT();
  const { values, updateStyle, revertStyle } = useStyleEdit();
  const isChanged = useIsChanged(property);
  const isDirty = useIsDirty(property);
  const { scrubHidden } = useScrubRow(property);
  const raw = values[property] ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? raw;

  const commit = (value: string) => {
    void updateStyle(property, value, true);
    setDraft(null);
  };

  return (
    <Row label={label} changed={isChanged} dirty={isDirty} onReset={() => revertStyle(property)} scrubHidden={scrubHidden}>
      <div className={`${FIELD} ${FIELD_FOCUS} flex w-[182px] items-center gap-[7px] px-3`}>
        <input
          type="color"
          value={rgbToHex(shown) ?? rgbToHex(raw) ?? "#000000"}
          onChange={(event) => {
            const next = formatColorWithAlpha(event.target.value, extractAlpha(shown || raw));
            setDraft(next);
            void updateStyle(property, next, false);
          }}
          onBlur={(event) => {
            commit(formatColorWithAlpha(event.target.value, extractAlpha(shown || raw)));
          }}
          title={t("color.rowTitle", { label, raw })}
          className="size-4 shrink-0 cursor-pointer rounded-[6px] border border-edge-strong bg-transparent p-0 transition-shadow hover:ring-1 hover:ring-accent-text/40"
        />
        <input
          value={shown}
          aria-label={label}
          placeholder="—"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          }}
          onBlur={(event) => {
            const value = event.target.value.trim();
            if (colorKey(value) === null || colorKey(value) === colorKey(raw)) {
              setDraft(null);
            } else {
              commit(value);
            }
          }}
          className="ut-font-value h-full min-w-0 flex-1 bg-transparent text-[12px] text-text-strong outline-none placeholder:text-ghost"
        />
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
  width = 170,
}: {
  property: string;
  label: string;
  options: { value: string; label: string }[];
  /** Field width in px (Figma: 字体 152 / 字重 108 / 布局行 170). */
  width?: number;
}) {
  const { values, updateStyle, revertStyle } = useStyleEdit();
  const isChanged = useIsChanged(property);
  const isDirty = useIsDirty(property);
  const { scrubHidden } = useScrubRow(property);
  const raw = values[property] ?? "";
  const offered = options.some((option) => option.value === raw)
    ? options
    : [{ value: raw, label: raw === "" ? "—" : raw }, ...options];

  return (
    <Row label={label} changed={isChanged} dirty={isDirty} onReset={() => revertStyle(property)} scrubHidden={scrubHidden}>
      <div style={{ width }} className={`${FIELD} relative flex items-center`}>
        <select
          value={raw}
          aria-label={label}
          onChange={(event) => {
            if (event.target.value !== raw) void updateStyle(property, event.target.value, true);
          }}
          className="ut-font-value h-full w-full appearance-none rounded-[8px] bg-transparent pr-6 pl-3 text-[12px] text-text-strong outline-none transition-colors hover:bg-control focus:bg-control focus:ring-1 focus:ring-accent-text/60"
        >
          {offered.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {/* The native arrow is gone with appearance-none; this is the affordance. */}
        <ChevronDownFillIcon className="pointer-events-none absolute right-0 size-6 text-text-strong opacity-30" />
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
