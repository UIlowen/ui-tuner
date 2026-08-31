/**
 * Overlay layer styles (plan §2.2). Applied inside a Shadow Root so page CSS
 * cannot reach the overlay — the only style surface is this file.
 */

/** Host node: fixed, zero-size, never intercepts pointer events. */
export const OVERLAY_HOST_STYLE =
  "position: fixed; top: 0; left: 0; width: 0; height: 0; " +
  "pointer-events: none; z-index: 2147483647;";

export const OVERLAY_SHADOW_CSS = `
  .box {
    position: fixed;
    pointer-events: none;
    border-radius: 2px;
    display: none;
  }
  .hover-box {
    border: 1.5px solid #3b82f6;
    background: rgba(59, 130, 246, 0.08);
  }
  .selected-box {
    border: 1.5px solid #8b5cf6;
    background: rgba(139, 92, 246, 0.06);
  }
  .label {
    position: fixed;
    pointer-events: none;
    font: 500 11px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    padding: 3px 6px;
    border-radius: 3px;
    white-space: nowrap;
    color: #fff;
    display: none;
  }
  .hover-label {
    background: #3b82f6;
  }
  .selected-label {
    background: #8b5cf6;
  }
`;

/** Distance between a box and its label (label height ≈ 17px + 4px gap). */
export const LABEL_OFFSET_PX = 21;
