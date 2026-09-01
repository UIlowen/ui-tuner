import { Fragment, useCallback, useEffect, useState } from "react";
import { Channel } from "../messaging/channel";
import { BridgeChannel } from "../messaging/bridge-channel";
import {
  reportConnectFailure,
  useSidepanelStore,
  type BridgeStatus,
  type ConnectionStatus,
} from "../state/sidepanel-store";
import { ChangesTab } from "./components/ChangesTab";
import { StylePanel } from "./components/StylePanel";

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

const BRIDGE_META: Record<BridgeStatus, { label: string; dot: string; text: string }> = {
  connecting: { label: "Connecting…", dot: "bg-amber-400", text: "text-amber-300" },
  connected: { label: "Connected", dot: "bg-emerald-400", text: "text-emerald-300" },
  offline: { label: "Offline", dot: "bg-zinc-600", text: "text-zinc-500" },
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

/** Local bridge status line (plan §35: offline never blocks preview editing). */
function BridgeCard() {
  const bridgeStatus = useSidepanelStore((s) => s.bridgeStatus);
  const bridgeProject = useSidepanelStore((s) => s.bridgeProject);
  const bridgeDevServerUrl = useSidepanelStore((s) => s.bridgeDevServerUrl);

  if (bridgeStatus === "connected") {
    return (
      <section className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2">
        <span className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
          Bridge
        </span>
        <span className="font-mono text-[11px] text-zinc-300">{bridgeProject?.framework}</span>
        {bridgeDevServerUrl && (
          <span
            className="ml-auto truncate font-mono text-[10px] text-zinc-500"
            title={bridgeDevServerUrl}
          >
            {bridgeDevServerUrl.replace("http://", "")}
          </span>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
          Bridge
        </span>
        <span className={`text-[11px] font-medium ${BRIDGE_META[bridgeStatus].text}`}>
          {BRIDGE_META[bridgeStatus].label}
        </span>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
        Local Bridge 未连接。Preview 调整不受影响。
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
          npx ui-tuner
        </code>
        <button
          type="button"
          onClick={() => dialBridge()}
          disabled={bridgeStatus === "connecting"}
          className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-300 enabled:hover:bg-zinc-800 disabled:opacity-40"
        >
          Reconnect
        </button>
      </div>
    </section>
  );
}

/** Dial the local bridge from the side panel (plan §16; §38 loopback only). */
function dialBridge(): void {
  const { pageUrl } = useSidepanelStore.getState();
  useSidepanelStore.getState().attachBridge(BridgeChannel.connect(), {
    extensionVersion: chrome.runtime.getManifest().version,
    pageUrl,
  });
}

type TabId = "style" | "agent" | "changes";

function SelectionCard() {
  const selection = useSidepanelStore((s) => s.selection);
  const source = useSidepanelStore((s) => s.source);
  const selectAncestor = useSidepanelStore((s) => s.selectAncestor);

  if (!selection) return null;
  const { element, breadcrumb } = selection;

  // Plan §20: three honest states — never fabricate a source location.
  const badge =
    source?.confidence === "exact"
      ? { label: "● Source linked", className: "bg-emerald-500/15 text-emerald-400" }
      : source?.confidence === "inferred"
        ? { label: "● Source inferred", className: "bg-amber-500/15 text-amber-400" }
        : { label: "Preview only", className: "bg-zinc-800 text-zinc-500" };

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-mono text-[13px] font-semibold text-violet-300">
          {"<"}
          {element.tagName}
          {">"}
        </span>
        <span className="flex shrink-0 items-baseline gap-2">
          <span className={`rounded px-1 py-px text-[9px] ${badge.className}`}>{badge.label}</span>
          <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
            {element.bounds.width} × {element.bounds.height}
          </span>
        </span>
      </div>
      <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-500" title={element.selector}>
        {element.selector}
      </p>

      {source?.confidence === "exact" && source.file && (
        <p
          className="mt-1 truncate font-mono text-[10px] text-emerald-400/80"
          title={`${source.file}:${source.line}`}
        >
          {source.componentName ?? element.tagName} · {source.file}
          {source.line !== undefined ? `:${source.line}` : ""}
        </p>
      )}
      {source?.confidence === "inferred" && source.file && (
        <p className="mt-1 truncate font-mono text-[10px] text-amber-400/80" title={source.file}>
          Possible: {source.componentName ? `${source.componentName} · ` : ""}
          {source.file}
        </p>
      )}

      {element.text && (
        <p className="mt-1 truncate text-[11px] text-zinc-400" title={element.text}>
          “{element.text}”
        </p>
      )}

      <div className="mt-2 flex items-center gap-1 overflow-x-auto pb-0.5">
        {breadcrumb.map((item, index) => (
          <Fragment key={item.id}>
            {index > 0 && <span className="shrink-0 text-[10px] text-zinc-600">↑</span>}
            <button
              type="button"
              onClick={() => selectAncestor(item.id)}
              title={`选择 ${item.tagName}`}
              className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] ${
                index === 0
                  ? "bg-violet-500/20 text-violet-300"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              }`}
            >
              {item.tagName}
            </button>
          </Fragment>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-zinc-600">⌘↑ 选父级 · Esc 取消选中</p>
    </section>
  );
}

/**
 * Milestone 3 Side Panel: select element → Style Inspector tabs
 * (Style / Agent / Changes) with live preview scrubbing (plan §8/§9/§10/§11).
 * Agent tab is a placeholder until Milestone 7.
 */
export function App() {
  const status = useSidepanelStore((s) => s.status);
  const statusError = useSidepanelStore((s) => s.statusError);
  const pageTitle = useSidepanelStore((s) => s.pageTitle);
  const pageUrl = useSidepanelStore((s) => s.pageUrl);
  const lastRttMs = useSidepanelStore((s) => s.lastRttMs);
  const log = useSidepanelStore((s) => s.log);
  const picking = useSidepanelStore((s) => s.picking);
  const selection = useSidepanelStore((s) => s.selection);
  const changes = useSidepanelStore((s) => s.changes);
  const setPicking = useSidepanelStore((s) => s.setPicking);
  const [tab, setTab] = useState<TabId>("style");

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
    dialBridge();
    return () => useSidepanelStore.getState().reset();
  }, [openChannel]);

  const pickButtonLabel = picking ? "取消选取 (Esc)" : selection ? "重新选取" : "选取元素";

  const tabs: { id: TabId; label: string }[] = [
    { id: "style", label: "Style" },
    { id: "agent", label: "Agent" },
    { id: "changes", label: changes.length > 0 ? `Changes ${changes.length}` : "Changes" },
  ];

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

        <section>
          <button
            type="button"
            onClick={() => setPicking(!picking)}
            disabled={status !== "connected"}
            className={`w-full rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              picking
                ? "bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/60"
                : "bg-zinc-100 text-zinc-900 enabled:hover:bg-white disabled:opacity-40"
            }`}
          >
            {pickButtonLabel}
          </button>
          {picking && status === "connected" && (
            <p className="mt-1.5 text-center text-[10px] text-sky-300/80">点击页面中的元素</p>
          )}
        </section>

        {selection ? (
          <SelectionCard />
        ) : status === "connected" && !picking ? (
          <section className="rounded-md border border-dashed border-zinc-800 px-3 py-2.5 text-center text-[11px] text-zinc-600">
            未选中元素
          </section>
        ) : null}

        <BridgeCard />

        <nav
          className="flex gap-1 rounded-md bg-zinc-900/60 p-1 ring-1 ring-zinc-800"
          role="tablist"
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                tab === item.id
                  ? "bg-zinc-700/80 text-zinc-100"
                  : "text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {tab === "style" &&
          (selection ? (
            <StylePanel />
          ) : (
            <section className="rounded-md border border-dashed border-zinc-800 px-3 py-4 text-center text-[11px] leading-relaxed text-zinc-600">
              选取页面元素后在此调整样式
              <br />
              拖动数值实时预览 · 只改浏览器，不动源码
            </section>
          ))}

        {tab === "agent" && (
          <section className="rounded-md border border-dashed border-zinc-800 px-3 py-4 text-center text-[11px] leading-relaxed text-zinc-600">
            Agent 在 Milestone 7 上线
            <br />
            届时可把调整交给 Coding Agent 落到源码
          </section>
        )}

        {tab === "changes" && <ChangesTab />}

        {tab === "style" && (
          <>
            <section className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
              <p className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">Page</p>
              {pageTitle !== null ? (
                <>
                  <p className="mt-1 truncate text-[12px] font-medium" title={pageTitle}>
                    {pageTitle}
                  </p>
                  <p
                    className="mt-0.5 truncate text-[11px] text-zinc-400"
                    title={pageUrl ?? undefined}
                  >
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
                className="flex-1 rounded-md bg-zinc-800 px-3 py-1.5 text-[12px] font-medium text-zinc-300 enabled:hover:bg-zinc-700 disabled:opacity-40"
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
                      <span
                        className={entry.direction === "out" ? "text-sky-400" : "text-emerald-400"}
                      >
                        {entry.direction === "out" ? "→" : "←"}
                      </span>
                      <span className="text-zinc-300">{entry.type}</span>
                      <span className="ml-auto text-zinc-600 tabular-nums">
                        {formatTime(entry.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
