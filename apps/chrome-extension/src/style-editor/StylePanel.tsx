import { useState, type ReactNode } from "react";
import { parseCssValue } from "@ui-tuner/inspector";
import { useT } from "../i18n/use-t";
import {
  ColorRow,
  ScrubField,
  SelectRow,
  TextRow,
} from "./rows";
import { useStyleEdit } from "./StyleEditContext";
import { ChevronDownFillIcon, LinkFillIcon } from "../ui/icons";

/**
 * Group separator (Figma 180:824): a 1px line, then the group's rows 12px
 * below it. Rendered as the first child of each Section.
 */
function Divider() {
  return <div className="ut-divider h-px w-full" />;
}

/** One property group: divider on top, rows below with the group's row gap. */
function Section({ gap = 11, children }: { gap?: number; children: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-3">
      <Divider />
      <div className="flex w-full flex-col" style={{ gap }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Curated property list matching the Figma card design (180:824), top to
 * bottom: 文本 (text content, text-only elements only) · 文本颜色/背景/不透明度
 * · 字体/字号/字重 · 边框圆角/颜色/宽度 · 宽高+内边距+外边距 · flex 布局四行.
 * Flex rows (direction / justify / align / gap) only render when display is flex.
 */
export function StylePanel() {
  const { values } = useStyleEdit();

  const display = values["display"] ?? "";
  const isFlex = display === "flex" || display === "inline-flex";
  // The text row exists only when the mount passed an initial text snapshot
  // (text-only elements — editing replaces the whole textContent).
  const hasText = values["text-content"] !== undefined;

  return (
    <div className="flex w-full flex-col gap-3">
      {hasText && <TextRow property="text-content" label="文本" />}

      <Section>
        <ColorRow property="color" label="文本颜色" />
        <ColorRow property="background-color" label="背景" />
        <ScrubField property="opacity" label="不透明度" step={0.01} fallbackUnit="" min={0} max={1} />
      </Section>

      <Section>
        <SelectRow
          property="font-family"
          label="字体"
          width={152}
          options={[
            { value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", label: "系统默认" },
            { value: "'Helvetica Neue', Arial, sans-serif", label: "Helvetica" },
            { value: "Georgia, 'Times New Roman', serif", label: "Georgia" },
            { value: "'Courier New', Courier, monospace", label: "Monospace" },
          ]}
        />
        <ScrubField property="font-size" label="字号" step={1} min={0} />
        <SelectRow
          property="font-weight"
          label="字重"
          width={108}
          options={["100", "200", "300", "400", "500", "600", "700", "800", "900"].map(
            (weight) => ({ value: weight, label: weight }),
          )}
        />
      </Section>

      <Section>
        <ScrubField property="border-radius" label="边框圆角" min={0} />
        <ColorRow property="border-color" label="边框颜色" />
        <ScrubField property="border-width" label="边框宽度" min={0} />
      </Section>

      <Section gap={7}>
        <SizeGroup />
        <SpacingGroup kind="padding" title="内边距" />
        <SpacingGroup kind="margin" title="外边距" />
      </Section>

      {isFlex && (
        <Section>
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
            label="对齐"
            options={[
              { value: "flex-start", label: "开始" },
              { value: "center", label: "居中" },
              { value: "flex-end", label: "结束" },
              { value: "stretch", label: "拉伸" },
            ]}
          />
          <GapGroup />
        </Section>
      )}
    </div>
  );
}

/**
 * Two paired rows joined by the Figma bracket: a vertical hairline between
 * the labels and the controls with arms pointing left at each row's midline,
 * and the link toggle (16px badge, 12px chain glyph) centered on the line.
 */
function LinkedPair({ pairKey, children }: { pairKey: string; children: ReactNode }) {
  const t = useT();
  const { linked, toggleLinked, scrubbing } = useStyleEdit();
  const isLinked = linked.has(pairKey);
  return (
    <div className="relative w-full">
      {/* Bracket geometry: rows are 30px with a 7px gap, so the row midlines
          sit 15px from the top/bottom of the pair. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute top-[15px] bottom-[15px] left-[63px] w-[22px]${
          scrubbing !== null ? " invisible" : ""
        }`}
      >
        <div className="absolute top-0 right-0 bottom-0 w-px bg-text-strong" />
        <div className="absolute top-0 right-0 h-px w-full bg-text-strong" />
        <div className="absolute right-0 bottom-0 h-px w-full bg-text-strong" />
      </div>
      <button
        type="button"
        onClick={() => toggleLinked(pairKey)}
        aria-label={isLinked ? t("style.unlock") : t("style.lock")}
        title={isLinked ? t("style.unlock") : t("style.lock")}
        className={`absolute top-1/2 left-[85px] z-10 grid size-4 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[4.667px] transition-colors ${
          isLinked
            ? "ut-link-badge text-text-strong"
            : "border border-edge bg-surface-solid text-dim hover:bg-control"
        }${scrubbing !== null ? " invisible" : ""}`}
      >
        <LinkFillIcon className="size-3 opacity-60" />
      </button>
      <div className="flex w-full flex-col gap-[7px]">{children}</div>
    </div>
  );
}

/** Width/Height pair with link icon indicating linked behavior. */
function SizeGroup() {
  const t = useT();
  return (
    <LinkedPair pairKey="width-height">
      <ScrubField
        property="width"
        label={t("style.width")}
        min={0}
        sync={{ pairKey: "width-height", sibling: "height", mode: "ratio" }}
      />
      <ScrubField
        property="height"
        label={t("style.height")}
        min={0}
        sync={{ pairKey: "width-height", sibling: "width", mode: "ratio" }}
      />
    </LinkedPair>
  );
}

/** Bare number for the segmented boxes (Figma shows "4", not "4px"). */
function formatShort(raw: string): string {
  const parsed = parseCssValue(raw);
  if (!parsed) return raw || "0";
  const unit = parsed.unit === "px" ? "" : parsed.unit;
  return `${parsed.value}${unit}`;
}

/**
 * Collapsible group header (Figma 180:824): label + 24px chevron on the left
 * (rotated -90° while collapsed), and — while collapsed — one bordered 30px
 * box on the right holding the given values as centred 32px cells separated
 * by vertical hairlines.
 */
function SegmentedHeader({
  title,
  expanded,
  values,
  boxWidth = 202,
  onToggle,
}: {
  title: string;
  expanded: boolean;
  values: readonly [label: string, raw: string][];
  /** Collapsed box width in px (Figma: 内/外边距 202, 间距 187). */
  boxWidth?: number;
  onToggle(): void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex h-[30px] w-full items-center justify-between text-left"
    >
      <span className="ut-font-label flex shrink-0 items-center gap-1.5 text-[12px] text-text">
        {title}
        <ChevronDownFillIcon
          className={`size-6 shrink-0 text-text-strong opacity-30 transition-transform${
            expanded ? "" : " -rotate-90"
          }`}
        />
      </span>
      {!expanded && (
        <span
          style={{ width: boxWidth }}
          className="flex h-[30px] items-stretch justify-between overflow-hidden rounded-[8px] border border-edge px-3"
        >
          {values.map(([label, raw], index) => (
            <span key={label} className="contents">
              {index > 0 && <span className="ut-divider w-px self-stretch" />}
              <span className="ut-font-value flex w-[32px] items-center justify-center text-[12px] text-text-strong">
                {formatShort(raw)}
              </span>
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

/**
 * Padding / Margin: collapsible spacing control.
 *
 * Collapsed: header with the 4-value segmented box (top/bottom/left/right).
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

  const tbKey = `${kind}-top-bottom`;
  const lrKey = `${kind}-left-right`;

  return (
    <>
      <SegmentedHeader
        title={title}
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        values={[
          ["top", top],
          ["right", right],
          ["bottom", bottom],
          ["left", left],
        ]}
      />

      {/* Expanded: paired rows joined by brackets with link toggles.
          Padding can't go negative; margin can (no clamp). */}
      {expanded && (
        <>
          <LinkedPair pairKey={tbKey}>
            <ScrubField
              property={`${kind}-top`}
              label={t("style.top")}
              min={kind === "padding" ? 0 : undefined}
              sync={{ pairKey: tbKey, sibling: `${kind}-bottom`, mode: "equal" }}
            />
            <ScrubField
              property={`${kind}-bottom`}
              label={t("style.bottom")}
              min={kind === "padding" ? 0 : undefined}
              sync={{ pairKey: tbKey, sibling: `${kind}-top`, mode: "equal" }}
            />
          </LinkedPair>
          <LinkedPair pairKey={lrKey}>
            <ScrubField
              property={`${kind}-left`}
              label={t("style.left")}
              min={kind === "padding" ? 0 : undefined}
              sync={{ pairKey: lrKey, sibling: `${kind}-right`, mode: "equal" }}
            />
            <ScrubField
              property={`${kind}-right`}
              label={t("style.right")}
              min={kind === "padding" ? 0 : undefined}
              sync={{ pairKey: lrKey, sibling: `${kind}-left`, mode: "equal" }}
            />
          </LinkedPair>
        </>
      )}
    </>
  );
}

/**
 * Gap (flex-only): same collapsible pattern as padding/margin, with two
 * segments — row-gap and column-gap (CSS `gap` shorthand order: row first).
 */
function GapGroup() {
  const t = useT();
  const { values } = useStyleEdit();
  const [expanded, setExpanded] = useState(false);

  const rowGap = values["row-gap"] ?? "";
  const columnGap = values["column-gap"] ?? "";

  return (
    <>
      <SegmentedHeader
        title={t("style.gap")}
        expanded={expanded}
        boxWidth={187}
        onToggle={() => setExpanded(!expanded)}
        values={[
          ["row", rowGap],
          ["column", columnGap],
        ]}
      />
      {expanded && (
        <>
          <ScrubField property="row-gap" label={t("style.rowGap")} step={1} min={0} />
          <ScrubField property="column-gap" label={t("style.columnGap")} step={1} min={0} />
        </>
      )}
    </>
  );
}
