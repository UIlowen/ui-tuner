import { create } from "zustand";
import type { Locale } from "../i18n/messages";

/**
 * Side panel user preferences: UI language and color theme. Chrome-free so it
 * stays unit-testable — persistence (chrome.storage) and the matchMedia /
 * <html class="dark"> binding live in sidepanel/prefs-binding.ts.
 */

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** Resolve the effective theme; "system" defers to the OS dark-mode flag. */
export function resolveTheme(pref: ThemePref, systemDark: boolean): ResolvedTheme {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

/** Toggle button cycle order: light → dark → system → light. */
export function nextTheme(pref: ThemePref): ThemePref {
  return pref === "light" ? "dark" : pref === "dark" ? "system" : "light";
}

interface PrefsState {
  locale: Locale;
  theme: ThemePref;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: ThemePref) => void;
  cycleTheme: () => void;
}

export const usePrefsStore = create<PrefsState>((set) => ({
  locale: "zh",
  theme: "system",
  setLocale: (locale) => set({ locale }),
  setTheme: (theme) => set({ theme }),
  cycleTheme: () => set((state) => ({ theme: nextTheme(state.theme) })),
}));
