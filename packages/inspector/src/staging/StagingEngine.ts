import { cssValuesEqual } from "../changes/confirm";
import type { ChangeTracker } from "../changes/ChangeTracker";
import type { PreviewEngine } from "../preview/PreviewEngine";

export interface StagedEdit {
  property: string;
  value: string;
}

/**
 * "保存才记录" engine (spec §B). Edits only touch the PreviewEngine (live
 * !important override) plus an in-memory staged map — the ChangeTracker is
 * written solely on commit(). rollback() restores the pre-session override
 * (the previously-saved value, or none), so cancel never leaves a trace.
 */
export class StagingEngine {
  private elementId: string | null = null;
  /** property → staged value, this session. */
  private stagedEdits = new Map<string, string>();
  /** property → page original, captured before the first override lands. */
  private originals = new Map<string, string>();

  constructor(
    private readonly preview: PreviewEngine,
    private readonly changes: ChangeTracker,
  ) {}

  get isActive(): boolean {
    return this.elementId !== null;
  }

  begin(elementId: string): void {
    if (this.elementId === elementId) return;
    this.end(); // roll back any previous unsaved session
    this.elementId = elementId;
    this.stagedEdits.clear();
    this.originals.clear();
  }

  stage(element: Element, property: string, value: string): void {
    if (!this.elementId) return;
    const elementId = this.elementId;
    // Capture the page original BEFORE the first override for a property that
    // has no recorded change yet — once overridden, computed style is unreadable.
    if (!this.stagedEdits.has(property) && !this.changes.find(elementId, property)) {
      this.originals.set(property, getComputedStyle(element).getPropertyValue(property).trim());
    }
    this.preview.mount();
    this.preview.setOverride(elementId, property, value);
    this.stagedEdits.set(property, value);
  }

  /** Record every staged edit; returns true when at least one real change landed. */
  commit(): boolean {
    if (!this.elementId) return false;
    const elementId = this.elementId;
    let recordedAny = false;
    for (const [property, value] of this.stagedEdits) {
      const existing = this.changes.find(elementId, property);
      const original = existing ? existing.previousValue : (this.originals.get(property) ?? "");
      this.changes.record(elementId, property, value, original);
      const change = this.changes.find(elementId, property);
      if (change && cssValuesEqual(change.nextValue, change.previousValue)) {
        // Landed back on the original — not a change; drop it (color-aware).
        this.changes.revertProperty(elementId, property);
        this.preview.setOverride(elementId, property, null);
      } else {
        recordedAny = true;
      }
    }
    this.reset();
    return recordedAny;
  }

  /** Discard staged edits, restoring the pre-session override for each. */
  rollback(): void {
    if (!this.elementId) return;
    const elementId = this.elementId;
    for (const property of this.stagedEdits.keys()) {
      const recorded = this.changes.find(elementId, property);
      this.preview.setOverride(elementId, property, recorded ? recorded.nextValue : null);
    }
    this.reset();
  }

  /** Close the session; any unsaved staged edits are rolled back. */
  end(): void {
    this.rollback();
  }

  staged(): StagedEdit[] {
    return [...this.stagedEdits.entries()].map(([property, value]) => ({ property, value }));
  }

  private reset(): void {
    this.elementId = null;
    this.stagedEdits.clear();
    this.originals.clear();
  }
}
