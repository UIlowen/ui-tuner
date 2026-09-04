import { useState } from "react";
import { parseCssValue } from "@ui-tuner/inspector";
import { useT } from "../i18n/use-t";
import {
  ColorRow,
  ScrubField,
  SelectRow,
} from "./rows";
import { useStyleEdit } from "./StyleEditContext";
import { ChevronDownIcon, ChevronRightIcon, LinkIcon } from "../ui/icons";

/** Subtle horizontal divider between property groups. */
function Divider() {
  return <div className="my-1.5 h-px bg-edge" />;
}

/**
 * Curated property list aligned with Codex: only the ~17 commonly-adjustable
 * CSS properties, grouped with dividers (no group headers). Flex-specific rows
 * (direction / justify / align / gap) only render when display is flex.
 */
export function StylePanel() {
  const { values } = useStyleEdit();

  const display = values["display"] ?? "";
  const isFlex = display === "flex" || display === "inline-flex";

  return (
    <div className="space-y-1">
      {/* Group 1: Color & Opacity */}
      <ColorRow property="color" label="文本颜色" />
      <ColorRow property="background-color" label="背景" />
      <ScrubField property="opacity" label="Opacity" step={0.01} fallbackUnit="" min={0} max={1} />

      <Divider />

      {/* Group 2: Typography */}
      <SelectRow
        property="font-family"
        label="字体"
        options={[
          { value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", label: "系统默认" },
          { value: "'Helvetica Neue', Arial, sans-serif", label: "Helvetica" },
          { value: "Georgia, 'Times New Roman', serif", label: "Georgia" },
          { value: "'Courier New', Courier, monospace", label: "Monospace" },
        ]}
      />
      <ScrubField property="font-size" label="字号" step={1} />
      <SelectRow
        property="font-weight"
        label="字重"
        options={[
          { value: "400", label: "400" },
          { value: "500", label: "500" },
          { value: "600", label: "600" },
          { value: "700", label: "700" },
        ]}
      />

      <Divider />

      {/* Group 3: Border */}
      <ScrubField property="border-radius" label="边框圆角半径" />
      <ColorRow property="border-color" label="边框颜色" />
      <ScrubField property="border-width" label="边框宽度" />

      <Divider />

      {/* Group 4: Size & Spacing */}
      <SizeGroup />
      <SpacingGroup kind="padding" title="内边距" />
      <SpacingGroup kind="margin" title="外边距" />

      {isFlex && (
        <>
          <Divider />

          {/* Group 5: Flex Layout */}
          <SelectRow
            property="flex-direction"
            label="布局方向"
            options={[
              { value: "row", label: "水平" },
              { value: "column", label: "垂直" },
            ]}
          />
          <SelectRow
            property="justify-content"
            label="分布"
            options={[
              { value: "flex-start", label: "开始" },
              { value: "center", label: "居中" },
              { value: "flex-end", label: "结束" },
              { value: "space-between", label: "两端" },
              { value: "space-around", label: "环绕" },
            ]}
          />
          <SelectRow
            property="align-items"
            label="居中"
            options={[
              { value: "flex-start", label: "开始" },
              { value: "center", label: "居中" },
              { value: "flex-end", label: "结束" },
              { value: "stretch", label: "拉伸" },
            ]}
          />
          <ScrubField property="gap" label="间距" step={1} />
        </>
      )}
    </div>
  );
}

/** Width/Height pair with link icon indicating linked behavior. */
function SizeGroup() {
  const t = useT();
  return (
    <>
      <ScrubField property="width" label={t("style.width")} />
      <div className="flex items-center justify-center py-0.5 text-faint">
        <LinkIcon className="size-3" />
      </div>
      <ScrubField property="height" label={t("style.height")} />
    </>
  );
}

/**
 * Padding / Margin: Codex-style collapsible spacing control.
 *
 * Collapsed: header with 4 compact value pills (top/bottom/left/right).
 * Expanded: 4 individual rows with link icons between paired axes.
 */
function SpacingGroup({ kind, title }: { kind: "padding" | "margin"; title: string }) {
  const t = useT();
  const { values } = useStyleEdit();
  const [expanded, setExpanded] = useState(false);

  const top = values[`${kind}-top`] ?? "";
  const right = values[`${kind}-right`] ?? "";
  const bottom = values[`${kind}-bottom`] ?? "";
  const left = values[`${kind}-left`] ?? "";

  const formatShort = (raw: string) => {
    const parsed = parseCssValue(raw);
    if (!parsed) return raw || "0";
    return `${parsed.value}${parsed.unit || "px"}`;
  };

  return (
    <>
      {/* Header: title + 4 value pills (collapsed) or chevron (expanded) */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1 rounded-control px-1 py-1 text-left transition-colors hover:bg-control"
      >
        <span className="w-[64px] shrink-0 text-[11px] text-faint">{title}</span>
        {!expanded ? (
          <>
            <span className="flex flex-1 items-center justify-end gap-1 font-mono text-[10px] text-text">
              <span className="rounded-sm border border-edge bg-inset px-1 py-0.5">{formatShort(top)}</span>
              <span className="rounded-sm border border-edge bg-inset px-1 py-0.5">{formatShort(right)}</span>
              <span className="rounded-sm border border-edge bg-inset px-1 py-0.5">{formatShort(bottom)}</span>
              <span className="rounded-sm border border-edge bg-inset px-1 py-0.5">{formatShort(left)}</span>
            </span>
            <ChevronRightIcon className="size-3 shrink-0 text-faint" />
          </>
        ) : (
          <>
            <span className="flex-1" />
            <ChevronDownIcon className="size-3 shrink-0 text-faint" />
          </>
        )}
      </button>

      {/* Expanded: 4 rows with link icons between paired axes */}
      {expanded && (
        <>
          <ScrubField property={`${kind}-top`} label={t("style.top")} />
          <div className="flex items-center justify-center py-0.5 text-faint">
            <LinkIcon className="size-3" />
          </div>
          <ScrubField property={`${kind}-bottom`} label={t("style.bottom")} />
          <div className="flex items-center justify-center py-0.5 text-faint">
            <LinkIcon className="size-3" />
          </div>
          <ScrubField property={`${kind}-left`} label={t("style.left")} />
          <div className="flex items-center justify-center py-0.5 text-faint">
            <LinkIcon className="size-3" />
          </div>
          <ScrubField property={`${kind}-right`} label={t("style.right")} />
        </>
      )}
    </>
  );
}
