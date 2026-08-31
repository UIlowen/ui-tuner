/**
 * Color helpers for `<input type="color">` round-trips. Chrome computed
 * styles report colors as `rgb(...)` / `rgba(...)` (legacy comma syntax or
 * the space/slash syntax); the color input wants `#rrggbb`.
 *
 * V0.1 note: alpha is dropped when converting to a hex swatch (plan §9.6 —
 * gradient/complex values stay read-only-ish). Committing a swatch writes an
 * opaque `#rrggbb`.
 */

const RGB_LEGACY = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*(?:,[\s.]*(\d*\.?\d+))??\)$/;
const RGB_SLASH = /^rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*(\d*\.?\d+)?\s*\)$/;
const HEX_3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_6 = /^#[0-9a-f]{6}$/i;

function toHex2(channel: number): string {
  return channel.toString(16).padStart(2, "0");
}

/** Normalize a CSS color to `#rrggbb`, or null when not representable. */
export function rgbToHex(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (value === "" || value === "transparent") return null;
  if (HEX_6.test(value)) return value;

  const hex3 = HEX_3.exec(value);
  if (hex3) return `#${hex3[1]}${hex3[1]}${hex3[2]}${hex3[2]}${hex3[3]}${hex3[3]}`;

  const legacy = RGB_LEGACY.exec(value);
  if (legacy) {
    return `#${toHex2(Number(legacy[1]))}${toHex2(Number(legacy[2]))}${toHex2(Number(legacy[3]))}`;
  }
  const slash = RGB_SLASH.exec(value);
  if (slash) {
    return `#${toHex2(Number(slash[1]))}${toHex2(Number(slash[2]))}${toHex2(Number(slash[3]))}`;
  }
  return null;
}
