/** Props for the page-side editor card (see EditorCard.tsx). */
export interface EditorCardProps {
  tagName: string;
  /** 气泡序号；null = 未保存。 */
  number: number | null;
  initialValues: Record<string, string>;
  /** 之前已保存的自然语言指令（"" 表示无）。 */
  initialInstruction: string;
  onStage(property: string, value: string, committed: boolean): void;
  onSave(instruction: string): void;
  onCancel(): void;
  onDelete(): void;
}
