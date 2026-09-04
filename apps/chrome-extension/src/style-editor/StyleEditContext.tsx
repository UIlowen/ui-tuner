import { createContext, useContext } from "react";

export interface StyleEditApi {
  /** 当前（暂存或已提交）属性值快照。 */
  values: Record<string, string>;
  /** 已记录的改动属性：命中的行高亮，便于一眼看出上一步改了什么。 */
  changed: ReadonlySet<string>;
  /** 当前编辑会话中改过的属性（还没保存到 ChangeTracker）。 */
  dirty: ReadonlySet<string>;
  /**
   * committed=false 是拖动中的预览帧；committed=true 是松手提交帧。两种帧都会
   * 经 content 的 onStage 进入 StagingEngine（预览引擎实时反映），区别在
   * UI：committed=true 额外刷新本快照并把卡片标脏。
   */
  updateStyle(property: string, value: string, committed: boolean): void;
  /** 回滚已记录或当前会话中的属性改动。复合控件可一次传入多个属性。 */
  revertStyle(property: string | readonly string[]): void;
}

export const StyleEditContext = createContext<StyleEditApi | null>(null);

export function useStyleEdit(): StyleEditApi {
  const api = useContext(StyleEditContext);
  if (!api) throw new Error("useStyleEdit must be used within StyleEditContext.Provider");
  return api;
}
