import { useCallback, useEffect } from "react";
import { Channel } from "../messaging/channel";
import {
  reportConnectFailure,
  useSidepanelStore,
  type ConnectionStatus,
} from "../state/sidepanel-store";

function isLocalhostUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function formatTime(at: number): string {
  return new Date(at).toISOString().slice(11, 23);
}

const STATUS_META: Record<ConnectionStatus, { label: string; dot: string; text: string }> = {
  idle: { label: "Idle", dot: "bg-zinc-500", text: "text-zinc-400" },
  connecting: { label: "Connecting…", dot: "bg-amber-400", text: "text-amber-300" },
  connected: { label: "Connected", dot: "bg-emerald-400", text: "text-emerald-300" },
  disconnected: { label: "Disconnected", dot: "bg-red-400", text: "text-red-300" },
};

function StatusPill({ status }: { status: ConnectionStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`flex items-center gap-1.5 text-[11px] font-medium ${meta.text}`}>
      <span className={`size-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

/**
 * Milestone 1 Side Panel: proves the bidirectional channel between the Side
 * Panel and the Content Script (connect → page info, ping → pong with RTT).
 * Element Picker (Milestone 2) replaces the Ping playground with the Style
 * Inspector.
 */
export function App() {
  const status = useSidepanelStore((s) => s.status);
  const statusError = useSidepanelStore((s) => s.statusError);
  const pageTitle = useSidepanelStore((s) => s.pageTitle);
  const pageUrl = useSidepanelStore((s) => s.pageUrl);
  const lastRttMs = useSidepanelStore((s) => s.lastRttMs);
  const log = useSidepanelStore((s) => s.log);

  const openChannel = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      reportConnectFailure("No active tab found.");
      return;
    }
    if (tab.url !== undefined && !isLocalhostUrl(tab.url)) {
      reportConnectFailure(
        "UI Tuner only runs on local dev pages (http://localhost / http://127.0.0.1).",
      );
      return;
    }
    try {
      useSidepanelStore.getState().connect(Channel.connectToTab(tab.id));
    } catch {
      reportConnectFailure(
        "Could not connect to this page. The content script only runs on localhost pages — reload the page and retry.",
      );
    }
  }, []);

  useEffect(() => {
    void openChannel();
    return () => useSidepanelStore.getState().reset();
  }, [openChannel]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-2.5">
        <h1 className="text-[13px] font-semibold tracking-tight">UI Tuner</h1>
        <StatusPill status={status} />
      </header>

      <main className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {status === "disconnected" && (
          <section className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2.5 text-red-200">
            <p className="text-[12px] leading-relaxed">{statusError ?? "Not connected."}</p>
            <button
              type="button"
              onClick={() => void openChannel()}
              className="mt-2 rounded border border-red-800 px-2.5 py-1 text-[11px] font-medium hover:bg-red-900/40"
            >
              Reconnect
            </button>
          </section>
        )}

        <section className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
          <p className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">Page</p>
          {pageTitle !== null ? (
            <>
              <p className="mt-1 truncate text-[12px] font-medium" title={pageTitle}>
                {pageTitle}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-zinc-400" title={pageUrl ?? undefined}>
                {pageUrl}
              </p>
            </>
          ) : (
            <p className="mt-1 text-[12px] text-zinc-500">Waiting for page…</p>
          )}
        </section>

        <section className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => useSidepanelStore.getState().ping()}
            disabled={status !== "connected"}
            className="flex-1 rounded-md bg-zinc-100 px-3 py-1.5 text-[12px] font-semibold text-zinc-900 enabled:hover:bg-white disabled:opacity-40"
          >
            Ping page
          </button>
          {lastRttMs !== null && (
            <span className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-emerald-400 tabular-nums">
              {lastRttMs} ms
            </span>
          )}
        </section>

        <section className="min-h-0">
          <p className="mb-1.5 text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
            Messages
          </p>
          {log.length === 0 ? (
            <p className="text-[11px] text-zinc-600">No messages yet.</p>
          ) : (
            <ul className="space-y-1">
              {log.map((entry) => (
                <li key={entry.id} className="flex items-center gap-2 font-mono text-[11px]">
                  <span className={entry.direction === "out" ? "text-sky-400" : "text-emerald-400"}>
                    {entry.direction === "out" ? "→" : "←"}
                  </span>
                  <span className="text-zinc-300">{entry.type}</span>
                  <span className="ml-auto text-zinc-600 tabular-nums">{formatTime(entry.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
