import { useState } from "react";
import { formatCssValue, parseCssValue } from "@ui-tuner/inspector";
import { useT } from "../i18n/use-t";
import { ScrubInput } from "./ScrubInput";
import {
  ColorRow,
  Row,
  ScrubField,
  SelectRow,
  useIsChanged,
  useIsDirty,
} from "./rows";
import { useStyleEdit } from "./StyleEditContext";

/**
 * Curated property list aligned with Codex: only the ~17 commonly-adjustable
 * CSS properties, flat (no group headers). Flex-specific rows (direction /
 * justify / align / gap) only render when display is flex.
 */
export function StylePanel() {
  const { values } = useStyleEdit();

  const display = values["display"] ?? "";
  const isFlex = display === "flex" || display === "inline-flex";

  return (
    <div className="space-y-1">
      <ColorRow property="color" label="文本颜色" />
      <ColorRow property="background-color" label="背景" />
      <ScrubField property="opacity" label="Opacity" step={0.01} fallbackUnit="" min={0} max={1} />

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

      <ScrubField property="border-radius" label="边框圆角半径" />
      <ColorRow property="border-color" label="边框颜色" />
      <ScrubField property="border-width" label="边框宽度" />

      <ScrubField property="width" label="宽度" />
      <ScrubField property="height" label="高度" />

      <SpacingGroup kind="padding" title="内边距" />
      <SpacingGroup kind="margin" title="外边距" />

      {isFlex && (
        <>
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

/**
 * Padding / Margin: Simple (Vertical / Horizontal) and Advanced (T/R/B/L)
 * modes. Simple writes both sides of the axis in one go.
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
        <span className="w-[64px] shrink-0 text-[11px] text-faint">{title}</span>
        <button
          type="button"
          onClick={() => setAdvanced(!showAdvanced)}
          className="ml-auto rounded-control px-1.5 py-0.5 text-[10px] text-faint transition-colors hover:bg-control hover:text-text"
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
            properties={[`${kind}-top`, `${kind}-bottom`]}
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
            properties={[`${kind}-left`, `${kind}-right`]}
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
  properties,
  raw,
  onPreview,
  onCommit,
}: {
  label: string;
  properties: readonly [string, string];
  raw: string;
  onPreview(cssValue: string): void;
  onCommit(cssValue: string): void;
}) {
  const { revertStyle } = useStyleEdit();
  const isChanged = useIsChanged(properties);
  const isDirty = useIsDirty(properties);
  const parsed = parseCssValue(raw);
  const reset = () => revertStyle(properties);
  if (!parsed) {
    return (
      <Row label={label} changed={isChanged} dirty={isDirty} onReset={reset}>
        <span className="truncate font-mono text-[10px] text-ghost">{raw || "—"}</span>
      </Row>
    );
  }
  return (
    <Row label={label} changed={isChanged} dirty={isDirty} onReset={reset}>
      <ScrubInput
        value={parsed.value}
        unit={parsed.unit || "px"}
        step={1}
        onPreview={(value) => onPreview(formatCssValue(value, parsed.unit || "px"))}
        onCommit={(value) => onCommit(formatCssValue(value, parsed.unit || "px"))}
      />
    </Row>
  );
}
