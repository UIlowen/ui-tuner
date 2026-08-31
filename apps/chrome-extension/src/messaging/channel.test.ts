import { describe, expect, it, vi } from "vitest";
import { createContentPong, createSidepanelPing, UI_TUNER_PORT_NAME } from "@ui-tuner/protocol";
import { Channel, type PortLike } from "./channel";

interface ListenerSet<T extends (...args: never[]) => unknown> {
  addListener(callback: T): void;
  removeListener(callback: T): void;
  emit(...args: Parameters<T>): void;
}

function createListenerSet<T extends (...args: never[]) => unknown>(): ListenerSet<T> {
  const listeners = new Set<T>();
  return {
    addListener: (callback) => listeners.add(callback),
    removeListener: (callback) => listeners.delete(callback),
    emit: (...args) => {
      for (const listener of listeners) listener(...args);
    },
  };
}

/**
 * In-memory implementation of PortLike: two ends wired together, mirroring
 * chrome.tabs.connect → chrome.runtime.onConnect. postMessage on one end
 * delivers to the peer's onMessage listeners.
 */
function createPortPair() {
  const makeEnd = (name: string) => {
    const onMessage = createListenerSet<(message: unknown) => void>();
    const onDisconnect = createListenerSet<() => void>();
    const end: PortLike = {
      name,
      postMessage: () => {},
      onMessage,
      onDisconnect,
    };
    return { end, onMessage, onDisconnect };
  };

  const sidepanel = makeEnd(UI_TUNER_PORT_NAME);
  const content = makeEnd(UI_TUNER_PORT_NAME);

  sidepanel.end.postMessage = (message) => content.onMessage.emit(message);
  content.end.postMessage = (message) => sidepanel.onMessage.emit(message);

  return {
    sidepanel: sidepanel.end,
    content: content.end,
    /** Simulate the side panel end closing, as the real port would. */
    disconnectSidepanel: () => sidepanel.onDisconnect.emit(),
  };
}

describe("Channel", () => {
  it("delivers typed messages between both ends", () => {
    const pair = createPortPair();
    const contentChannel = Channel.accept(pair.content);
    const sidepanelChannel = Channel.accept(pair.sidepanel);

    const contentReceived = vi.fn();
    const sidepanelReceived = vi.fn();
    contentChannel.onMessage(contentReceived);
    sidepanelChannel.onMessage(sidepanelReceived);

    sidepanelChannel.send(createSidepanelPing({ sentAt: 1 }));
    expect(contentReceived).toHaveBeenCalledWith(createSidepanelPing({ sentAt: 1 }));

    contentChannel.send(
      createContentPong({ sentAt: 1, receivedAt: 2, url: "", title: "", userAgent: "" }),
    );
    expect(sidepanelReceived).toHaveBeenCalledTimes(1);
  });

  it("drops messages that are not valid UI Tuner messages", () => {
    const pair = createPortPair();
    const channel = Channel.accept(pair.sidepanel);
    const handler = vi.fn();
    channel.onMessage(handler);

    pair.sidepanel.postMessage(undefined); // not an object
    pair.sidepanel.postMessage("sidepanel.ping"); // bare string
    pair.sidepanel.postMessage({ type: "unknown.type", payload: {} }); // unknown type
    pair.sidepanel.postMessage({ type: "content.ready" }); // missing payload

    expect(handler).not.toHaveBeenCalled();
  });

  it("unsubscribe stops delivery", () => {
    const pair = createPortPair();
    const channel = Channel.accept(pair.sidepanel);
    const handler = vi.fn();
    const unsubscribe = channel.onMessage(handler);

    unsubscribe();
    channel.send(createSidepanelPing({ sentAt: 1 }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("notifies on disconnect", () => {
    const pair = createPortPair();
    const channel = Channel.accept(pair.sidepanel);
    const onDisconnect = vi.fn();
    channel.onDisconnect(onDisconnect);

    pair.disconnectSidepanel();

    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });
});
