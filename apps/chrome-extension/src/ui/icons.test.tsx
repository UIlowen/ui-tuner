// @vitest-environment jsdom
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as icons from "./icons";
import { MicFillIcon, type IconProps } from "./icons";

/**
 * Every icon must be theme-aware. Stroke icons (Lucide) use
 * `stroke="currentColor"`; the Figma-traced sidepanel icons are fill-based and
 * use `fill="currentColor"`. Either way an icon that hardcoded a colour would
 * inherit solid black and disappear into the dark card/panel background — a bug
 * no snapshot of the light theme would ever catch.
 */

const components = Object.entries(icons).filter(
  (entry): entry is [string, (props: IconProps) => ReactElement] => typeof entry[1] === "function",
);

describe("icon set", () => {
  it("exports icons to test (a silent zero would make this suite vacuous)", () => {
    expect(components.length).toBeGreaterThan(20);
  });

  it.each(components)("%s renders a theme-aware (currentColor) glyph", (_name, Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).toBeTruthy();
    // Theme-aware iff it paints with currentColor — stroke icons set stroke,
    // fill icons set fill; neither may hardcode a hex that ignores the theme.
    const themed =
      svg?.getAttribute("stroke") === "currentColor" ||
      svg?.getAttribute("fill") === "currentColor";
    expect(themed).toBe(true);
    // Decorative by default: the surrounding button/row carries the label.
    expect(svg?.getAttribute("aria-hidden")).toBe("true");

    const path = svg?.querySelector("path");
    expect((path?.getAttribute("d") ?? "").length).toBeGreaterThan(0);
  });

  it("lets a caller resize and re-label the glyph", () => {
    const { container } = render(
      <MicFillIcon className="size-4" aria-hidden={false} data-testid="g" />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toBe("size-4");
    expect(svg?.getAttribute("aria-hidden")).toBe("false");
  });
});
