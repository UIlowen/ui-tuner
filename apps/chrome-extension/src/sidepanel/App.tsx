import { Fragment, useCallback, useEffect, useState } from "react";
import { Channel } from "../messaging/channel";
import { BridgeChannel } from "../messaging/bridge-channel";
import {
  registerCaptureHandler,
  reportConnectFailure,
  useSidepanelStore,
  type BridgeStatus,
  type ConnectionStatus,
} from "../state/sidepanel-store";
import { usePrefsStore } from "../state/prefs";
import { useT } from "../i18n/use-t";
import type { MessageKey } from "../i18n/messages";
import { AgentTab } from "./components/AgentTab";
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

const STATUS_META: Record<ConnectionStatus, { labelKey: MessageKey; dot: string; text: string }> = {
  idle: { labelKey: "status.idle", dot: "bg-zinc-500", text: "text-faint" },
  connecting: { labelKey: "status.connecting", dot: "bg-amber-400", text: "text-warn-text" },
  connected: { labelKey: "status.connected", dot: "bg-emerald-400", text: "text-ok-text" },
  disconnected: { labelKey: "status.disconnected", dot: "bg-red-400", text: "text-danger-text" },
};

const BRIDGE_META: Record<BridgeStatus, { labelKey: MessageKey; dot: string; text: string }> = {
  connecting: { labelKey: "bridge.connecting", dot: "bg-amber-400", text: "text-warn-text" },
  connected: { labelKey: "bridge.connected", dot: "bg-emerald-400", text: "text-ok-text" },
  offline: { labelKey: "bridge.offline", dot: "bg-zinc-600", text: "text-faint" },
};

function StatusPill({ status }: { status: ConnectionStatus }) {
  const t = useT();
  const meta = STATUS_META[status];
  return (
    <span className={`flex items-center gap-1.5 text-[11px] font-medium ${meta.text}`}>
      <span className={`size-1.5 rounded-full ${meta.dot}`} />
      {t(meta.labelKey)}
    </span>
  );
}

/** Language + theme toggles, right side of the header. */
function PrefsToggles() {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const theme = usePrefsStore((s) => s.theme);
  const setLocale = usePrefsStore((s) => s.setLocale);
  const cycleTheme = usePrefsStore((s) => s.cycleTheme);

  const themeLabelKey: MessageKey =
    theme === "light" ? "theme.light" : theme === "dark" ? "theme.dark" : "theme.system";
  const themeIcon = theme === "light" ? "☀" : theme === "dark" ? "☾" : "◐";

  return (
    <span className="mr-1 flex items-center gap-0.5">
      <button
        type="button"
        title={t("lang.toggleTitle")}
        onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
        className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-faint transition-colors hover:bg-control hover:text-text"
      >
        {locale === "zh" ? "中" : "EN"}
      </button>
      <button
        type="button"
        title={t("theme.toggleTitle", { label: t(themeLabelKey) })}
        onClick={cycleTheme}
        className="rounded px-1.5 py-0.5 text-[11px] text-faint transition-colors hover:bg-control hover:text-text"
      >
        {themeIcon}
      </button>
    </span>
  );
}

/** Local bridge status line (plan §35: offline never blocks preview editing). */
function BridgeCard() {
  const t = useT();
  const bridgeStatus = useSidepanelStore((s) => s.bridgeStatus);
  const bridgeProject = useSidepanelStore((s) => s.bridgeProject);
  const bridgeDevServerUrl = useSidepanelStore((s) => s.bridgeDevServerUrl);

  if (bridgeStatus === "connected") {
    return (
      <section className="flex items-center gap-2 rounded-md border border-edge bg-surface px-3 py-2">
        <span className="text-[10px] font-medium tracking-wider text-faint uppercase">
          {t("bridge.title")}
        </span>
        <span className="font-mono text-[11px] text-text">{bridgeProject?.framework}</span>
        {bridgeDevServerUrl && (
          <span
            className="ml-auto truncate font-mono text-[10px] text-faint"
            title={bridgeDevServerUrl}
          >
            {bridgeDevServerUrl.replace("http://", "")}
          </span>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-md border border-edge bg-surface px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium tracking-wider text-faint uppercase">
          {t("bridge.title")}
        </span>
        <span className={`text-[11px] font-medium ${BRIDGE_META[bridgeStatus].text}`}>
          {t(BRIDGE_META[bridgeStatus].labelKey)}
        </span>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-faint">{t("bridge.offlineHint")}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="rounded bg-control px-1.5 py-0.5 font-mono text-[10px] text-dim">
          npx ui-tuner
        </code>
        <button
          type="button"
          onClick={() => dialBridge()}
          disabled={bridgeStatus === "connecting"}
          className="rounded border border-edge-strong px-2 py-0.5 text-[10px] font-medium text-text enabled:hover:bg-control disabled:opacity-40"
        >
          {t("action.reconnect")}
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
  const t = useT();
  const selection = useSidepanelStore((s) => s.selection);
  const source = useSidepanelStore((s) => s.source);
  const selectAncestor = useSidepanelStore((s) => s.selectAncestor);

  if (!selection) return null;
  const { element, breadcrumb } = selection;

  // Plan §20: three honest states — never fabricate a source location.
  const badge =
    source?.confidence === "exact"
      ? { labelKey: "source.exact" as const, className: "bg-emerald-500/15 text-ok-text" }
      : source?.confidence === "inferred"
        ? { labelKey: "source.inferred" as const, className: "bg-amber-500/15 text-warn-text" }
        : { labelKey: "source.previewOnly" as const, className: "bg-control text-faint" };

  return (
    <section className="rounded-md border border-edge bg-surface px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-mono text-[13px] font-semibold text-accent-text">
          {"<"}
          {element.tagName}
          {">"}
        </span>
        <span className="flex shrink-0 items-baseline gap-2">
          <span className={`rounded px-1 py-px text-[9px] ${badge.className}`}>
            {t(badge.labelKey)}
          </span>
          <span className="font-mono text-[11px] text-dim tabular-nums">
            {element.bounds.width} × {element.bounds.height}
          </span>
        </span>
      </div>
      <p className="mt-0.5 truncate font-mono text-[10px] text-faint" title={element.selector}>
        {element.selector}
      </p>

      {source?.confidence === "exact" && source.file && (
        <p
          className="mt-1 truncate font-mono text-[10px] text-ok-text/80"
          title={`${source.file}:${source.line}`}
        >
          {source.componentName ?? element.tagName} · {source.file}
          {source.line !== undefined ? `:${source.line}` : ""}
        </p>
      )}
      {source?.confidence === "inferred" && source.file && (
        <p className="mt-1 truncate font-mono text-[10px] text-warn-text/80" title={source.file}>
          {t("source.possible")}
          {source.componentName ? `${source.componentName} · ` : ""}
          {source.file}
        </p>
      )}

      {element.text && (
        <p className="mt-1 truncate text-[11px] text-dim" title={element.text}>
          “{element.text}”
        </p>
      )}

      <div className="mt-2 flex items-center gap-1 overflow-x-auto pb-0.5">
        {breadcrumb.map((item, index) => (
          <Fragment key={item.id}>
            {index > 0 && <span className="shrink-0 text-[10px] text-ghost">↑</span>}
            <button
              type="button"
              onClick={() => selectAncestor(item.id)}
              title={t("selection.selectAncestor", { tag: item.tagName })}
              className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] ${
                index === 0
                  ? "bg-violet-500/20 text-accent-text"
                  : "bg-control text-dim hover:bg-control-hover hover:text-text"
              }`}
            >
              {item.tagName}
            </button>
          </Fragment>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-ghost">{t("selection.hint")}</p>
    </section>
  );
}

/**
 * Milestone 3 Side Panel: select element → Style Inspector tabs
 * (Style / Agent / Changes) with live preview scrubbing (plan §8/§9/§10/§11).
 * Agent tab is a placeholder until Milestone 7.
 */
export function App() {
  const t = useT();
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
      reportConnectFailure(t("error.noActiveTab"));
      return;
    }
    if (tab.url !== undefined && !isLocalhostUrl(tab.url)) {
      reportConnectFailure(t("error.localhostOnly"));
      return;
    }
    try {
      useSidepanelStore.getState().connect(Channel.connectToTab(tab.id));
    } catch {
      reportConnectFailure(t("error.connectFailed"));
    }
    // t is stable per locale; re-running openChannel on locale switch is harmless.
  }, [t]);

  useEffect(() => {
    void openChannel();
    dialBridge();
    // M7 ui_capture (plan §27): screenshot capture needs the chrome API, which
    // lives in this layer — inject it so the store stays chrome-free/testable.
    registerCaptureHandler(async (withScreenshot) => {
      if (!withScreenshot) return undefined;
      try {
        return await chrome.tabs.captureVisibleTab({ format: "png" });
      } catch {
        return undefined;
      }
    });
    return () => {
      registerCaptureHandler(null);
      useSidepanelStore.getState().reset();
    };
  }, [openChannel]);

  const pickButtonLabel = picking
    ? t("pick.cancel")
    : selection
      ? t("pick.repick")
      : t("pick.start");

  const tabs: { id: TabId; label: string }[] = [
    { id: "style", label: t("tab.style") },
    { id: "agent", label: t("tab.agent") },
    {
      id: "changes",
      label: changes.length > 0 ? `${t("tab.changes")} ${changes.length}` : t("tab.changes"),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-edge px-3 py-2.5">
        <h1 className="text-[13px] font-semibold tracking-tight">UI Tuner</h1>
        <span className="flex items-center">
          <PrefsToggles />
          <StatusPill status={status} />
        </span>
      </header>

      <main className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {status === "disconnected" && (
          <section className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-danger-text">
            <p className="text-[12px] leading-relaxed">{statusError ?? t("error.notConnected")}</p>
            <button
              type="button"
              onClick={() => void openChannel()}
              className="mt-2 rounded border border-red-500/40 px-2.5 py-1 text-[11px] font-medium hover:bg-red-500/20"
            >
              {t("action.reconnect")}
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
                ? "bg-sky-500/20 text-info-text ring-1 ring-sky-500/60"
                : "bg-inverse text-inverse-text enabled:hover:bg-inverse-hover disabled:opacity-40"
            }`}
          >
            {pickButtonLabel}
          </button>
          {picking && status === "connected" && (
            <p className="mt-1.5 text-center text-[10px] text-info-text/80">{t("pick.hint")}</p>
          )}
        </section>

        {selection ? (
          <SelectionCard />
        ) : status === "connected" && !picking ? (
          <section className="rounded-md border border-dashed border-edge px-3 py-2.5 text-center text-[11px] text-ghost">
            {t("selection.empty")}
          </section>
        ) : null}

        <BridgeCard />

        <nav className="flex gap-1 rounded-md bg-surface p-1 ring-1 ring-edge" role="tablist">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                tab === item.id
                  ? "bg-elevated text-text-strong"
                  : "text-faint hover:bg-control hover:text-dim"
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
            <section className="rounded-md border border-dashed border-edge px-3 py-4 text-center text-[11px] leading-relaxed text-ghost">
              {t("style.emptyHint1")}
              <br />
              {t("style.emptyHint2")}
            </section>
          ))}

        {tab === "agent" && <AgentTab />}

        {tab === "changes" && <ChangesTab />}

        {tab === "style" && (
          <>
            <section className="rounded-md border border-edge bg-surface px-3 py-2.5">
              <p className="text-[10px] font-medium tracking-wider text-faint uppercase">
                {t("page.title")}
              </p>
              {pageTitle !== null ? (
                <>
                  <p className="mt-1 truncate text-[12px] font-medium" title={pageTitle}>
                    {pageTitle}
                  </p>
                  <p
                    className="mt-0.5 truncate text-[11px] text-dim"
                    title={pageUrl ?? undefined}
                  >
                    {pageUrl}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-[12px] text-faint">{t("page.waiting")}</p>
              )}
            </section>

            <section className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => useSidepanelStore.getState().ping()}
                disabled={status !== "connected"}
                className="flex-1 rounded-md bg-control px-3 py-1.5 text-[12px] font-medium text-text enabled:hover:bg-control-hover disabled:opacity-40"
              >
                {t("page.ping")}
              </button>
              {lastRttMs !== null && (
                <span className="rounded bg-control px-2 py-1 text-[11px] text-ok-text tabular-nums">
                  {lastRttMs} ms
                </span>
              )}
            </section>

            <section className="min-h-0">
              <p className="mb-1.5 text-[10px] font-medium tracking-wider text-faint uppercase">
                {t("log.title")}
              </p>
              {log.length === 0 ? (
                <p className="text-[11px] text-ghost">{t("log.empty")}</p>
              ) : (
                <ul className="space-y-1">
                  {log.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-2 font-mono text-[11px]">
                      <span
                        className={entry.direction === "out" ? "text-info-text" : "text-ok-text"}
                      >
                        {entry.direction === "out" ? "→" : "←"}
                      </span>
                      <span className="text-text">{entry.type}</span>
                      <span className="ml-auto text-ghost tabular-nums">
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
