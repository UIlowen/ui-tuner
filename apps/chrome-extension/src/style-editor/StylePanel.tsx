import { useState } from "react";
import { formatCssValue, parseCssValue } from "@ui-tuner/inspector";
import { useT } from "../i18n/use-t";
import { ScrubInput } from "./ScrubInput";
import { ColorRow, GroupHeader, ReadOnlyRow, ScrubField, SegmentRow, TextRow } from "./rows";
import { useStyleEdit } from "./StyleEditContext";

/**
 * Style tab (plan §9): Layout / Size / Spacing / Typography / Fill / Border /
 * Effects groups for the selected element.
 */
export function StylePanel() {
  const t = useT();
  const { values } = useStyleEdit();

  const display = values["display"] ?? "";
  const isFlex = display === "flex" || display === "inline-flex";
  const isGrid = display === "grid" || display === "inline-grid";

  return (
    <div className="space-y-0.5">
      <GroupHeader title={t("group.layout")} />
      <SegmentRow
        property="display"
        label={t("style.display")}
        options={[
          { value: "flex", label: "flex" },
          { value: "grid", label: "grid" },
          { value: "block", label: "block" },
          { value: "inline-block", label: "iblk" },
          { value: "none", label: "none" },
        ]}
      />
      {(isFlex || isGrid) && <ScrubField property="gap" label={t("style.gap")} step={1} />}
      {isFlex && (
        <>
          <SegmentRow
            property="flex-direction"
            label={t("style.direction")}
            options={[
              { value: "row", label: "row" },
              { value: "column", label: "col" },
            ]}
          />
          <AlignmentControl />
          <SegmentRow
            property="flex-wrap"
            label={t("style.wrap")}
            options={[
              { value: "nowrap", label: "no" },
              { value: "wrap", label: "wrap" },
            ]}
          />
        </>
      )}
      {isGrid && (
        <>
          <TextRow property="grid-template-columns" label={t("style.columns")} />
          <TextRow property="grid-template-rows" label={t("style.rows")} />
        </>
      )}

      <GroupHeader title={t("group.size")} />
      <ScrubField property="width" label={t("style.width")} />
      <ScrubField property="height" label={t("style.height")} />
      <ScrubField property="min-width" label={t("style.minW")} />
      <ScrubField property="min-height" label={t("style.minH")} />
      <ScrubField property="max-width" label={t("style.maxW")} />
      <ScrubField property="max-height" label={t("style.maxH")} />

      <GroupHeader title={t("group.spacing")} />
      <SpacingGroup kind="padding" title={t("style.padding")} />
      <SpacingGroup kind="margin" title={t("style.margin")} />

      <GroupHeader title={t("group.typography")} />
      <TextRow property="font-family" label={t("style.family")} placeholder={t("style.fontStackPlaceholder")} />
      <ScrubField property="font-size" label={t("style.size")} step={1} />
      <SegmentRow
        property="font-weight"
        label={t("style.weight")}
        options={[
          { value: "400", label: "400" },
          { value: "500", label: "500" },
          { value: "600", label: "600" },
          { value: "700", label: "700" },
        ]}
      />
      <ScrubField property="line-height" label={t("style.lineH")} step={0.05} fallbackUnit="" />
      <ScrubField property="letter-spacing" label={t("style.tracking")} step={0.1} />
      <SegmentRow
        property="text-align"
        label={t("style.align")}
        options={[
          { value: "left", label: "L" },
          { value: "center", label: "C" },
          { value: "right", label: "R" },
          { value: "justify", label: "J" },
        ]}
      />
      <ColorRow property="color" label={t("style.color")} />

      <GroupHeader title={t("group.fill")} />
      <ColorRow property="background-color" label={t("style.fill")} />
      <ScrubField property="opacity" label={t("style.opacity")} step={0.01} fallbackUnit="" min={0} max={1} />
      <ReadOnlyRow property="background-image" label={t("style.image")} />

      <GroupHeader title={t("group.border")} />
      <ScrubField property="border-width" label={t("style.width")} />
      <ColorRow property="border-color" label={t("style.color")} />
      <ScrubField property="border-radius" label={t("style.radius")} />

      <GroupHeader title={t("group.effects")} />
      <TextRow property="box-shadow" label={t("style.shadow")} placeholder={t("style.shadowPlaceholder")} />
      <ReadOnlyRow property="transform" label={t("style.transform")} />
    </div>
  );
}

/** 3×3 alignment control (plan §9.2): justify-content × align-items. */
const ALIGN_MAIN = ["start", "center", "end"] as const;
const ALIGN_CROSS = ["start", "center", "end"] as const;

function AlignmentControl() {
  const t = useT();
  const { values, updateStyle } = useStyleEdit();
  const justify = values["justify-content"] ?? "";
  const align = values["align-items"] ?? "";

  return (
    <div className="flex min-h-6 items-center gap-1.5">
      <span className="w-[64px] shrink-0 text-[11px] text-dim">{t("style.align")}</span>
      <div className="ml-auto grid size-[48px] grid-cols-3 overflow-hidden rounded border border-edge-strong">
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
                    ? "bg-inverse text-inverse-text"
                    : "bg-control text-faint hover:bg-control-hover hover:text-dim"
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
  const t = useT();
  const { values, updateStyle } = useStyleEdit();
  const [advanced, setAdvanced] = useState(false);

  const top = values[`${kind}-top`] ?? "";
  const right = values[`${kind}-right`] ?? "";
  const bottom = values[`${kind}-bottom`] ?? "";
  const left = values[`${kind}-left`] ?? "";

  const sidesEqual = top === bottom && left === right;
  const showAdvanced = advanced || !sidesEqual;
  const verticalRaw = top;
  const horizontalRaw = left;

  return (
    <>
      <div className="flex min-h-6 items-center gap-1.5">
        <span className="w-[64px] shrink-0 text-[11px] font-medium text-text">{title}</span>
        <button
          type="button"
          onClick={() => setAdvanced(!showAdvanced)}
          className="ml-auto rounded px-1.5 py-0.5 text-[10px] text-faint hover:bg-control hover:text-dim"
        >
          {showAdvanced ? t("style.simple") : t("style.advanced")}
        </button>
      </div>

      {showAdvanced ? (
        <>
          <ScrubField property={`${kind}-top`} label={t("style.top")} />
          <ScrubField property={`${kind}-right`} label={t("style.right")} />
          <ScrubField property={`${kind}-bottom`} label={t("style.bottom")} />
          <ScrubField property={`${kind}-left`} label={t("style.left")} />
        </>
      ) : (
        <>
          <AxisScrub
            label={t("style.vertical")}
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
            label={t("style.horizontal")}
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
      <div className="flex min-h-6 items-center gap-1.5">
        <span className="w-[64px] shrink-0 text-[11px] text-dim">{label}</span>
        <span className="ml-auto truncate font-mono text-[10px] text-ghost">{raw || "—"}</span>
      </div>
    );
  }
  return (
    <div className="flex min-h-6 items-center gap-1.5">
      <span className="w-[64px] shrink-0 text-[11px] text-dim">{label}</span>
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
