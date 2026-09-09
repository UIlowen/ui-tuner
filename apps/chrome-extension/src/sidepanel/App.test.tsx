// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UI_TUNER_PORT_NAME } from "@ui-tuner/protocol";
import { App } from "./App";
import { useSidepanelStore } from "../state/sidepanel-store";
import { usePrefsStore } from "../state/prefs";

/**
 * Auto-reconnect wiring (the App useEffect): the panel dials both links on
 * mount, re-dials the page channel when the active tab finishes loading or the
 * active tab changes, and re-dials a dropped bridge after a short delay. The
 * chrome surface and the WebSocket are faked; the real store runs underneath.
 */

type UpdatedHandler = (
  tabId: number,
  changeInfo: { status?: string },
  tab: { active?: boolean },
) => void;

function createFakePort() {
  return {
    name: UI_TUNER_PORT_NAME,
    postMessage: () => {},
    onMessage: { addListener: () => {}, removeListener: () => {} },
    onDisconnect: { addListener: () => {}, removeListener: () => {} },
  };
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(): void {}
  close(): void {}
}

let updatedHandlers: Set<UpdatedHandler>;
let activatedHandlers: Set<() => void>;
let connectSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  usePrefsStore.setState({ locale: "zh" });
  updatedHandlers = new Set();
  activatedHandlers = new Set();
  FakeWebSocket.instances = [];
  connectSpy = vi.fn(() => createFakePort());
  vi.stubGlobal("chrome", {
    tabs: {
      query: vi.fn(async () => [{ id: 1, url: "http://localhost:3000" }]),
      connect: connectSpy,
      captureVisibleTab: vi.fn(async () => "data:image/png;base64,x"),
      onUpdated: {
        addListener: (h: UpdatedHandler) => updatedHandlers.add(h),
        removeListener: (h: UpdatedHandler) => updatedHandlers.delete(h),
      },
      onActivated: {
        addListener: (h: () => void) => activatedHandlers.add(h),
        removeListener: (h: () => void) => activatedHandlers.delete(h),
      },
    },
    runtime: { getManifest: () => ({ version: "0.1.0" }) },
  });
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
  cleanup();
  useSidepanelStore.getState().reset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const fireUpdated = (tabId: number, status: string, active: boolean) =>
  updatedHandlers.forEach((h) => h(tabId, { status }, { active }));

describe("App auto-connect", () => {
  it("dials the page channel and the bridge on mount", async () => {
    render(<App />);
    await act(async () => {});

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]?.url).toBe("ws://127.0.0.1:47321");
    expect(useSidepanelStore.getState().status).toBe("connecting");
    expect(useSidepanelStore.getState().bridgeStatus).toBe("connecting");
  });

  it("re-dials when the active tab finishes loading (page refresh)", async () => {
    render(<App />);
    await act(async () => {});
    expect(connectSpy).toHaveBeenCalledTimes(1);

    // Still loading — the content script is not there yet.
    await act(async () => fireUpdated(1, "loading", true));
    expect(connectSpy).toHaveBeenCalledTimes(1);

    await act(async () => fireUpdated(1, "complete", true));
    expect(connectSpy).toHaveBeenCalledTimes(2);

    // A background tab finishing its load must not steal the panel.
    await act(async () => fireUpdated(2, "complete", false));
    expect(connectSpy).toHaveBeenCalledTimes(2);
  });

  it("re-dials when the active tab changes", async () => {
    render(<App />);
    await act(async () => {});
    expect(connectSpy).toHaveBeenCalledTimes(1);

    await act(async () => activatedHandlers.forEach((h) => h()));
    expect(connectSpy).toHaveBeenCalledTimes(2);
  });

  it("re-dials a dropped bridge after a short delay, not instantly", async () => {
    vi.useFakeTimers();
    render(<App />);
    await act(async () => {});
    expect(FakeWebSocket.instances).toHaveLength(1);

    // The socket drops (bridge restarted) — the retry waits 2s.
    act(() => useSidepanelStore.setState({ bridgeStatus: "offline" }));
    act(() => void vi.advanceTimersByTime(1999));
    expect(FakeWebSocket.instances).toHaveLength(1);
    act(() => void vi.advanceTimersByTime(1));
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(useSidepanelStore.getState().bridgeStatus).toBe("connecting");
  });

  it("does not re-dial the bridge when a manual reconnect is already in flight", async () => {
    vi.useFakeTimers();
    render(<App />);
    await act(async () => {});
    expect(FakeWebSocket.instances).toHaveLength(1);

    act(() => useSidepanelStore.setState({ bridgeStatus: "offline" }));
    // The user (or the previous retry) dials before the timer fires.
    act(() => useSidepanelStore.setState({ bridgeStatus: "connecting" }));
    act(() => void vi.advanceTimersByTime(5000));
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("switches between the preview and agent tabs", async () => {
    render(<App />);
    await act(async () => {});

    // 默认预览 tab：空态提示 + 大选取按钮（图1）。
    expect(screen.getByText(/编辑卡里调整/)).toBeTruthy();
    expect(screen.queryByPlaceholderText("请输入修改指令...")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "智能体" }));
    expect(screen.getByPlaceholderText("请输入修改指令...")).toBeTruthy();
    expect(screen.queryByText(/编辑卡里调整/)).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "预览" }));
    expect(screen.getByText(/编辑卡里调整/)).toBeTruthy();
  });

  it("removes the tab listeners and skips the bridge retry on unmount", async () => {
    vi.useFakeTimers();
    const { unmount } = render(<App />);
    await act(async () => {});
    unmount();

    expect(updatedHandlers.size).toBe(0);
    expect(activatedHandlers.size).toBe(0);
    // reset() inside the cleanup drops the bridge offline — no retry may fire.
    act(() => void vi.advanceTimersByTime(5000));
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
