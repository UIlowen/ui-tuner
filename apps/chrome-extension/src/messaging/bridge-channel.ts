import { isUiTunerMessage, type UiTunerMessage } from "@ui-tuner/protocol";

/**
 * WebSocket wrapper for the Side Panel ↔ local bridge link (plan §16).
 *
 * The bridge URL defaults to ws://127.0.0.1:47321 (plan §15/§38). Same
 * boundary policy as Channel: unknown payloads are dropped; handlers only
 * see typed UI Tuner messages. `WebSocketLike` is the structural subset tests
 * can fake without a real socket.
 */

export const BRIDGE_URL = "ws://127.0.0.1:47321";

/** WebSocket.OPEN — inlined so test fakes need no real socket global. */
const WS_OPEN = 1;

export interface WebSocketLike {
  /** WebSocket readyState (0 CONNECTING / 1 OPEN / 2 CLOSING / 3 CLOSED); optional for test fakes. */
  readonly readyState?: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  set onopen(handler: (() => void) | null);
  set onclose(handler: (() => void) | null);
  set onmessage(handler: ((event: { data: unknown }) => void) | null);
  set onerror(handler: (() => void) | null);
}

export type BridgeMessageHandler = (message: UiTunerMessage) => void;
export type BridgeLifecycleHandler = () => void;

export class BridgeChannel {
  private constructor(private readonly socket: WebSocketLike) {}

  /** Side Panel side: dial the local bridge. */
  static connect(url: string = BRIDGE_URL): BridgeChannel {
    return new BridgeChannel(new WebSocket(url) as unknown as WebSocketLike);
  }

  /** Test/DI entry point: wrap an already-opened socket. */
  static accept(socket: WebSocketLike): BridgeChannel {
    return new BridgeChannel(socket);
  }

  send(message: UiTunerMessage): void {
    // A send racing a socket close (bridge restart / panel reopen) would throw
    // a synchronous InvalidStateError and surface as an extension error page.
    // Drop instead: the close handler already moved the store to offline, and
    // the next selection/change re-syncs once reconnected.
    if (this.socket.readyState !== undefined && this.socket.readyState !== WS_OPEN) return;
    try {
      this.socket.send(JSON.stringify(message));
    } catch {
      // Socket closed between the check and the send — safe to drop.
    }
  }

  close(): void {
    this.socket.close();
  }

  /** Wire lifecycle callbacks; each setter accepts one handler (last wins). */
  onOpen(handler: BridgeLifecycleHandler): void {
    this.socket.onopen = handler;
  }

  onClose(handler: BridgeLifecycleHandler): void {
    this.socket.onclose = handler;
  }

  onError(handler: BridgeLifecycleHandler): void {
    this.socket.onerror = handler;
  }

  onMessage(handler: BridgeMessageHandler): void {
    this.socket.onmessage = (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (isUiTunerMessage(parsed)) handler(parsed);
    };
  }
}
