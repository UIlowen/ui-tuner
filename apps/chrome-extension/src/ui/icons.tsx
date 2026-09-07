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
  "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 10 0v4",
);

export const UnlockIcon = /* lucide unlock */ makeIcon(
  "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 9.9-1",
);

export const PropertiesIcon = /* lucide settings-2 */ makeIcon(
  "M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0-2.12.88L5.46 5.46A3 3 0 0 0 2 8.88v1.24a3 3 0 0 0 .88 2.12L4.3 13.66A3 3 0 0 0 4.3 15.78l-1.42 1.42A3 3 0 0 0 2 19.32v1.24a3 3 0 0 0 3.46 3.42l1.42-1.42a3 3 0 0 0 2.12.88h1.24a3 3 0 0 0 2.12-.88l1.42 1.42A3 3 0 0 0 17.12 24v-1.24a3 3 0 0 0-.88-2.12l1.42-1.42a3 3 0 0 0 .88-2.12V15.78a3 3 0 0 0-.88-2.12l-1.42-1.42a3 3 0 0 0 .88-2.12V8.88a3 3 0 0 0-3.46-3.42L12.24 6.88A3 3 0 0 0 12 5V4a3 3 0 0 0-3-3z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
);

export const PaletteIcon = /* lucide palette */ makeIcon(
  "M12 2a10 10 0 1 0 0 20 1.5 1.5 0 0 0 1.5-1.5c0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16a6 6 0 0 0 6-6c0-5.52-4.48-10-10-10z M6.5 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M9.5 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M14.5 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M17.5 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
);
