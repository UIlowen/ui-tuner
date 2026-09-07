// @vitest-environment jsdom
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as icons from "./icons";
import { MicIcon, type IconProps } from "./icons";

/**
 * Every icon must be theme-aware. Lucide geometry is stroke-based, so an icon
 * rendered without `stroke="currentColor"` inherits solid black and disappears
 * into the dark card/panel background — a bug no snapshot of the light theme
 * would ever catch.
 */

const components = Object.entries(icons).filter(
  (entry): entry is [string, (props: IconProps) => ReactElement] => typeof entry[1] === "function",
);

describe("icon set", () => {
  it("exports icons to test (a silent zero would make this suite vacuous)", () => {
    expect(components.length).toBeGreaterThan(20);
  });

  it.each(components)("%s renders a currentColor 24×24 glyph", (_name, Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg?.getAttribute("fill")).toBe("none");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
    // Decorative by default: the surrounding button/row carries the label.
    expect(svg?.getAttribute("aria-hidden")).toBe("true");

    const path = svg?.querySelector("path");
    expect((path?.getAttribute("d") ?? "").length).toBeGreaterThan(0);
  });

  it("lets a caller resize and re-label the glyph", () => {
    const { container } = render(
      <MicIcon className="size-4" aria-hidden={false} data-testid="g" />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toBe("size-4");
    expect(svg?.getAttribute("aria-hidden")).toBe("false");
  });
});
