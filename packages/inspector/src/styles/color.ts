/**
 * Color helpers for `<input type="color">` round-trips. Chrome computed
 * styles report colors as `rgb(...)` / `rgba(...)` (legacy comma syntax or
 * the space/slash syntax); the color input wants `#rrggbb`.
 *
 * The native color picker is opaque, so alpha lives on a separate slider.
 * `extractAlpha` reads the alpha from whatever the page reports;
 * `formatColorWithAlpha` recombines the swatch hex + slider value into
 * `rgba(…)` on commit (or plain `#rrggbb` when fully opaque).
 */

const RGB_LEGACY = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*(?:,[\s]*(\d*\.?\d+))??\)$/;
const RGB_SLASH = /^rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*(\d*\.?\d+)?\s*\)$/;
const HEX_3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_6 = /^#[0-9a-f]{6}$/i;
const HEX_8 = /^#([0-9a-f]{6})([0-9a-f]{2})$/i;

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

/** Parse a `#rrggbb` hex into `{r, g, b}` channels (0–255), or null when invalid. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!HEX_6.test(hex)) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/**
 * Extract the alpha channel from a CSS color string (0–1).
 * Returns 1 for opaque colors or unparseable values; 0 for `transparent`.
 */
export function extractAlpha(raw: string): number {
  const value = raw.trim().toLowerCase();
  if (value === "") return 1;
  if (value === "transparent") return 0;

  const hex8 = HEX_8.exec(value);
  if (hex8) {
    const a = parseInt(hex8[2]!, 16);
    return a >= 255 ? 1 : Math.round((a / 255) * 1000) / 1000;
  }

  const legacy = RGB_LEGACY.exec(value);
  if (legacy && legacy[4] !== undefined && legacy[4] !== "") {
    const n = Number(legacy[4]);
    if (Number.isFinite(n)) return n > 1 ? 1 : n;
  }

  const slash = RGB_SLASH.exec(value);
  if (slash && slash[4] !== undefined && slash[4] !== "") {
    const n = Number(slash[4]);
    if (Number.isFinite(n)) return n > 1 ? 1 : n;
  }

  return 1;
}

/**
 * Combine a `#rrggbb` hex with an alpha (0–1) into a CSS color string.
 * Fully opaque → `#rrggbb`; translucent → `rgba(r,g,b,a)`.
 */
export function formatColorWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 1000) / 1000;
  if (a >= 1) return hex;
  if (a <= 0) return "transparent";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** Normalize an alpha channel to a canonical 0–1 string (drops trailing zeros). */
function alphaKey(raw: string | undefined): string {
  if (raw === undefined || raw === "") return "1";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "1";
  // 0–255 form (from 8-digit hex) → 0–1.
  const normalized = n > 1 ? n / 255 : n;
  return String(Math.round(normalized * 1000) / 1000);
}

/**
 * Canonical comparison key for a CSS color, or null when `raw` is not a color.
 * Opaque colors normalize to `#rrggbb`; translucent ones keep alpha as
 * `rgba(r,g,b,a)` so `rgb(47,109,246)` equals `#2f6df6` but neither equals
 * `rgba(47,109,246,0.5)`. Used to recognize same-color-different-notation as
 * no change (rgb() computed value vs #hex committed swatch).
 */
export function colorKey(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (value === "" || value === "transparent") return value === "transparent" ? "rgba(0,0,0,0)" : null;

  const hex8 = HEX_8.exec(value);
  if (hex8) {
    const rgb = `#${hex8[1]!}`;
    const alpha = alphaKey(String(parseInt(hex8[2]!, 16)));
    if (alpha === "1") return rgbToHex(rgb);
    const hex = rgbToHex(rgb);
    return hex ? `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${alpha})` : null;
  }

  // Opaque hex3/hex6 → #rrggbb.
  const hex = rgbToHex(value);
  const legacy = RGB_LEGACY.exec(value);
  const slash = RGB_SLASH.exec(value);
  const alphaRaw = legacy?.[4] ?? slash?.[4];
  const alpha = alphaKey(alphaRaw);
  if (hex && alpha === "1") return hex;
  if (legacy || slash) {
    const src = (legacy ?? slash)!;
    return `rgba(${Number(src[1])},${Number(src[2])},${Number(src[3])},${alpha})`;
  }
  return hex;
}
