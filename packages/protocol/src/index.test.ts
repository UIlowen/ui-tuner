import { describe, expect, it } from "vitest";
import {
  createContentPong,
  createContentReady,
  createSidepanelPing,
  isContentPongMessage,
  isContentReadyMessage,
  isSidepanelPingMessage,
  isUiTunerMessage,
  UI_TUNER_PORT_NAME,
} from "./index";

describe("creators", () => {
  it("creates a content.ready message", () => {
    const message = createContentReady({
      url: "http://localhost:5173/",
      title: "Vite App",
      connectedAt: 1_000,
    });
    expect(message).toEqual({
      type: "content.ready",
      payload: { url: "http://localhost:5173/", title: "Vite App", connectedAt: 1_000 },
    });
  });

  it("creates a sidepanel.ping message", () => {
    expect(createSidepanelPing({ sentAt: 42 })).toEqual({
      type: "sidepanel.ping",
      payload: { sentAt: 42 },
    });
  });

  it("creates a content.pong message", () => {
    const message = createContentPong({
      sentAt: 42,
      receivedAt: 45,
      url: "http://localhost:5173/",
      title: "Vite App",
      userAgent: "Chrome",
    });
    expect(message.type).toBe("content.pong");
    expect(message.payload.receivedAt).toBe(45);
  });
});

describe("isUiTunerMessage", () => {
  it("accepts every known message", () => {
    expect(isUiTunerMessage(createContentReady({ url: "u", title: "t", connectedAt: 1 }))).toBe(
      true,
    );
    expect(isUiTunerMessage(createSidepanelPing({ sentAt: 1 }))).toBe(true);
    expect(
      isUiTunerMessage(
        createContentPong({ sentAt: 1, receivedAt: 2, url: "", title: "", userAgent: "" }),
      ),
    ).toBe(true);
  });

  it("rejects non-objects", () => {
    expect(isUiTunerMessage(null)).toBe(false);
    expect(isUiTunerMessage(undefined)).toBe(false);
    expect(isUiTunerMessage("content.ready")).toBe(false);
    expect(isUiTunerMessage(42)).toBe(false);
  });

  it("rejects unknown types and malformed payloads", () => {
    expect(isUiTunerMessage({ type: "bridge.sync", payload: {} })).toBe(false);
    expect(isUiTunerMessage({ type: "content.ready" })).toBe(false);
    expect(isUiTunerMessage({ type: "content.ready", payload: null })).toBe(false);
    expect(isUiTunerMessage({ type: "content.ready", payload: "str" })).toBe(false);
  });
});

describe("per-type guards", () => {
  it("narrow by message type", () => {
    const messages = [
      createContentReady({ url: "u", title: "t", connectedAt: 1 }),
      createSidepanelPing({ sentAt: 1 }),
      createContentPong({ sentAt: 1, receivedAt: 2, url: "", title: "", userAgent: "" }),
    ];
    expect(messages.filter(isContentReadyMessage)).toHaveLength(1);
    expect(messages.filter(isSidepanelPingMessage)).toHaveLength(1);
    expect(messages.filter(isContentPongMessage)).toHaveLength(1);
  });
});

describe("port name", () => {
  it("is stable", () => {
    expect(UI_TUNER_PORT_NAME).toBe("ui-tuner");
  });
});
