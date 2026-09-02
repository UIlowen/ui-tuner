import { resolveTheme, usePrefsStore, type ThemePref } from "../state/prefs";
import type { Locale } from "../i18n/messages";

/**
 * Chrome-side glue for the prefs store: persists locale/theme to
 * chrome.storage.local, applies the resolved theme as the `dark` class on
 * <html>, and follows OS dark mode while the pref is "system".
 */

const STORAGE_KEY = "ui-tuner:prefs";

function applyThemeClass(): void {
  const { theme } = usePrefsStore.getState();
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", resolveTheme(theme, systemDark) === "dark");
}

export function initPrefs(): void {
  // Apply immediately from the system default so the first paint is themed;
  // the stored pref (below) replaces it as soon as storage resolves.
  applyThemeClass();

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", applyThemeClass);

  usePrefsStore.subscribe((state, prev) => {
    if (state.theme !== prev.theme) applyThemeClass();
    if (state.locale !== prev.locale || state.theme !== prev.theme) {
      void chrome.storage.local.set({
        [STORAGE_KEY]: { locale: state.locale, theme: state.theme },
      });
    }
  });

  void chrome.storage.local
    .get(STORAGE_KEY)
    .then((stored: Record<string, unknown>) => {
      const prefs = stored[STORAGE_KEY] as
        | { locale?: unknown; theme?: unknown }
        | undefined;
      if (!prefs) return;
      if (prefs.locale === "zh" || prefs.locale === "en") {
        usePrefsStore.getState().setLocale(prefs.locale as Locale);
      }
      if (prefs.theme === "light" || prefs.theme === "dark" || prefs.theme === "system") {
        usePrefsStore.getState().setTheme(prefs.theme as ThemePref);
      }
    })
    .catch(() => {
      // Storage unavailable — run on in-memory defaults.
    });
}
