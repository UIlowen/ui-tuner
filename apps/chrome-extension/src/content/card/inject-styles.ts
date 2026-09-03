import cardStylesText from "./card.css?inline";

/**
 * Inject the compiled card stylesheet (Tailwind output, tokens scoped to
 * :host) into the editor card's shadow root. Uses a constructed stylesheet so
 * the CSS lives outside the DOM; falls back to a <style> element where
 * adoptedStyleSheets is unavailable (e.g. jsdom).
 */
export function injectCardStyles(shadow: ShadowRoot): void {
  if ("adoptedStyleSheets" in shadow && typeof CSSStyleSheet !== "undefined") {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(cardStylesText);
      shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
      return;
    } catch {
      // Fall through to the <style> element fallback.
    }
  }
  const style = document.createElement("style");
  style.textContent = cardStylesText;
  shadow.appendChild(style);
}
