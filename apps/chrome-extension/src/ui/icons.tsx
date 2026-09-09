import type { SVGProps } from "react";

/**
 * Icon set — all icons from Lucide (https://lucide.dev), MIT licensed.
 *
 * Lucide icons are stroke-based (not fill-based like Remix), so they use
 * `stroke="currentColor"` with `fill="none"`. They default to `1em` so an icon
 * scales with the text it sits in; override with a `size-*` class when needed.
 */

export type IconProps = SVGProps<SVGSVGElement>;

function makeIcon(d: string) {
  return function LucideIcon(props: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        width="1em"
        height="1em"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        <path d={d} />
      </svg>
    );
  };
}

/**
 * Fill-based icons traced from the Figma designs (strokes expanded to filled
 * outlines). At their native viewBox size they render crisper than a scaled
 * stroke icon — that is what makes them read as "精致" next to the design.
 */
function makeFillIcon(d: string, viewBox: string) {
  return function FigmaIcon(props: IconProps) {
    return (
      <svg
        viewBox={viewBox}
        fill="currentColor"
        width="1em"
        height="1em"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        <path d={d} />
      </svg>
    );
  };
}

export const MicIcon = /* lucide mic */ makeIcon(
  "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8",
);

export const CheckIcon = /* lucide check */ makeIcon(
  "M20 6 9 17l-5-5",
);

export const ChevronDownIcon = /* lucide chevron-down */ makeIcon(
  "m6 9 6 6 6-6",
);

export const ChevronRightIcon = /* lucide chevron-right */ makeIcon(
  "m9 18 6-6-6-6",
);

export const TrashIcon = /* lucide trash-2 */ makeIcon(
  "M3 6h18 M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6 M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2 M10 11v6 M14 11v6",
);

export const DragIcon = /* lucide move */ makeIcon(
  "M5 9l-3 3 3 3 M9 5l3-3 3 3 M15 19l-3 3-3-3 M19 9l3 3-3 3 M2 12h20 M12 2v20",
);

export const LayoutIcon = /* lucide layout-grid */ makeIcon(
  "M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z",
);

export const SizeIcon = /* lucide expand */ makeIcon(
  "m21 21-6-6m6 6v-4.8m0 4.8h-4.8 M3 16.2V21m0 0h4.8M3 21l6-6 M3 7.8V3m0 0h4.8M3 3l6 6 M21 7.8V3m0 0h-4.8M21 3l-6 6",
);

export const SpacingIcon = /* lucide space */ makeIcon(
  "M3 9h18v6H3z",
);

export const TypographyIcon = /* lucide type */ makeIcon(
  "M4 7V4h16v3 M9 20h6 M12 4v16",
);

export const FillIcon = /* lucide droplet */ makeIcon(
  "M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z",
);

export const BorderIcon = /* lucide square */ makeIcon(
  "M3 3h18v18H3z",
);

export const EffectsIcon = /* lucide shadow */ makeIcon(
  "M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5",
);

export const SunIcon = /* lucide sun */ makeIcon(
  "M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41 M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z",
);

export const MoonIcon = /* lucide moon */ makeIcon(
  "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
);

export const ContrastIcon = /* lucide contrast */ makeIcon(
  "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 2a10 10 0 0 1 0 20z",
);

export const CursorIcon = /* lucide mouse-pointer-2 */ makeIcon(
  "m4 4 7.07 17 2.51-7.39L21 11.07z",
);

export const CopyIcon = /* lucide copy */ makeIcon(
  "M20 2H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z M4 8V6a2 2 0 0 1 2-2h12",
);

export const CodeIcon = /* lucide code */ makeIcon(
  "m16 18 6-6-6-6 M8 6l-6 6 6 6",
);

export const RefreshIcon = /* lucide refresh-cw */ makeIcon(
  "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16 M3 21v-5h5",
);

export const UndoIcon = /* lucide undo-2 */ makeIcon(
  "M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11",
);

export const WarningIcon = /* lucide alert-circle */ makeIcon(
  "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 8v4 M12 16h.01",
);

export const CloseIcon = /* lucide x */ makeIcon(
  "M18 6 6 18 M6 6l12 12",
);

export const SlidersIcon = /* lucide sliders-horizontal */ makeIcon(
  "M21 4H3 M21 12H3 M21 20H3 M7 4v16 M12 12v8 M17 4v4",
);

export const LinkIcon = /* lucide link */ makeIcon(
  "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
);

export const LockIcon = /* lucide lock */ makeIcon(
  "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 10 0v4",
);

export const UnlockIcon = /* lucide unlock */ makeIcon(
  "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 9.9-1",
);

export const PropertiesIcon = /* lucide settings-2 */ makeIcon(
  "M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0-2.12.88L5.46 5.46A3 3 0 0 0 2 8.88v1.24a3 3 0 0 0 .88 2.12L4.3 13.66A3 3 0 0 0 4.3 15.78l-1.42 1.42A3 3 0 0 0 2 19.32v1.24a3 3 0 0 0 3.46 3.42l1.42-1.42a3 3 0 0 0 2.12.88h1.24a3 3 0 0 0 2.12-.88l1.42 1.42A3 3 0 0 0 17.12 24v-1.24a3 3 0 0 0-.88-2.12l1.42-1.42a3 3 0 0 0-.88-2.12V15.78a3 3 0 0 0-.88-2.12l-1.42-1.42a3 3 0 0 0 .88-2.12V8.88a3 3 0 0 0-3.46-3.42L12.24 6.88A3 3 0 0 0 12 5V4a3 3 0 0 0-3-3z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
);

export const PaletteIcon = /* lucide palette */ makeIcon(
  "M12 2a10 10 0 1 0 0 20 1.5 1.5 0 0 0 1.5-1.5c0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16a6 6 0 0 0 6-6c0-5.52-4.48-10-10-10z M6.5 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M9.5 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M14.5 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M17.5 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
);

export const RotateCcwIcon = /* figma 还原(回转箭头) */ makeFillIcon(
  "M2.91422 3.49977L4.18198 4.76755L3.47487 5.47465L1 2.99977L3.47487 0.5249L4.18198 1.23201L2.91422 2.49977H6.5C8.70915 2.49977 10.5 4.29064 10.5 6.4998C10.5 8.7089 8.70915 10.4998 6.5 10.4998H2V9.4998H6.5C8.15685 9.4998 9.5 8.15665 9.5 6.4998C9.5 4.84292 8.15685 3.49977 6.5 3.49977H2.91422Z",
  "0 0 12 12",
);

/* ------------------------------------------------------------------ */
/* Editor-card glyphs traced from the Figma card design (180:759 /    */
/* 180:824). All fill-based; the surrounding button/row sets the      */
/* colour and opacity via currentColor + an opacity class.            */
/* ------------------------------------------------------------------ */

export const MoveArrowsIcon = /* figma 拖拽把手(四向箭头) 24×24 */ makeFillIcon(
  "M12 2L16.2426 6.24264L14.8284 7.65685L12 4.82843L9.17157 7.65685L7.75736 6.24264L12 2ZM2 12L6.24264 7.75736L7.65685 9.17157L4.82843 12L7.65685 14.8284L6.24264 16.2426L2 12ZM22 12L17.7574 16.2426L16.3431 14.8284L19.1716 12L16.3431 9.17157L17.7574 7.75736L22 12ZM12 14C10.8954 14 10 13.1046 10 12C10 10.8954 10.8954 10 12 10C13.1046 10 14 10.8954 14 12C14 13.1046 13.1046 14 12 14ZM12 22L7.75736 17.7574L9.17157 16.3431L12 19.1716L14.8284 16.3431L16.2426 17.7574L12 22Z",
  "0 0 24 24",
);

export const SlidersFillIcon = /* figma 属性开关(双滑钮) 28×28 */ makeFillIcon(
  "M12.4004 14.2002C13.8515 14.2003 15.0617 15.2305 15.3398 16.5996H21.4004V17.7998H15.3398C15.0619 19.1691 13.8517 20.2001 12.4004 20.2002C10.9489 20.2002 9.73783 19.1693 9.45996 17.7998H7V16.5996H9.45996C9.73805 15.2304 10.9491 14.2002 12.4004 14.2002ZM12.4004 15.4004C11.4063 15.4004 10.6006 16.2061 10.6006 17.2002C10.6007 18.1942 11.4063 19 12.4004 19C13.3943 18.9999 14.2001 18.1942 14.2002 17.2002C14.2002 16.2061 13.3944 15.4005 12.4004 15.4004ZM16 7C17.4515 7 18.6626 8.03082 18.9404 9.40039H21.3994V10.6006H18.9404C18.6623 11.9697 17.4512 13 16 13C14.5488 13 13.3377 11.9697 13.0596 10.6006H7V9.40039H13.0596C13.3374 8.03082 14.5485 7 16 7ZM16 8.2002C15.0059 8.2002 14.2002 9.00589 14.2002 10C14.2002 10.9941 15.0059 11.7998 16 11.7998C16.9941 11.7998 17.7998 10.9941 17.7998 10C17.7998 9.00589 16.9941 8.2002 16 8.2002Z",
  "0 0 28 28",
);

export const MicFillIcon = /* figma 语音输入 18×18 */ makeFillIcon(
  "M8.99985 2.25C7.75718 2.25 6.74982 3.25736 6.74982 4.5V7.5C6.74982 8.74268 7.75718 9.75 8.99985 9.75C10.2425 9.75 11.2499 8.74268 11.2499 7.5V4.5C11.2499 3.25736 10.2425 2.25 8.99985 2.25ZM8.99985 0.75C11.0709 0.75 12.7499 2.42893 12.7499 4.5V7.5C12.7499 9.57105 11.0709 11.25 8.99985 11.25C6.92875 11.25 5.24982 9.57105 5.24982 7.5V4.5C5.24982 2.42893 6.92875 0.75 8.99985 0.75ZM2.29102 8.25H3.80299C4.16691 10.7942 6.35497 12.75 8.99985 12.75C11.6447 12.75 13.8327 10.7942 14.1967 8.25H15.7086C15.3628 11.3787 12.8786 13.8629 9.74985 14.2088V17.25H8.24985V14.2088C5.1211 13.8629 2.63688 11.3787 2.29102 8.25Z",
  "0 0 18 18",
);

export const CheckFillIcon = /* figma 提交(对勾) 24×24 */ makeFillIcon(
  "M10.25 14.6471L17.8333 7L19 8.17647L10.25 17L5 11.7059L6.16667 10.5295L10.25 14.6471Z",
  "0 0 24 24",
);

export const ChevronDownFillIcon = /* figma 下拉箭头 24×24 */ makeFillIcon(
  "M12 15.0006L7.75732 10.758L9.17154 9.34375L12 12.1722L14.8284 9.34375L16.2426 10.758L12 15.0006Z",
  "0 0 24 24",
);

export const LinkFillIcon = /* figma 联动锁(链条) 12×12 */ makeFillIcon(
  "M9.1819 7.76766L8.4748 7.06056L9.1819 6.35346C10.1582 5.37716 10.1582 3.79424 9.1819 2.81793C8.2056 1.84161 6.62265 1.84161 5.64635 2.81793L4.93924 3.52503L4.23214 2.81793L4.93924 2.11082C6.3061 0.743985 8.52215 0.743985 9.889 2.11082C11.2558 3.47765 11.2558 5.69371 9.889 7.06056L9.1819 7.76766ZM7.76765 9.18191L7.06055 9.88901C5.69375 11.2558 3.47765 11.2558 2.11082 9.88901C0.743985 8.52216 0.743985 6.30606 2.11082 4.93925L2.81792 4.23214L3.52503 4.93925L2.81792 5.64636C1.84161 6.62266 1.84161 8.20556 2.81792 9.18191C3.79423 10.1582 5.37715 10.1582 6.35345 9.18191L7.06055 8.47476L7.76765 9.18191ZM7.4141 3.87859L8.12125 4.58569L4.58569 8.12121L3.87858 7.41411L7.4141 3.87859Z",
  "0 0 12 12",
);
