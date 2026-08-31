/**
 * Computed style whitelist (plan §7.2): only design-relevant properties are
 * ever read from the page or written as preview overrides — never the full
 * `getComputedStyle()` dump.
 */

export const STYLE_PROPERTIES = [
  "display",
  "position",

  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",

  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",

  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",

  "gap",
  "row-gap",
  "column-gap",

  "flex-direction",
  "justify-content",
  "align-items",
  "flex-wrap",

  "grid-template-columns",
  "grid-template-rows",

  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-align",
  "color",

  "background-color",
  "background-image",

  "border-width",
  "border-color",
  "border-style",
  "border-radius",

  "box-shadow",
  "opacity",

  "transform",
] as const;

export type StyleProperty = (typeof STYLE_PROPERTIES)[number];

export function isStyleProperty(value: string): value is StyleProperty {
  return (STYLE_PROPERTIES as readonly string[]).includes(value);
}
