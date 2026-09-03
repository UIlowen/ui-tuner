/** Element → natural-language instruction, page-side, chrome-free (spec §C). */
export class InstructionStore {
  private readonly instructions = new Map<string, string>();

  /** Empty / whitespace-only text deletes the entry. */
  set(elementId: string, text: string): void {
    const trimmed = text.trim();
    if (trimmed === "") this.instructions.delete(elementId);
    else this.instructions.set(elementId, trimmed);
  }

  get(elementId: string): string | undefined {
    return this.instructions.get(elementId);
  }

  delete(elementId: string): void {
    this.instructions.delete(elementId);
  }

  clear(): void {
    this.instructions.clear();
  }

  all(): Record<string, string> {
    return Object.fromEntries(this.instructions);
  }
}
