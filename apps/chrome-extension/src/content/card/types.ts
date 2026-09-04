/** Props for the page-side editor card (see EditorCard.tsx). */
export interface EditorCardProps {
  /**
   * Identity of the element being edited. The mount keys the React render by
   * this id so switching elements remounts the card with fresh state (a stale
   * draft would otherwise save against the wrong element), while re-showing
   * the same element keeps the in-progress session.
   */
  elementId: string;
  tagName: string;
  /** 气泡序号；null = 未保存。 */
  number: number | null;
  initialValues: Record<string, string>;
  /** 之前已保存的自然语言指令（"" 表示无）。 */
  initialInstruction: string;
  /**
   * 该元素已被记录的改动属性（来自 ChangeTracker）。卡片高亮这些行并滚到第一
   * 处，让「上一步改了什么」在几十个属性里一眼可见。
   */
  changedProperties: string[];
  onStage(property: string, value: string, committed: boolean): void;
  onSave(instruction: string): void;
  onCancel(): void;
  onDelete(): void;
  /** 回滚一个已记录的属性改动；返回改动前的原始值，找不到时返回 null。 */
  onRevert(property: string): string | null;
}
