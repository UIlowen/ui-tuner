import type { Bounds } from "@ui-tuner/protocol";

/** Viewport-relative, rounded snapshot of a DOMRect. */
export function boundsFromRect(rect: DOMRect): Bounds {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

/** `120 × 40` style label used by the overlay and the Side Panel. */
export function formatDimensions(bounds: Bounds): string {
  return `${bounds.width} × ${bounds.height}`;
}
