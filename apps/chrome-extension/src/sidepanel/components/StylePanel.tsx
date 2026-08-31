import { useState } from "react";
import { formatCssValue, parseCssValue } from "@ui-tuner/inspector";
import { useSidepanelStore } from "../../state/sidepanel-store";
import { ScrubInput } from "./ScrubInput";
import { ColorRow, GroupHeader, ReadOnlyRow, ScrubField, SegmentRow, TextRow } from "./rows";

/**
 * Style tab (plan §9): Layout / Size / Spacing / Typography / Fill / Border /
 * Effects groups for the selected element.
 */
export function StylePanel() {
  const styleValues = useSidepanelStore((s) => s.styleValues);
  if (!styleValues) return null;

  const display = styleValues["display"] ?? "";
  const isFlex = display === "flex" || display === "inline-flex";
  const isGrid = display === "grid" || display === "inline-grid";

  return (
    <div className="space-y-0.5">
      <GroupHeader title="Layout" />
      <SegmentRow
        property="display"
        label="Display"
        options={[
          { value: "flex", label: "flex" },
          { value: "grid", label: "grid" },
          { value: "block", label: "block" },
          { value: "inline-block", label: "iblk" },
          { value: "none", label: "none" },
        ]}
      />
      {(isFlex || isGrid) && <ScrubField property="gap" label="Gap" step={1} />}
      {isFlex && (
        <>
          <SegmentRow
            property="flex-direction"
            label="Direction"
            options={[
              { value: "row", label: "row" },
              { value: "column", label: "col" },
            ]}
          />
          <AlignmentControl />
          <SegmentRow
            property="flex-wrap"
            label="Wrap"
            options={[
              { value: "nowrap", label: "no" },
              { value: "wrap", label: "wrap" },
            ]}
          />
        </>
      )}
      {isGrid && (
        <>
          <TextRow property="grid-template-columns" label="Columns" />
          <TextRow property="grid-template-rows" label="Rows" />
        </>
      )}

      <GroupHeader title="Size" />
      <ScrubField property="width" label="Width" />
      <ScrubField property="height" label="Height" />
      <ScrubField property="min-width" label="Min W" />
      <ScrubField property="min-height" label="Min H" />
      <ScrubField property="max-width" label="Max W" />
      <ScrubField property="max-height" label="Max H" />

      <GroupHeader title="Spacing" />
      <SpacingGroup kind="padding" title="Padding" />
      <SpacingGroup kind="margin" title="Margin" />

      <GroupHeader title="Typography" />
      <TextRow property="font-family" label="Family" placeholder="font stack" />
      <ScrubField property="font-size" label="Size" step={1} />
      <SegmentRow
        property="font-weight"
        label="Weight"
        options={[
          { value: "400", label: "400" },
          { value: "500", label: "500" },
          { value: "600", label: "600" },
          { value: "700", label: "700" },
        ]}
      />
      <ScrubField property="line-height" label="Line H" step={0.05} fallbackUnit="" />
      <ScrubField property="letter-spacing" label="Tracking" step={0.1} />
      <SegmentRow
        property="text-align"
        label="Align"
        options={[
          { value: "left", label: "L" },
          { value: "center", label: "C" },
          { value: "right", label: "R" },
          { value: "justify", label: "J" },
        ]}
      />
      <ColorRow property="color" label="Color" />

      <GroupHeader title="Fill" />
      <ColorRow property="background-color" label="Fill" />
      <ScrubField property="opacity" label="Opacity" step={0.01} fallbackUnit="" min={0} max={1} />
      <ReadOnlyRow property="background-image" label="Image" />

      <GroupHeader title="Border" />
      <ScrubField property="border-width" label="Width" />
      <ColorRow property="border-color" label="Color" />
      <ScrubField property="border-radius" label="Radius" />

      <GroupHeader title="Effects" />
      <TextRow property="box-shadow" label="Shadow" placeholder="none" />
      <ReadOnlyRow property="transform" label="Transform" />
    </div>
  );
}

/** 3×3 alignment control (plan §9.2): justify-content × align-items. */
const ALIGN_MAIN = ["start", "center", "end"] as const;
const ALIGN_CROSS = ["start", "center", "end"] as const;

function AlignmentControl() {
  const styleValues = useSidepanelStore((s) => s.styleValues);
  const updateStyle = useSidepanelStore((s) => s.updateStyle);
  const justify = styleValues?.["justify-content"] ?? "";
  const align = styleValues?.["align-items"] ?? "";

  return (
    <div className="flex min-h-6 items-center gap-2">
      <span className="w-[74px] shrink-0 text-[11px] text-zinc-400">Align</span>
      <div className="ml-auto grid size-[52px] grid-cols-3 overflow-hidden rounded border border-zinc-700/80">
        {ALIGN_CROSS.flatMap((cross) =>
          ALIGN_MAIN.map((main) => {
            const active = justify === main && align === cross;
            return (
              <button
                key={`${main}-${cross}`}
                type="button"
                title={`justify-content: ${main} · align-items: ${cross}`}
                onClick={() => {
                  void updateStyle("justify-content", main, true);
                  void updateStyle("align-items", cross, true);
                }}
                className={`grid place-items-center text-[9px] leading-none transition-colors ${
                  active
                    ? "bg-zinc-100 text-zinc-900"
                    : "bg-zinc-800/70 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
                }`}
              >
                <span
                  aria-hidden
                  className={`block size-[7px] rounded-[1px] ${
                    main === "start"
                      ? "justify-self-start"
                      : main === "end"
                        ? "justify-self-end"
                        : "justify-self-center"
                  } ${
                    cross === "start" ? "self-start" : cross === "end" ? "self-end" : "self-center"
                  }`}
                />
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}

/**
 * Padding / Margin (plan §9.4): Simple (Vertical / Horizontal) and Advanced
 * (T/R/B/L) modes. Simple writes both sides of the axis in one go.
 */
function SpacingGroup({ kind, title }: { kind: "padding" | "margin"; title: string }) {
  const styleValues = useSidepanelStore((s) => s.styleValues);
  const updateStyle = useSidepanelStore((s) => s.updateStyle);
  const [advanced, setAdvanced] = useState(false);

  const top = styleValues?.[`${kind}-top`] ?? "";
  const right = styleValues?.[`${kind}-right`] ?? "";
  const bottom = styleValues?.[`${kind}-bottom`] ?? "";
  const left = styleValues?.[`${kind}-left`] ?? "";

  const sidesEqual = top === bottom && left === right;
  const showAdvanced = advanced || !sidesEqual;
  const verticalRaw = top;
  const horizontalRaw = left;

  return (
    <>
      <div className="flex min-h-6 items-center gap-2">
        <span className="w-[74px] shrink-0 text-[11px] font-medium text-zinc-300">{title}</span>
        <button
          type="button"
          onClick={() => setAdvanced(!showAdvanced)}
          className="ml-auto rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          {showAdvanced ? "Simple" : "Advanced"}
        </button>
      </div>

      {showAdvanced ? (
        <>
          <ScrubField property={`${kind}-top`} label="Top" />
          <ScrubField property={`${kind}-right`} label="Right" />
          <ScrubField property={`${kind}-bottom`} label="Bottom" />
          <ScrubField property={`${kind}-left`} label="Left" />
        </>
      ) : (
        <>
          <AxisScrub
            label="Vertical"
            raw={verticalRaw}
            onPreview={(value) => {
              void updateStyle(`${kind}-top`, value, false);
              void updateStyle(`${kind}-bottom`, value, false);
            }}
            onCommit={(value) => {
              void updateStyle(`${kind}-top`, value, true);
              void updateStyle(`${kind}-bottom`, value, true);
            }}
          />
          <AxisScrub
            label="Horizontal"
            raw={horizontalRaw}
            onPreview={(value) => {
              void updateStyle(`${kind}-left`, value, false);
              void updateStyle(`${kind}-right`, value, false);
            }}
            onCommit={(value) => {
              void updateStyle(`${kind}-left`, value, true);
              void updateStyle(`${kind}-right`, value, true);
            }}
          />
        </>
      )}
    </>
  );
}

/** One axis in Simple spacing mode — scrubs two properties at once. */
function AxisScrub({
  label,
  raw,
  onPreview,
  onCommit,
}: {
  label: string;
  raw: string;
  onPreview(cssValue: string): void;
  onCommit(cssValue: string): void;
}) {
  const parsed = parseCssValue(raw);
  if (!parsed) {
    return (
      <div className="flex min-h-6 items-center gap-2">
        <span className="w-[74px] shrink-0 text-[11px] text-zinc-400">{label}</span>
        <span className="ml-auto truncate font-mono text-[10px] text-zinc-600">{raw || "—"}</span>
      </div>
    );
  }
  return (
    <div className="flex min-h-6 items-center gap-2">
      <span className="w-[74px] shrink-0 text-[11px] text-zinc-400">{label}</span>
      <div className="flex min-w-0 flex-1 justify-end">
        <ScrubInput
          value={parsed.value}
          unit={parsed.unit || "px"}
          step={1}
          onPreview={(value) => onPreview(formatCssValue(value, parsed.unit || "px"))}
          onCommit={(value) => onCommit(formatCssValue(value, parsed.unit || "px"))}
        />
      </div>
    </div>
  );
}
