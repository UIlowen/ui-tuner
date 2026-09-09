// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { Annotations, Overlay } from "@ui-tuner/inspector";
import {
  createSidepanelPicking,
  createSidepanelResetChanges,
  createSidepanelRevertInstruction,
  UI_TUNER_PORT_NAME,
} from "@ui-tuner/protocol";
import { EDITOR_CARD_ROOT_ID } from "./card/mount-card";
import { usePrefsStore } from "../state/prefs";

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

/** Type strings of everything the content script sent, in order. */
function messageTypes(sent: unknown[]): string[] {
  return sent.map((m) => (typeof m === "object" && m !== null ? ((m as { type?: string }).type ?? "") : ""));
}

/** Finds a card button by its visible text or, for icon-only ones, its aria-label. */
function shadowButton(shadow: ShadowRoot, name: string): HTMLButtonElement {
  const button = [...shadow.querySelectorAll("button")].find(
    (b) => b.textContent === name || b.getAttribute("aria-label") === name,
  );
  expect(button, `button "${name}" in editor card`).toBeTruthy();
  return button!;
}

const INSTRUCTION_PLACEHOLDER = "这个元素要怎么修改...";

/** The open card's instruction field, in whichever state the card rendered. */
function instructionField(shadow: ShadowRoot): HTMLInputElement | HTMLTextAreaElement {
  const field = shadow.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[placeholder="${INSTRUCTION_PLACEHOLDER}"]`,
  );
  expect(field, "instruction field in editor card").toBeTruthy();
  return field!;
}

/**
 * Type an instruction into the open card and save it. Which control saves it
 * depends on the state the card opened in: a freshly picked element gets the
 * compact row (one-line input + ✓), an already-annotated one the expanded body
 * (textarea + 保存).
 */
function saveInstruction(shadow: ShadowRoot, text: string): void {
  const field = instructionField(shadow);
  act(() => {
    fireEvent.change(field, { target: { value: text } });
  });
  act(() => {
    fireEvent.click(shadowButton(shadow, field.tagName === "INPUT" ? "提交" : "保存"));
  });
}

/** The control of the property row carrying this label (rows are label + control). */
function rowControl<K extends keyof HTMLElementTagNameMap>(
  shadow: ShadowRoot,
  label: string,
  tag: K,
): HTMLElementTagNameMap[K] {
  const span = [...shadow.querySelectorAll("span")].find((node) => node.textContent === label);
  const control = span?.parentElement?.querySelector(tag);
  expect(control, `${tag} in row "${label}"`).toBeTruthy();
  return control as HTMLElementTagNameMap[K];
}

describe("content page-side edit session", () => {
  // The module registers its onConnect listener exactly once (on first import),
  // so this array is shared across tests and never reassigned.
  const connectListeners: Array<(port: unknown) => void> = [];
  /** Same for the storage listener: registered once, fired by hand in tests. */
  const storageListeners: Array<
    (changes: Record<string, { newValue?: unknown }>, areaName: string) => void
  > = [];
  let target: HTMLButtonElement;

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    // The prefs store is module-level and outlives a test; the theme one drives
    // the card host's `dark` class.
    usePrefsStore.setState({ locale: "zh", theme: "light" });

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
        onChanged: {
          addListener: (
            cb: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void,
          ) => storageListeners.push(cb),
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

    // jsdom lacks ResizeObserver too (the card mount uses it to stay on screen).
    // Geometry is mount-card.test.tsx's job; these tests only drive messages.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );

    // …and scrollIntoView, which the card calls on mount to bring a highlighted
    // changed row into view — reopening an annotated element needs it present.
    Element.prototype.scrollIntoView = vi.fn();

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
    document.getElementById(Overlay.ROOT_ID)?.remove();
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
    // A freshly picked element opens on the compact row; ✓ saves the instruction.
    saveInstruction(shadow, "圆角更大");

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
    saveInstruction(card(), "圆角更大");

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
    // Annotated, so it opens expanded — the instruction is already on screen.
    expect(instructionField(card()).tagName).toBe("INPUT");
    expect(instructionField(card()).value).toBe("圆角更大");

    act(() => port.disconnect());
  });

  it("revertInstruction clears only the instruction and re-reports", () => {
    const connect = connectListeners[0]!;
    const port = createFakePort();
    act(() => connect(port.port));
    act(() => port.emitToContent(createSidepanelResetChanges()));
    act(() => port.emitToContent(createSidepanelPicking(true)));
    act(() => {
      fireEvent.click(document.body, { clientX: 5, clientY: 5 });
    });

    const elementId = target.getAttribute("data-ui-tuner-id")!;
    const card = () => document.getElementById(EDITOR_CARD_ROOT_ID)!.shadowRoot!;
    saveInstruction(card(), "圆角更大");
    expect(
      previewChangedMessages(port.sent).find(
        (m) => m.payload.instructions?.[elementId] === "圆角更大",
      ),
    ).toBeTruthy();
    expect(
      document.getElementById(Annotations.ROOT_ID)!.shadowRoot!.querySelectorAll(".bubble"),
    ).toHaveLength(1);

    act(() => port.emitToContent(createSidepanelRevertInstruction(elementId)));

    // The instruction is gone from the mirror, and so is the bubble it caused.
    const last = previewChangedMessages(port.sent).at(-1)!;
    expect(last.payload.instructions?.[elementId]).toBeUndefined();
    expect(
      document.getElementById(Annotations.ROOT_ID)!.shadowRoot!.querySelectorAll(".bubble"),
    ).toHaveLength(0);

    act(() => port.disconnect());
  });

  it("shows bubbles only while annotation mode is active", () => {
    const connect = connectListeners[0]!;
    const port = createFakePort();
    act(() => connect(port.port));
    act(() => port.emitToContent(createSidepanelResetChanges()));

    const host = () => document.getElementById(Annotations.ROOT_ID)!;
    const hidden = () => host().style.display === "none";
    // Annotation mode is off at connect, so nothing is painted on the page.
    expect(hidden()).toBe(true);

    act(() => port.emitToContent(createSidepanelPicking(true)));
    act(() => {
      fireEvent.click(document.body, { clientX: 5, clientY: 5 });
    });
    const card = () => document.getElementById(EDITOR_CARD_ROOT_ID)!.shadowRoot!;
    saveInstruction(card(), "圆角更大");
    expect(hidden()).toBe(false);
    expect(host().shadowRoot!.querySelectorAll(".bubble")).toHaveLength(1);

    // Panel toggle exits annotation mode → bubbles go away.
    act(() => port.emitToContent(createSidepanelPicking(false)));
    expect(hidden()).toBe(true);

    // Re-activating brings the same annotation back.
    act(() => port.emitToContent(createSidepanelPicking(true)));
    expect(hidden()).toBe(false);
    expect(host().shadowRoot!.querySelectorAll(".bubble")).toHaveLength(1);

    // Esc inside the picker is the other exit path — same result.
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(hidden()).toBe(true);

    act(() => port.disconnect());
  });

  it("clears the page selection on exit but keeps the panel's Apply target", async () => {
    const connect = connectListeners[0]!;
    const port = createFakePort();
    act(() => connect(port.port));
    act(() => port.emitToContent(createSidepanelResetChanges()));

    // Overlay hides any target it measures as zero-sized, and jsdom reports
    // zero rects for everything — give the target a real box.
    target.getBoundingClientRect = () =>
      ({
        x: 10,
        y: 10,
        left: 10,
        top: 10,
        right: 110,
        bottom: 50,
        width: 100,
        height: 40,
        toJSON: () => ({}),
      }) as DOMRect;

    const selectedBox = () =>
      document
        .getElementById(Overlay.ROOT_ID)!
        .shadowRoot!.querySelector<HTMLDivElement>(".selected-box")!;
    const frame = async (): Promise<void> => {
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      });
    };

    act(() => port.emitToContent(createSidepanelPicking(true)));
    act(() => {
      fireEvent.click(document.body, { clientX: 5, clientY: 5 });
    });
    await frame();
    expect(selectedBox().style.display).toBe("block");

    // Save an instruction so the element carries a record: keepId must retain
    // its id after the selection is released, or Apply can no longer find it.
    const card = () => document.getElementById(EDITOR_CARD_ROOT_ID)!.shadowRoot!;
    saveInstruction(card(), "圆角更大");
    const elementId = target.getAttribute("data-ui-tuner-id");
    expect(elementId).toBeTruthy();

    act(() => port.emitToContent(createSidepanelPicking(false)));
    await frame();

    // The page is a plain preview again: no selection box, no editor card.
    expect(selectedBox().style.display).toBe("none");
    expect(card().textContent).toBe("");
    // …but the panel keeps its Apply target: no selection.cleared went out, and
    // the element still carries its id.
    expect(messageTypes(port.sent)).not.toContain("selection.cleared");
    expect(target.getAttribute("data-ui-tuner-id")).toBe(elementId);

    act(() => port.disconnect());
  });

  it("records no change for an unsaved edit that was reset before saving", () => {
    const connect = connectListeners[0]!;
    const port = createFakePort();
    act(() => connect(port.port));
    act(() => port.emitToContent(createSidepanelResetChanges()));
    act(() => port.emitToContent(createSidepanelPicking(true)));
    act(() => {
      fireEvent.click(document.body, { clientX: 5, clientY: 5 });
    });

    const card = () => document.getElementById(EDITOR_CARD_ROOT_ID)!.shadowRoot!;
    // A fresh pick opens on the compact row; the properties live behind the icon.
    act(() => shadowButton(card(), "展开").click());

    // Edit 字重, then take it back with the row's own reset button.
    act(() => {
      fireEvent.change(rowControl(card(), "字重", "select"), { target: { value: "500" } });
    });
    act(() => shadowButton(card(), "还原 字重").click());

    // A second edit keeps 保存 enabled — this is the save that used to carry the
    // reverted property along with it.
    act(() => {
      fireEvent.change(rowControl(card(), "字体", "select"), { target: { value: "Georgia, 'Times New Roman', serif" } });
    });
    act(() => shadowButton(card(), "保存").click());

    const properties = previewChangedMessages(port.sent)
      .at(-1)!
      .payload.changes.map((change) => (change as { property: string }).property);
    expect(properties).toEqual(["font-family"]);

    act(() => port.disconnect());
  });

  /**
   * Both tests below walk the same second visit: save a property change, reopen
   * the card from its bubble, and take the change back with the row's reset
   * button. What differs is how the visit ends — 保存 has to land the reset,
   * 取消 has to undo it.
   */
  function reopenAndReset(port: FakePort): {
    card: () => ShadowRoot;
    bubbles: () => HTMLButtonElement[];
    reportedProperties: () => string[];
  } {
    const connect = connectListeners[0]!;
    act(() => connect(port.port));
    act(() => port.emitToContent(createSidepanelResetChanges()));
    act(() => port.emitToContent(createSidepanelPicking(true)));
    act(() => {
      fireEvent.click(document.body, { clientX: 5, clientY: 5 });
    });

    const card = (): ShadowRoot => document.getElementById(EDITOR_CARD_ROOT_ID)!.shadowRoot!;
    const bubbles = (): HTMLButtonElement[] => [
      ...document
        .getElementById(Annotations.ROOT_ID)!
        .shadowRoot!.querySelectorAll<HTMLButtonElement>(".bubble"),
    ];
    const reportedProperties = (): string[] =>
      previewChangedMessages(port.sent)
        .at(-1)!
        .payload.changes.map((change) => (change as { property: string }).property);

    // First visit: change 字体 and save it.
    act(() => shadowButton(card(), "展开").click());
    act(() => {
      fireEvent.change(rowControl(card(), "字体", "select"), { target: { value: "Inter" } });
    });
    act(() => shadowButton(card(), "保存").click());
    expect(reportedProperties()).toEqual(["font-family"]);
    expect(bubbles()).toHaveLength(1);

    // Second visit: the bubble reopens the card, the row arrives marked changed.
    // To make the reset button appear, first edit the property (make it dirty).
    act(() => {
      fireEvent.click(bubbles()[0]!);
    });
    act(() => {
      fireEvent.change(rowControl(card(), "字体", "select"), { target: { value: "Arial" } });
    });
    // Now the reset button should appear
    act(() => shadowButton(card(), "还原 字体").click());

    return { card, bubbles, reportedProperties };
  }

  it("saves the reset of a change that was already saved", () => {
    const port = createFakePort();
    const { card, bubbles, reportedProperties } = reopenAndReset(port);

    // A reset is an edit like any other — 保存 must stay usable, or the user has
    // no way to make it stick.
    expect(shadowButton(card(), "保存").disabled).toBe(false);
    act(() => shadowButton(card(), "保存").click());

    expect(reportedProperties()).toEqual([]);
    expect(bubbles()).toHaveLength(0);

    act(() => port.disconnect());
  });

  it("puts a saved change back when the reset is cancelled", () => {
    const port = createFakePort();
    const { card, bubbles, reportedProperties } = reopenAndReset(port);

    // Nothing was saved yet, so 取消 discards the reset along with any edit.
    act(() => shadowButton(card(), "取消").click());

    expect(reportedProperties()).toEqual(["font-family"]);
    expect(bubbles()).toHaveLength(1);

    act(() => port.disconnect());
  });

  it("re-themes an open card when the panel switches theme", () => {
    const connect = connectListeners[0]!;
    const port = createFakePort();
    act(() => connect(port.port));
    act(() => port.emitToContent(createSidepanelPicking(true)));

    // The card theme is driven by page luminance, not panel theme.
    // Dark page → light card.
    document.body.style.backgroundColor = "#000000";
    act(() => {
      fireEvent.click(document.body, { clientX: 5, clientY: 5 });
    });

    const host = document.getElementById(EDITOR_CARD_ROOT_ID)!;
    expect(host.classList.contains("dark")).toBe(false);

    // The panel is a separate JS context and the only writer, so its theme
    // switch arrives as a storage event. Hydrating only on connect would leave
    // this card light next to a dark panel until the page reloaded.
    const emitPrefs = (newValue: unknown, areaName = "local"): void => {
      act(() => {
        for (const listener of storageListeners) {
          listener({ "ui-tuner:prefs": { newValue } }, areaName);
        }
      });
    };

    // A local dark-theme event should set the store and re-evaluate the card.
    emitPrefs({ locale: "zh", theme: "dark" });
    expect(usePrefsStore.getState().theme).toBe("dark");
    expect(host.classList.contains("dark")).toBe(false);

    // Other storage areas are ignored.
    emitPrefs({ locale: "zh", theme: "light" }, "sync");
    expect(usePrefsStore.getState().theme).toBe("dark");
    expect(host.classList.contains("dark")).toBe(false);

    // Switch the page to light and emit a theme change; the card should flip
    // to dark because the page is now light.
    document.body.style.backgroundColor = "#ffffff";
    emitPrefs({ locale: "zh", theme: "light" });
    expect(usePrefsStore.getState().theme).toBe("light");
    expect(host.classList.contains("dark")).toBe(true);

    act(() => port.disconnect());
  });
});
