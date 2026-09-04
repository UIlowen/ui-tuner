/** Viewport-space rectangle of the element the card is anchored to. */
export interface AnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface PlaceNearAnchorInput {
  /** Rendered card size — measured, not assumed, since the body scrolls. */
  card: { width: number; height: number };
  anchor: AnchorRect;
  viewport: { width: number; height: number };
  /** Space between the element and the card. */
  gap?: number;
  /** How close to the viewport edge the card is allowed to sit. */
  margin?: number;
}

const DEFAULT_GAP = 12;
const DEFAULT_MARGIN = 8;

function clamp(value: number, min: number, max: number): number {
  // A card larger than the viewport makes max < min; prefer the min so the
  // card's leading edge stays reachable instead of being pushed off-screen.
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Pick where the editor card opens next to its element: right side first (the
 * reading direction, and it keeps the element visible), then left, below, above.
 * The first candidate that fits entirely inside the viewport wins; when none
 * does, the preferred right-hand spot is clamped back into view so the card is
 * never partly off-screen.
 *
 * Both the anchor and the result are viewport coordinates — the card host is
 * `position: fixed` and moved with a translate, so no scroll offset is involved.
 */
export function placeNearAnchor(input: PlaceNearAnchorInput): { x: number; y: number } {
  const { card, anchor, viewport } = input;
  const gap = input.gap ?? DEFAULT_GAP;
  const margin = input.margin ?? DEFAULT_MARGIN;

  const minX = margin;
  const minY = margin;
  const maxX = viewport.width - margin - card.width;
  const maxY = viewport.height - margin - card.height;

  const preferred = { x: anchor.right + gap, y: anchor.top };
  const candidates = [
    preferred,
    { x: anchor.left - gap - card.width, y: anchor.top },
    { x: anchor.left, y: anchor.bottom + gap },
    { x: anchor.left, y: anchor.top - gap - card.height },
  ];

  const fits = (p: { x: number; y: number }): boolean =>
    p.x >= minX && p.y >= minY && p.x <= maxX && p.y <= maxY;

  return candidates.find(fits) ?? { x: clamp(preferred.x, minX, maxX), y: clamp(preferred.y, minY, maxY) };
}
