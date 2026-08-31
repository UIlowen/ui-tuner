import { UI_TUNER_PORT_NAME, isUiTunerMessage, type UiTunerMessage } from "@ui-tuner/protocol";

/**
 * Minimal long-lived port wrapper shared by the Side Panel and the Content
 * Script. Unknown payloads are dropped at the boundary — handlers only ever
 * see typed UI Tuner messages.
 *
 * `PortLike` is a structural subset of chrome.runtime.Port, so tests can
 * inject fakes without a global chrome object.
 */
export interface PortLike {
  readonly name: string;
  postMessage(message: unknown): void;
  readonly onMessage: {
    addListener(callback: (message: unknown) => void): void;
    removeListener(callback: (message: unknown) => void): void;
  };
  readonly onDisconnect: {
    addListener(callback: () => void): void;
    removeListener(callback: () => void): void;
  };
}

export type MessageHandler = (message: UiTunerMessage) => void;
export type DisconnectHandler = () => void;

export class Channel {
  private constructor(private readonly port: PortLike) {}

  /** Side Panel side: open a port into the given tab's content script. */
  static connectToTab(tabId: number): Channel {
    const port = chrome.tabs.connect(tabId, { name: UI_TUNER_PORT_NAME });
    // Touch lastError so an immediate "receiving end does not exist" disconnect
    // does not surface as an unchecked runtime.lastError warning.
    port.onDisconnect.addListener(() => void chrome.runtime.lastError);
    return new Channel(port as unknown as PortLike);
  }

  /** Content Script side: wrap a port received via chrome.runtime.onConnect. */
  static accept(port: PortLike): Channel {
    return new Channel(port);
  }

  send(message: UiTunerMessage): void {
    this.port.postMessage(message);
  }

  /** Returns an unsubscribe function. */
  onMessage(handler: MessageHandler): () => void {
    const listener = (raw: unknown) => {
      if (isUiTunerMessage(raw)) handler(raw);
    };
    this.port.onMessage.addListener(listener);
    return () => this.port.onMessage.removeListener(listener);
  }

  /** Returns an unsubscribe function. */
  onDisconnect(handler: DisconnectHandler): () => void {
    this.port.onDisconnect.addListener(handler);
    return () => this.port.onDisconnect.removeListener(handler);
  }
}
