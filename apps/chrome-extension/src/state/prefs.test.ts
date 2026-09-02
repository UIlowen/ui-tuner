import { beforeEach, describe, expect, it } from "vitest";
import {
  nextTheme,
  resolveTheme,
  usePrefsStore,
} from "./prefs";

describe("prefs store", () => {
  beforeEach(() => {
    usePrefsStore.setState({ locale: "zh", theme: "system" });
  });

  it("defaults to Chinese locale and system theme", () => {
    const state = usePrefsStore.getState();
    expect(state.locale).toBe("zh");
    expect(state.theme).toBe("system");
  });

  it("switches locale", () => {
    usePrefsStore.getState().setLocale("en");
    expect(usePrefsStore.getState().locale).toBe("en");
    usePrefsStore.getState().setLocale("zh");
    expect(usePrefsStore.getState().locale).toBe("zh");
  });

  it("switches theme explicitly", () => {
    usePrefsStore.getState().setTheme("dark");
    expect(usePrefsStore.getState().theme).toBe("dark");
  });

  it("cycles theme light → dark → system → light", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
    expect(nextTheme("system")).toBe("light");
  });
});

describe("resolveTheme", () => {
  it("passes explicit light/dark through", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the system flag when pref is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});
