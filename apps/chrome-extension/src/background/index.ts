/**
 * Background service worker — Milestone 1 scope.
 *
 * Opens the side panel when the toolbar action is clicked. No routing duties
 * yet: the Side Panel talks to content scripts directly over per-tab ports
 * (see src/messaging/channel.ts).
 */

chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[ui-tuner] extension ${details.reason}`);
});

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
