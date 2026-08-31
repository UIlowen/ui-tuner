/**
 * CSS value parsing and formatting (plan §40 test focus: "CSS value parser").
 * Numeric values with an optional unit are scrubbable; keywords
 * (`auto`, `normal`, `fit-content`, …) parse to null and fall back to text
 * editing in the Side Panel.
 */

const NUMERIC_WITH_UNIT = /^(-?\d+(?:\.\d+)?)(px|rem|em|%|vh|vw|ch)?$/;

export interface ParsedCssValue {
  value: number;
  /** "" for unitless numbers (e.g. line-height 1.5). */
  unit: string;
}

/** `16px` → { 16, "px" } · `1.5` → { 1.5, "" } · `auto` → null. */
export function parseCssValue(raw: string): ParsedCssValue | null {
  const match = NUMERIC_WITH_UNIT.exec(raw.trim());
  if (!match) return null;
  return { value: Number(match[1]), unit: match[2] ?? "" };
}

/** Round to at most two decimals and drop trailing zeros. */
export function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export function formatCssValue(value: number, unit: string): string {
  return `${formatNumber(value)}${unit}`;
}

/**
 * Drag sensitivity multiplier for ScrubInput (plan §10):
 * plain drag ×1 · Shift ×10 · Option ×0.1 (Shift wins when both are held).
 */
export function scrubMultiplier(modifiers: { shift: boolean; alt: boolean }): number {
  if (modifiers.shift) return 10;
  if (modifiers.alt) return 0.1;
  return 1;
}

/** Clamp with undefined-boundary friendliness. */
export function clamp(value: number, min?: number, max?: number): number {
  let next = value;
  if (min !== undefined && next < min) next = min;
  if (max !== undefined && next > max) next = max;
  return next;
}
