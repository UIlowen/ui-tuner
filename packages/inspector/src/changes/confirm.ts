/**
 * Confirm that an applied change is now live in source (plan §29 "Compare").
 * Pure value comparison — chrome-free and unit-testable.
 *
 * After the agent edits source and HMR re-renders, the preview override is
 * redundant. We remove it and check whether the element's computed value still
 * equals the target: if yes, the change truly landed in source.
 */

import { colorKey } from "../styles/color";

/** Normalize a computed CSS value for comparison (trim, collapse whitespace). */
export function normalizeCssValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * True when two computed values should be treated as equal.
 *
 * Color-aware: `rgb(47, 109, 246)` and `#2f6df6` are the same color in
 * different notations (Chrome reports computed colors as rgb(); the swatch
 * commits #hex). Comparing their canonical `colorKey` prevents recording a
 * no-op "change" — and prevents asking the agent to apply a visually
 * identical edit. Non-color values fall back to normalized string compare.
 */
export function cssValuesEqual(a: string, b: string): boolean {
  if (normalizeCssValue(a) === normalizeCssValue(b)) return true;
  const ca = colorKey(a);
  return ca !== null && ca === colorKey(b);
}
