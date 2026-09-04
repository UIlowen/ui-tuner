import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The panel and the page-side editor card are separate style roots: the card
 * lives in a shadow DOM, where `:root` cannot reach the page, so the same theme
 * tokens have to be declared twice — on `:root`/`.dark` and on
 * `:host`/`:host(.dark)`. Nothing in the build catches the two copies drifting
 * (a token renamed in one file just makes that surface render unstyled), so
 * this test is the only guard.
 */

const SIDEPANEL_CSS = readFileSync(new URL("./sidepanel.css", import.meta.url), "utf8");
const CARD_CSS = readFileSync(new URL("../content/card/card.css", import.meta.url), "utf8");

const PANEL = { name: "sidepanel.css", css: SIDEPANEL_CSS, light: ":root", dark: ".dark" };
const CARD = { name: "card.css", css: CARD_CSS, light: ":host", dark: ":host(.dark)" };

function blockBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
  if (body === undefined) throw new Error(`no \`${selector}\` block found`);
  return body;
}

/** Declared custom-property names, sorted. */
function tokenNames(css: string, selector: string): string[] {
  return [...blockBody(css, selector).matchAll(/(--[\w-]+)\s*:/g)]
    .flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
    .sort();
}

/** Radii as sorted "name: value" pairs — compared across files, values included. */
function radiusDeclarations(css: string): string[] {
  return [...blockBody(css, "@theme inline").matchAll(/(--radius-[\w-]+)\s*:\s*([^;]+);/g)]
    .flatMap((match) =>
      match[1] === undefined || match[2] === undefined ? [] : [`${match[1]}: ${match[2].trim()}`],
    )
    .sort();
}

function themeNames(surface: typeof PANEL): string[] {
  return tokenNames(surface.css, "@theme inline");
}

describe("theme tokens", () => {
  it("declares the same token names in both style roots", () => {
    const pairs = [
      ["light", PANEL.light, CARD.light],
      ["dark", PANEL.dark, CARD.dark],
      ["@theme", "@theme inline", "@theme inline"],
    ] as const;
    for (const [block, panelSelector, cardSelector] of pairs) {
      expect(tokenNames(CARD.css, cardSelector), `${block} block`).toEqual(
        tokenNames(PANEL.css, panelSelector),
      );
    }
  });

  it("declares every token in both light and dark", () => {
    for (const surface of [PANEL, CARD]) {
      expect(tokenNames(surface.css, surface.dark), surface.name).toEqual(
        tokenNames(surface.css, surface.light),
      );
    }
  });

  it("maps every colour token to a Tailwind utility", () => {
    for (const surface of [PANEL, CARD]) {
      const theme = new Set(themeNames(surface));
      // A raw token with no --color-* mapping produces a utility that silently
      // does not exist, so the class is dropped and the surface renders bare.
      const unmapped = tokenNames(surface.css, surface.light).filter(
        (token) => !theme.has(`--color-${token.slice(2)}`),
      );
      expect(unmapped, surface.name).toEqual([]);
    }
  });

  it("keeps the shared radii identical across both files", () => {
    expect(radiusDeclarations(PANEL.css)).toEqual([
      "--radius-card: 14px",
      "--radius-control: 6px",
      "--radius-pill: 999px",
    ]);
    expect(radiusDeclarations(CARD.css), "card.css radii").toEqual(
      radiusDeclarations(PANEL.css),
    );
  });
});
