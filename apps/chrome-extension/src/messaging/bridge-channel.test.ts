import { describe, expect, it } from "vitest";
import { createSidepanelPing } from "@ui-tuner/protocol";
import { BridgeChannel, type WebSocketLike } from "./bridge-channel";
import { Channel, type PortLike } from "./channel";

/** Minimal fake WebSocket with a settable readyState. */
function fakeSocket(readyState: number | undefined) {
  const sent: string[] = [];
  const socket: WebSocketLike = {
    readyState,
    send: (data) => {
      sent.push(data);
    },
    close: () => {},
    set onopen(_h: (() => void) | null) {},
    set onclose(_h: (() => void) | null) {},
    set onmessage(_h: ((event: { data: unknown }) => void) | null) {},
    set onerror(_h: (() => void) | null) {},
  };
  return { socket, sent };
}

describe("BridgeChannel.send", () => {
  const message = createSidepanelPing({ sentAt: 1 });
  it("delivers when the socket is OPEN (1)", () => {
    const { socket, sent } = fakeSocket(1);
    BridgeChannel.accept(socket).send(message);
    expect(sent).toHaveLength(1);
  });

  it("delivers when readyState is unknown (test fakes without it)", () => {
    const { socket, sent } = fakeSocket(undefined);
    BridgeChannel.accept(socket).send(message);
    expect(sent).toHaveLength(1);
  });

  it("drops silently when CLOSING (2) or CLOSED (3) instead of throwing", () => {
    for (const state of [2, 3]) {
      const { socket, sent } = fakeSocket(state);
      expect(() => BridgeChannel.accept(socket).send(message)).not.toThrow();
      expect(sent).toHaveLength(0);
    }
  });

  it("swallows a send() that throws (socket closed mid-call)", () => {
    const { socket } = fakeSocket(1);
    socket.send = () => {
      throw new Error("WebSocket is already in CLOSING or CLOSED state.");
    };
    expect(() => BridgeChannel.accept(socket).send(message)).not.toThrow();
  });
});

describe("Channel.send", () => {
  it("swallows a postMessage that throws on a disconnected port", () => {
    const message = createSidepanelPing({ sentAt: 1 });
    const port: PortLike = {
      name: "ui-tuner",
      postMessage: () => {
        throw new Error("Attempting to use a disconnected port object");
      },
      onMessage: { addListener: () => {}, removeListener: () => {} },
      onDisconnect: { addListener: () => {}, removeListener: () => {} },
    };
    expect(() => Channel.accept(port).send(message)).not.toThrow();
  });
});
