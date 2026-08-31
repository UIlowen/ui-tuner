import { describe, expect, it } from "vitest";
import { createContentPong, createContentReady } from "@ui-tuner/protocol";
import { useSidepanelStore } from "./sidepanel-store";

function resetStore() {
  useSidepanelStore.getState().reset();
}

describe("sidepanel store", () => {
  it("becomes connected and records page info on content.ready", () => {
    resetStore();
    useSidepanelStore
      .getState()
      .receive(
        createContentReady({ url: "http://localhost:5173/", title: "Demo", connectedAt: 1 }),
      );

    const state = useSidepanelStore.getState();
    expect(state.status).toBe("connected");
    expect(state.pageTitle).toBe("Demo");
    expect(state.pageUrl).toBe("http://localhost:5173/");
    expect(state.log).toHaveLength(1);
    expect(state.log[0]?.direction).toBe("in");
  });

  it("computes RTT from content.pong", () => {
    resetStore();
    useSidepanelStore.getState().receive(
      createContentPong({
        sentAt: Date.now() - 5,
        receivedAt: Date.now(),
        url: "",
        title: "",
        userAgent: "",
      }),
    );
    expect(useSidepanelStore.getState().lastRttMs).toBeGreaterThanOrEqual(4);
  });

  it("caps the log length", () => {
    resetStore();
    for (let i = 0; i < 60; i++) {
      useSidepanelStore
        .getState()
        .receive(createContentReady({ url: "u", title: "t", connectedAt: i }));
    }
    expect(useSidepanelStore.getState().log.length).toBeLessThanOrEqual(50);
  });

  it("reset returns to idle", () => {
    resetStore();
    useSidepanelStore
      .getState()
      .receive(createContentReady({ url: "u", title: "t", connectedAt: 1 }));
    useSidepanelStore.getState().reset();
    const state = useSidepanelStore.getState();
    expect(state.status).toBe("idle");
    expect(state.log).toHaveLength(0);
  });
});
