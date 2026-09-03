// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePrefsStore } from "../../state/prefs";
import { EDITOR_CARD_ROOT_ID, mountEditorCard } from "./mount-card";
import type { EditorCardProps } from "./types";

function baseProps(overrides: Partial<EditorCardProps> = {}): EditorCardProps {
  return {
    tagName: "button",
    number: null,
    initialValues: { height: "38px" },
    initialInstruction: "",
    onStage: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

function hostEl(): HTMLElement | null {
  return document.getElementById(EDITOR_CARD_ROOT_ID);
}

describe("mountEditorCard", () => {
  beforeEach(() => {
    // React root.render is flushed via act(); opt into the act environment.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    usePrefsStore.setState({ locale: "zh", theme: "light" });
    // jsdom has no matchMedia; stub a light-mode one for the theme logic.
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    hostEl()?.remove();
  });

  it("creates a fixed click-through host and shows/hides the card", () => {
    const mount = mountEditorCard();
    const host = hostEl();
    expect(host).not.toBeNull();
    expect(host?.style.position).toBe("fixed");
    expect(host?.style.pointerEvents).toBe("none");
    expect(host?.shadowRoot).not.toBeNull();
    expect(mount.isOpen).toBe(false);

    act(() => mount.show(baseProps({ number: 2 })));
    expect(mount.isOpen).toBe(true);
    const text = host?.shadowRoot?.textContent ?? "";
    expect(text).toContain("button"); // tag name in the header
    expect(text).toContain("2"); // sequence badge

    act(() => mount.hide());
    expect(mount.isOpen).toBe(false);
    expect(host?.shadowRoot?.textContent ?? "").not.toContain("保存");
  });

  it("applies the dark class to the host when the resolved theme is dark", () => {
    usePrefsStore.setState({ theme: "dark" });
    const mount = mountEditorCard();
    expect(hostEl()?.classList.contains("dark")).toBe(true);

    act(() => usePrefsStore.getState().setTheme("light"));
    expect(hostEl()?.classList.contains("dark")).toBe(false);
    mount.unmount();
  });

  it("unmount removes the host from the DOM", () => {
    const mount = mountEditorCard();
    act(() => mount.show(baseProps()));
    mount.unmount();
    expect(hostEl()).toBeNull();
  });
});
