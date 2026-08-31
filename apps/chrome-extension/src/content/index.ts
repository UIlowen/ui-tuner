import {
  UI_TUNER_PORT_NAME,
  createContentPong,
  createContentReady,
  isSidepanelPingMessage,
} from "@ui-tuner/protocol";
import { Channel } from "../messaging/channel";

/**
 * Content script — Milestone 1 scope.
 *
 * Runs only on http://localhost/* and http://127.0.0.1/* (see manifest.json).
 * Accepts a port from the Side Panel, greets it with the page info and answers
 * pings. Does not touch the page DOM yet — Element Picker is Milestone 2.
 */

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== UI_TUNER_PORT_NAME) return;

  const channel = Channel.accept(port);

  channel.send(
    createContentReady({
      url: location.href,
      title: document.title,
      connectedAt: Date.now(),
    }),
  );

  channel.onMessage((message) => {
    if (!isSidepanelPingMessage(message)) return;
    channel.send(
      createContentPong({
        sentAt: message.payload.sentAt,
        receivedAt: Date.now(),
        url: location.href,
        title: document.title,
        userAgent: navigator.userAgent,
      }),
    );
  });
});
