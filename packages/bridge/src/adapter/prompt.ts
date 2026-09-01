import type { ApplyChangeRequest } from "@ui-tuner/protocol";

/**
 * Build the prompt that drives Codex to apply a preview ChangeSet to source
 * (plan §28 agent edit constraints + §29 apply flow). Pure function so it is
 * unit-testable without spawning Codex.
 *
 * The prompt is deliberately explicit about the source location and the exact
 * old → new values, and carries the §28 styling constraints so Codex edits the
 * existing abstraction (Tailwind class / CSS module / component variant)
 * instead of dropping in an inline style.
 */
export function buildCodexApplyPrompt(request: ApplyChangeRequest): string {
  const { context, changes, instruction, scope, project } = request;
  const lines: string[] = [];

  lines.push("You are applying browser-previewed CSS changes to source code.");
  lines.push("");
  lines.push(`Project root: ${project.root}`);
  if (project.framework) lines.push(`Framework: ${project.framework}`);
  if (project.styling) lines.push(`Styling: ${project.styling}`);
  lines.push("");

  // Target ---------------------------------------------------------------
  lines.push("Target element:");
  lines.push(`- tag: <${context.element.tagName}>`);
  if (context.element.text) lines.push(`- text: "${context.element.text}"`);
  if (context.component?.name) lines.push(`- component: ${context.component.name}`);
  if (context.component?.source) {
    const { file, line } = context.component.source;
    lines.push(`- source file: ${file}${line !== undefined ? `:${line}` : ""}`);
  }
  lines.push(`- scope: ${scope === "instance" ? "only this element instance" : "the whole component"}`);
  lines.push("");

  // Changes ----------------------------------------------------------------
  lines.push("Apply these exact style changes (computed old → new):");
  for (const change of changes) {
    lines.push(`- ${change.property}: ${change.previousValue || "(unset)"} → ${change.nextValue}`);
  }
  lines.push("");

  // Current relevant styles for context -----------------------------------
  const styleKeys = Object.keys(context.styles);
  if (styleKeys.length > 0) {
    lines.push("Current computed styles (for context):");
    for (const key of styleKeys.slice(0, 12)) {
      lines.push(`- ${key}: ${context.styles[key]}`);
    }
    lines.push("");
  }

  // Instruction ------------------------------------------------------------
  if (instruction && instruction.trim()) {
    lines.push("User instruction:");
    lines.push(instruction.trim());
    lines.push("");
  }

  // §28 constraints ----------------------------------------------------------
  lines.push("Constraints (follow the project's existing styling approach):");
  lines.push("- Tailwind project: change the utility class (e.g. gap-6 → gap-4); do NOT add inline style={{}}.");
  lines.push("- CSS Module / plain CSS: edit the existing class rule.");
  lines.push("- Component library: preserve variant/size/token semantics; do not break the component abstraction.");
  lines.push("- Make the minimal edit that achieves the new computed values. Do not reformat unrelated code.");
  lines.push("");
  lines.push("After editing, report which file(s) you changed and a one-line summary.");

  return lines.join("\n");
}
