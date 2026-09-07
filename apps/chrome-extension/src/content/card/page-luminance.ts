/** Relative luminance of an sRGB colour, 0–1. */
function luminanceOf(rgb: { r: number; g: number; b: number }): number {
  // sRGB luminance coefficients.
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

/** Parse an rgb/rgba string. Returns null when it cannot be parsed. */
function parseRgb(color: string): { r: number; g: number; b: number; a: number } | null {
  const match = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (!match) return null;
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4]),
  };
}

/** Solid background colour of an element, null when transparent/unparsed. */
function backgroundColor(element: Element): { r: number; g: number; b: number; a: number } | null {
  const style = window.getComputedStyle(element);
  const color = parseRgb(style.backgroundColor);
  if (!color) return null;
  return color;
}

/** Luminance of the first solid background found while walking up the DOM. */
function backgroundLuminance(element: Element | null): number {
  while (element && element !== document.documentElement) {
    const color = backgroundColor(element);
    if (color && color.a > 0.05) {
      return luminanceOf(color);
    }
    element = element.parentElement;
  }
  return 1;
}

/**
 * Estimate how light the page background is. Returns a value between 0 (dark)
 * and 1 (light). Falls back to 1 (light) when nothing solid is found.
 *
 * The card is meant to float over the page, so we sample the page background
 * (body / html) rather than the card itself.
 */
export function pageBackgroundLuminance(): number {
  return Math.max(0, Math.min(1, backgroundLuminance(document.body)));
}

/** Theme that contrasts with the page background. */
export function contrastTheme(): "light" | "dark" {
  return pageBackgroundLuminance() > 0.5 ? "dark" : "light";
}
