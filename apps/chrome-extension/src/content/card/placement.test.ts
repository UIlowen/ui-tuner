import { describe, expect, it } from "vitest";
import { placeNearAnchor, type AnchorRect } from "./placement";

/**
 * The card is positioned by translating a fixed host, so both the anchor (a
 * getBoundingClientRect) and the returned offset are viewport coordinates.
 */

const VIEWPORT = { width: 1200, height: 800 };
const CARD = { width: 280, height: 360 };

function anchor(rect: Partial<AnchorRect> & { left: number; top: number; width: number; height: number }): AnchorRect {
  return { ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height };
}

describe("placeNearAnchor", () => {
  it("places the card to the right of the element, top-aligned", () => {
    const at = anchor({ left: 100, top: 200, width: 300, height: 140 });
    expect(placeNearAnchor({ card: CARD, anchor: at, viewport: VIEWPORT })).toEqual({
      x: 100 + 300 + 12,
      y: 200,
    });
  });

  it("falls back to the left when the right side does not fit", () => {
    // right edge 1000 + gap 12 + card 280 = 1292 > 1200 - margin
    const at = anchor({ left: 700, top: 200, width: 300, height: 140 });
    expect(placeNearAnchor({ card: CARD, anchor: at, viewport: VIEWPORT })).toEqual({
      x: 700 - 12 - 280,
      y: 200,
    });
  });

  it("falls back to below when neither side fits", () => {
    // A wide element leaves no room on either side, but room underneath.
    const at = anchor({ left: 100, top: 100, width: 1000, height: 80 });
    expect(placeNearAnchor({ card: CARD, anchor: at, viewport: VIEWPORT })).toEqual({
      x: 100,
      y: 100 + 80 + 12,
    });
  });

  it("falls back to above when below would overflow the bottom", () => {
    const at = anchor({ left: 100, top: 600, width: 1000, height: 180 });
    expect(placeNearAnchor({ card: CARD, anchor: at, viewport: VIEWPORT })).toEqual({
      x: 100,
      y: 600 - 12 - 360,
    });
  });

  it("slides the card along the bottom edge instead of dropping it on the element", () => {
    // A corner element: no room on the right, and top-aligning beside it
    // overshoots the bottom margin by 2px. Rejecting the side for that puts the
    // card exactly on top of the element — clamp y and keep it beside instead.
    const at = anchor({ left: 1132, top: 664, width: 140, height: 56 });
    const placed = placeNearAnchor({
      card: { width: 320, height: 50 },
      anchor: at,
      viewport: { width: 1280, height: 720 },
    });
    expect(placed).toEqual({ x: 1132 - 12 - 320, y: 720 - 8 - 50 });
  });

  it("slides a below-placement left into view when the card nearly fills the viewport", () => {
    // Neither side fits a 1000px-wide card in a 1200px viewport, so it goes
    // below — but the element's own x would leave it hanging off the right edge.
    const at = anchor({ left: 250, top: 100, width: 100, height: 60 });
    const placed = placeNearAnchor({
      card: { width: 1000, height: 360 },
      anchor: at,
      viewport: VIEWPORT,
    });
    expect(placed).toEqual({ x: 1200 - 8 - 1000, y: 100 + 60 + 12 });
  });

  it("keeps the card inside the viewport when no side fits at all", () => {
    // Card taller and wider than the viewport: clamp to the safe corner
    // instead of returning a coordinate that pushes it off-screen.
    const at = anchor({ left: 10, top: 10, width: 40, height: 40 });
    const placed = placeNearAnchor({
      card: { width: 2000, height: 2000 },
      anchor: at,
      viewport: { width: 400, height: 300 },
    });
    expect(placed).toEqual({ x: 8, y: 8 });
  });

  it("clamps into view when the card is taller than the viewport", () => {
    // No side can fit a 900px-tall card in an 800px viewport, so keep the
    // preferred spot next to the element horizontally and pin y to the margin.
    const at = anchor({ left: 100, top: 300, width: 200, height: 60 });
    const placed = placeNearAnchor({
      card: { width: 280, height: 900 },
      anchor: at,
      viewport: VIEWPORT,
    });
    expect(placed).toEqual({ x: 100 + 200 + 12, y: 8 });
  });

  it("honours a custom gap and margin", () => {
    const at = anchor({ left: 100, top: 200, width: 300, height: 140 });
    expect(
      placeNearAnchor({ card: CARD, anchor: at, viewport: VIEWPORT, gap: 4, margin: 0 }),
    ).toEqual({ x: 404, y: 200 });
  });
});
