import { STYLE_PROPERTIES } from "./whitelist";

/** Structural subset of CSSStyleDeclaration — getComputedStyle output or test fake. */
export interface StyleSource {
  getPropertyValue(propertyName: string): string;
}

/**
 * Read only the whitelisted design properties from a computed style
 * (plan §7.2). Empty values are skipped so the panel never renders blanks.
 */
export function pickStyles(
  source: StyleSource,
  properties: readonly string[] = STYLE_PROPERTIES,
): Record<string, string> {
  const styles: Record<string, string> = {};
  for (const property of properties) {
    const value = source.getPropertyValue(property).trim();
    if (value !== "") styles[property] = value;
  }
  return styles;
}
