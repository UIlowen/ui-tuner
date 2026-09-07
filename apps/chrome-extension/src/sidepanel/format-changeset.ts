import { formatStyleChangeLine } from "@ui-tuner/protocol";
import type { SelectionPayload, SourceResolution, StyleChange } from "@ui-tuner/protocol";

export interface FormatChangesetInput {
  changes: StyleChange[];
  /** elementId → tagName label, accumulated from selections. */
  elementNames: Record<string, string>;
  /** Per-element natural-language instructions (elementId → instruction). */
  instructions?: Record<string, string>;
  /** Source resolution for the currently selected element (if linked). */
  source?: SourceResolution | null;
  /** Current selection, for element tag/text fallback. */
  selection?: SelectionPayload | null;
}

/**
 * Format the recorded preview changes as a paste-ready snippet for an AI
 * coding chat (Claude / Codex / …). Manual counterpart to Apply to Code: no
 * Bridge, no agent — just the element identity + source + property changes.
 *
 * Grouped per element, newest group last, matching the Changes tab order.
 */
export function formatChangesetForCopy(input: FormatChangesetInput): string {
  const { changes, elementNames, instructions, source, selection } = input;

  // Group by element, preserving first-seen order (same as ChangesTab).
  const groups: { elementId: string; changes: StyleChange[] }[] = [];
  for (const change of changes) {
    let group = groups.find((g) => g.elementId === change.elementId);
    if (!group) {
      group = { elementId: change.elementId, changes: [] };
      groups.push(group);
    }
    group.changes.push(change);
  }
  // Instruction-only elements are first-class: an element with a saved
  // instruction but zero property changes still gets an entry (its 指令 line).
  for (const elementId of Object.keys(instructions ?? {})) {
    if (!instructions?.[elementId]?.trim()) continue;
    if (!groups.some((g) => g.elementId === elementId)) {
      groups.push({ elementId, changes: [] });
    }
  }

  const lines: string[] = ["请把我在浏览器里调好的样式改动应用到对应源码：", ""];

  for (const group of groups) {
    const tagName =
      elementNames[group.elementId] ??
      (selection?.element.id === group.elementId ? selection.element.tagName : null) ??
      group.elementId;
    const text =
      selection?.element.id === group.elementId ? selection.element.text : undefined;

    lines.push(`元素：${tagName}${text ? `  "${text}"` : ""}`);

    // Source location only when it belongs to this element and is linked.
    if (source && source.elementId === group.elementId && source.confidence !== "unknown") {
      const where = source.file
        ? `${source.componentName ? `${source.componentName} · ` : ""}${source.file}${source.line ? `:${source.line}` : ""}`
        : (source.componentName ?? null);
      if (where) {
        lines.push(`源码：${where}${source.confidence === "inferred" ? "（推测，请确认）" : ""}`);
      }
    }
    if (selection?.element.id === group.elementId && selection.element.selector) {
      lines.push(`选择器：${selection.element.selector}`);
    }

    const instruction = instructions?.[group.elementId];
    if (instruction) {
      lines.push(`指令：${instruction}`);
    }

    if (group.changes.length > 0) {
      lines.push("改动（旧值 → 新值）：");
      for (const change of group.changes) {
        // Bullet prefix + the shared change line (same rendering as the §26
        // agent prompt) so Changes-copy and Agent-tab never drift.
        lines.push(`- ${formatStyleChangeLine(change)}`);
      }
    }
    lines.push("");
  }

  lines.push("约束：遵循项目现有样式方案（Tailwind 改 utility class / CSS Module 或 plain CSS 改类规则 / 组件库保持抽象），做最小改动，不要顺手重排无关代码。");

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}
