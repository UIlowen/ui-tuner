// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { createSidepanelPicking, UI_TUNER_PORT_NAME } from "@ui-tuner/protocol";
import { EDITOR_CARD_ROOT_ID } from "./card/mount-card";

/**
 * Integration test for the content script's reconnect resync. Drives the real
 * module: connect a fake port, pick an element, save an instruction with NO
 * property edits (an instruction-only element — zero change records), then
 * disconnect and reconnect. The resync guard must fire on the strength of the
 * surviving instruction alone, or the panel would silently drop it.
 */

interface FakePort {
  port: {
    name: string;
    postMessage(message: unknown): void;
    onMessage: {
      addListener(cb: (message: unknown) => void): void;
      removeListener(cb: (message: unknown) => void): void;
    };
    onDisconnect: {
      addListener(cb: () => void): void;
      removeListener(cb: () => void): void;
    };
  };
  sent: unknown[];
  emitToContent(message: unknown): void;
  disconnect(): void;
}

function createFakePort(): FakePort {
  const messageListeners = new Set<(message: unknown) => void>();
  const disconnectListeners = new Set<() => void>();
  const sent: unknown[] = [];
  return {
    port: {
      name: UI_TUNER_PORT_NAME,
      postMessage: (message) => {
        sent.push(message);
      },
      onMessage: {
        addListener: (cb) => messageListeners.add(cb),
        removeListener: (cb) => messageListeners.delete(cb),
      },
      onDisconnect: {
        addListener: (cb) => disconnectListeners.add(cb),
        removeListener: (cb) => disconnectListeners.delete(cb),
      },
    },
    sent,
    emitToContent: (message) => messageListeners.forEach((cb) => cb(message)),
    disconnect: () => disconnectListeners.forEach((cb) => cb()),
  };
}

interface PreviewChangedLike {
  type: string;
  payload: { changes: unknown[]; instructions?: Record<string, string> };
}

function previewChangedMessages(sent: unknown[]): PreviewChangedLike[] {
  return sent.filter(
    (m): m is PreviewChangedLike =>
      typeof m === "object" && m !== null && (m as { type?: string }).type === "preview.changed",
  );
}

function shadowButton(shadow: ShadowRoot, text: string): HTMLButtonElement {
  const button = [...shadow.querySelectorAll("button")].find((b) => b.textContent === text);
  expect(button, `button "${text}" in editor card`).toBeTruthy();
  return button!;
}

describe("content reconnect resync (instruction-only element)", () => {
  let connectListeners: Array<(port: unknown) => void>;
  let target: HTMLButtonElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    connectListeners = [];
    vi.stubGlobal("chrome", {
      runtime: {
        onConnect: {
          addListener: (cb: (port: unknown) => void) => connectListeners.push(cb),
        },
      },
      storage: {
        local: {
          get: vi.fn(() => Promise.resolve({})),
        },
      },
    });

    // jsdom lacks matchMedia (used by the card mount's theme logic).
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

    document.body.innerHTML = "";
    target = document.createElement("button");
    target.textContent = "target";
    document.body.appendChild(target);
    // The Picker resolves the clicked element via elementFromPoint.
    document.elementFromPoint = vi.fn(() => target) as unknown as typeof document.elementFromPoint;
  });

  afterEach(() => {
    document.getElementById(EDITOR_CARD_ROOT_ID)?.remove();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("resends preview.changed carrying instructions after a reconnect", async () => {
    await import("./index"); // registers chrome.runtime.onConnect
    expect(connectListeners).toHaveLength(1);
    const connect = connectListeners[0]!;

    // --- First session: connect, pick the element, save an instruction only.
    const first = createFakePort();
    act(() => connect(first.port));
    act(() => first.emitToContent(createSidepanelPicking(true)));
    act(() => {
      fireEvent.click(document.body, { clientX: 5, clientY: 5 });
    });

    const elementId = target.getAttribute("data-ui-tuner-id");
    expect(elementId).toBeTruthy();

    const host = document.getElementById(EDITOR_CARD_ROOT_ID)!;
    const shadow = host.shadowRoot!;
    // Switch to the natural-language tab, type an instruction, save.
    act(() => {
      fireEvent.click(shadowButton(shadow, "自然语言"));
    });
    const textarea = shadow.querySelector("textarea")!;
    act(() => {
      fireEvent.change(textarea, { target: { value: "圆角更大" } });
    });
    act(() => {
      fireEvent.click(shadowButton(shadow, "保存"));
    });

    // Sanity: the save reported an instruction with zero style changes.
    const firstReports = previewChangedMessages(first.sent);
    const withInstruction = firstReports.find(
      (m) => m.payload.instructions?.[elementId!] === "圆角更大",
    );
    expect(withInstruction).toBeTruthy();
    expect(withInstruction!.payload.changes).toHaveLength(0);

    // --- Disconnect, then reconnect with a fresh port.
    act(() => first.disconnect());
    const second = createFakePort();
    act(() => connect(second.port));

    // The fix: even with zero change records, the surviving instruction must
    // trigger the resync so the panel does not lose it.
    const resynced = previewChangedMessages(second.sent).find(
      (m) => m.payload.instructions?.[elementId!] === "圆角更大",
    );
    expect(resynced).toBeTruthy();
  });
});
