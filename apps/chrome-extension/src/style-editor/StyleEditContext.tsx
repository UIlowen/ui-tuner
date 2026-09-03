import { createContext, useContext } from "react";

export interface StyleEditApi {
  /** 当前（暂存或已提交）属性值快照。 */
  values: Record<string, string>;
  /**
   * committed=false 是拖动中的预览帧；committed=true 是松手提交帧。两种帧都会
   * 经 content 的 onStage 进入 StagingEngine（预览引擎实时反映），区别在
   * UI：committed=true 额外刷新本快照并把卡片标脏。
   */
  updateStyle(property: string, value: string, committed: boolean): void;
}

export const StyleEditContext = createContext<StyleEditApi | null>(null);

export function useStyleEdit(): StyleEditApi {
  const api = useContext(StyleEditContext);
  if (!api) throw new Error("useStyleEdit must be used within StyleEditContext.Provider");
  return api;
}
