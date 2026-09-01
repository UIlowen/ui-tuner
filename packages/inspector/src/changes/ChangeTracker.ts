import type { StyleChange } from "@ui-tuner/protocol";

/**
 * Change records (plan §12): one StyleChange per (elementId, property).
 * The first record captures the page's real `previousValue`; scrub frames
 * update `nextValue` in place so dragging never spawns duplicate entries.
 * The full ChangeSet lifecycle (Revert / Reset / Changes Tab) is Milestone 4.
 */
export class ChangeTracker {
  private nextId = 1;
  /** changeId → change, insertion ordered. */
  private readonly changes = new Map<string, StyleChange>();

  /**
   * Create or update the change for (elementId, property). `originalValue`
   * (the page's computed value before any override) is only captured on the
   * first record — later calls just move `nextValue`.
   */
  record(
    elementId: string,
    property: string,
    nextValue: string,
    originalValue: string,
  ): StyleChange {
    const existing = this.find(elementId, property);
    if (existing) {
      const updated: StyleChange = { ...existing, nextValue };
      this.changes.set(existing.id, updated);
      return updated;
    }
    const change: StyleChange = {
      id: `ch-${String(this.nextId++).padStart(6, "0")}`,
      elementId,
      property,
      previousValue: originalValue,
      nextValue,
      source: "manual",
      createdAt: Date.now(),
    };
    this.changes.set(change.id, change);
    return change;
  }

  find(elementId: string, property: string): StyleChange | undefined {
    for (const change of this.changes.values()) {
      if (change.elementId === elementId && change.property === property) return change;
    }
    return undefined;
  }

  /** Remove one record by id — returns it, or null when absent (plan §14). */
  revert(changeId: string): StyleChange | null {
    const change = this.changes.get(changeId) ?? null;
    if (change) this.changes.delete(changeId);
    return change;
  }

  /** Remove the record for one property — returns it, or null when absent. */
  revertProperty(elementId: string, property: string): StyleChange | null {
    const change = this.find(elementId, property);
    if (!change) return null;
    this.changes.delete(change.id);
    return change;
  }

  /** Remove every record for one element — returns the removed list (plan §14). */
  revertElement(elementId: string): StyleChange[] {
    const removed: StyleChange[] = [];
    for (const [changeId, change] of this.changes) {
      if (change.elementId === elementId) {
        removed.push(change);
        this.changes.delete(changeId);
      }
    }
    return removed;
  }

  hasChangesFor(elementId: string): boolean {
    for (const change of this.changes.values()) {
      if (change.elementId === elementId) return true;
    }
    return false;
  }

  /** All changes, oldest first (plan §13 Changes Tab order). */
  all(): StyleChange[] {
    return [...this.changes.values()];
  }

  clear(): void {
    this.changes.clear();
  }
}
