/**
 * Annotation layer styles. Applied inside a Shadow Root so page CSS cannot
 * reach the annotations — the only style surface is this file. Fixed dark
 * palette (same precedent as overlay.ts), independent of the panel theme.
 */

/** Host node: fixed, zero-size; children opt back into pointer events. */
export const ANNOTATIONS_HOST_STYLE =
  "position: fixed; top: 0; left: 0; width: 0; height: 0; " +
  "pointer-events: none; z-index: 2147483646;";

export const ANNOTATIONS_SHADOW_CSS = `
  .bubble {
    position: fixed;
    transform: translate(-50%, -50%);
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border: none;
    border-radius: 9px;
    background: #8b5cf6;
    color: #fff;
    font: 600 11px/18px ui-sans-serif, system-ui, sans-serif;
    text-align: center;
    cursor: pointer;
    pointer-events: auto;
    display: none;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  }
  .popover {
    position: fixed;
    pointer-events: auto;
    display: none;
    min-width: 180px;
    max-width: 260px;
    background: #18181b;
    color: #e4e4e7;
    border: 1px solid #3f3f46;
    border-radius: 8px;
    padding: 8px 10px;
    font: 11px/1.6 ui-sans-serif, system-ui, sans-serif;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }
  .popover ul {
    margin: 0 0 6px;
    padding: 0;
    list-style: none;
  }
  .popover li {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .popover .revert {
    border: 1px solid #3f3f46;
    border-radius: 4px;
    background: transparent;
    color: #e4e4e7;
    font-size: 10px;
    padding: 2px 8px;
    cursor: pointer;
  }
  .popover .revert:hover {
    background: #27272a;
  }
  .popover .close {
    position: absolute;
    top: 4px;
    right: 6px;
    border: none;
    background: transparent;
    color: #71717a;
    font-size: 10px;
    cursor: pointer;
    padding: 0 2px;
  }
  .popover .close:hover {
    color: #e4e4e7;
  }
`;
