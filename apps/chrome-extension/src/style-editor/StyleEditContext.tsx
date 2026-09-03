import { createContext, useContext } from "react";

export interface StyleEditApi {
  /** 当前（暂存或已提交）属性值快照。 */
  values: Record<string, string>;
  /** committed=false 仅预览；committed=true 暂存并刷新控件显示。 */
  updateStyle(property: string, value: string, committed: boolean): void;
}

export const StyleEditContext = createContext<StyleEditApi | null>(null);

export function useStyleEdit(): StyleEditApi {
  const api = useContext(StyleEditContext);
  if (!api) throw new Error("useStyleEdit must be used within StyleEditContext.Provider");
  return api;
}
