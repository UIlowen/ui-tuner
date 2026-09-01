/**
 * Confirm that an applied change is now live in source (plan §29 "Compare").
 * Pure value comparison — chrome-free and unit-testable.
 *
 * After the agent edits source and HMR re-renders, the preview override is
 * redundant. We remove it and check whether the element's computed value still
 * equals the target: if yes, the change truly landed in source.
 */

/** Normalize a computed CSS value for comparison (trim, collapse whitespace). */
export function normalizeCssValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** True when two computed values should be treated as equal. */
export function cssValuesEqual(a: string, b: string): boolean {
  return normalizeCssValue(a) === normalizeCssValue(b);
}
