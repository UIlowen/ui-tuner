import { useCallback } from "react";
import { usePrefsStore } from "../state/prefs";
import { translate, type MessageKey } from "./messages";

export type TFunction = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * Component-side translation hook. Re-renders the component when the locale
 * changes because it subscribes to the prefs store.
 */
export function useT(): TFunction {
  const locale = usePrefsStore((s) => s.locale);
  return useCallback((key, vars) => translate(locale, key, vars), [locale]);
}
