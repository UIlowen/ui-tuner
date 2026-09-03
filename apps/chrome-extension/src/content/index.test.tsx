// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { Annotations } from "@ui-tuner/inspector";
import {
  createSidepanelPicking,
  createSidepanelResetChanges,
  UI_TUNER_PORT_NAME,
} from "@ui-tuner/protocol";
import { EDITOR_CARD_ROOT_ID } from "./card/mount-card";

/**
 * Integration tests for the content script's page-side edit session, driving
 * the real module through a fake port: connect, pick an element, edit in the
 * card, and observe what the page (annotations) and the panel (messages) see.
 * Covers the reconnect resync and the annotation of instruction-only elements.
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

describe("content page-side edit session", () => {
  // The module registers its onConnect listener exactly once (on first import),
  // so this array is shared across tests and never reassigned.
  const connectListeners: Array<(port: unknown) => void> = [];
  let target: HTMLButtonElement;

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

    await import("./index"); // registers chrome.runtime.onConnect (once)
  });

  afterEach(() => {
    document.getElementById(EDITOR_CARD_ROOT_ID)?.remove();
    // Hosts live on documentElement, so clearing body would leave them behind.
    document.getElementById(Annotations.ROOT_ID)?.remove();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("resends preview.changed carrying instructions after a reconnect", () => {
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

    // The remounted annotation layer must show the surviving instruction too.
    expect(
      document.getElementById(Annotations.ROOT_ID)!.shadowRoot!.querySelectorAll(".bubble"),
    ).toHaveLength(1);

    // Disconnect so this session's picker does not outlive the test.
    act(() => second.disconnect());
  });

  it("annotates an instruction-only element and reopens it through its bubble", () => {
    const connect = connectListeners[0]!;
    const port = createFakePort();
    act(() => connect(port.port));
    // changeTracker/instructionStore are module-level and outlive a test.
    act(() => port.emitToContent(createSidepanelResetChanges()));
    act(() => port.emitToContent(createSidepanelPicking(true)));
    act(() => {
      fireEvent.click(document.body, { clientX: 5, clientY: 5 });
    });

    const elementId = target.getAttribute("data-ui-tuner-id");
    expect(elementId).toBeTruthy();

    const card = () => document.getElementById(EDITOR_CARD_ROOT_ID)!.shadowRoot!;
    act(() => {
      fireEvent.click(shadowButton(card(), "自然语言"));
    });
    act(() => {
      fireEvent.change(card().querySelector("textarea")!, { target: { value: "圆角更大" } });
    });
    act(() => {
      fireEvent.click(shadowButton(card(), "保存"));
    });

    // Zero property changes, yet the saved instruction makes it an annotation.
    const bubbles = () => [
      ...document
        .getElementById(Annotations.ROOT_ID)!
        .shadowRoot!.querySelectorAll<HTMLButtonElement>(".bubble"),
    ];
    expect(bubbles()).toHaveLength(1);

    // Moving the selection away must keep the id, or the bubble loses its element.
    const other = document.createElement("button");
    other.textContent = "other";
    document.body.appendChild(other);
    document.elementFromPoint = vi.fn(() => other) as unknown as typeof document.elementFromPoint;
    act(() => {
      fireEvent.click(document.body, { clientX: 40, clientY: 60 });
    });
    expect(target.getAttribute("data-ui-tuner-id")).toBe(elementId);
    expect(bubbles()).toHaveLength(1);

    // The bubble reopens the card on the annotated element, instruction intact.
    act(() => {
      fireEvent.click(bubbles()[0]!);
    });
    expect(card().textContent).not.toContain("未保存"); // it carries sequence number 1
    act(() => {
      fireEvent.click(shadowButton(card(), "自然语言"));
    });
    expect((card().querySelector("textarea") as HTMLTextAreaElement).value).toBe("圆角更大");

    act(() => port.disconnect());
  });
});
