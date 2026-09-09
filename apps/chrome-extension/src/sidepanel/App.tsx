import { useCallback, useEffect, useState } from "react";
import { Channel } from "../messaging/channel";
import { BridgeChannel } from "../messaging/bridge-channel";
import {
  registerCaptureHandler,
  reportConnectFailure,
  useSidepanelStore,
  type ConnectionStatus,
} from "../state/sidepanel-store";
import { usePrefsStore } from "../state/prefs";
import { useT } from "../i18n/use-t";
import type { MessageKey } from "../i18n/messages";
import {
  BotIcon,
  ContrastIcon,
  CopyIcon,
  EyeIcon,
  MoonIcon,
  SunIcon,
  WarningIcon,
} from "../ui/icons";
import { AgentTab } from "./components/AgentTab";
import { ChangesTab, PickButton } from "./components/ChangesTab";
import { formatChangesetForCopy } from "./format-changeset";

function isLocalhostUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/** "localhost: 5173" from a dev-server or page URL; null when nothing to show. */
function hostPort(url: string | null): string | null {
  if (!url) return null;
  try {
    const { hostname, port } = new URL(url);
    return port ? `${hostname}: ${port}` : hostname;
  } catch {
    return null;
  }
}

/** Header badge next to the title: one pill carrying the connection truth. */
function StatusBadge({ status }: { status: ConnectionStatus }) {
  const t = useT();
  const meta: Record<ConnectionStatus, { labelKey: MessageKey; cls: string; dot: string }> = {
    idle: { labelKey: "status.idle", cls: "bg-control text-faint", dot: "bg-ghost" },
    connecting: {
      labelKey: "status.connecting",
      cls: "bg-amber-500/15 text-warn-text",
      dot: "bg-amber-400",
    },
    connected: {
      labelKey: "status.connected",
      cls: "bg-live/12 text-live",
      dot: "bg-live",
    },
    disconnected: {
      labelKey: "status.disconnected",
      cls: "bg-red-500/15 text-danger-text",
      dot: "bg-red-400",
    },
  };
  const { labelKey, cls, dot } = meta[status];
  return (
    <span
      className={`flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10px] font-medium ${cls}`}
    >
      <span className={`size-1.5 rounded-full ${dot}`} />
      {t(labelKey)}
    </span>
  );
}

/** Language + theme toggles, right side of the status row. */
function PrefsToggles() {
  const t = useT();
  const locale = usePrefsStore((s) => s.locale);
  const theme = usePrefsStore((s) => s.theme);
  const setLocale = usePrefsStore((s) => s.setLocale);
  const cycleTheme = usePrefsStore((s) => s.cycleTheme);

  const themeLabelKey: MessageKey =
    theme === "light" ? "theme.light" : theme === "dark" ? "theme.dark" : "theme.system";
  // The button shows what you'll get, not what you have (设计图: 暗色下是太阳)。
  const ThemeIcon = theme === "light" ? MoonIcon : theme === "dark" ? SunIcon : ContrastIcon;

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        title={t("lang.toggleTitle")}
        onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
        className="grid place-items-center rounded-control bg-control p-[5px] text-[12px] leading-none font-semibold text-text transition-colors hover:bg-brand/20 hover:text-text-strong"
      >
        {locale === "zh" ? "EN" : "中"}
      </button>
      <button
        type="button"
        title={t("theme.toggleTitle", { label: t(themeLabelKey) })}
        aria-label={t("theme.toggleTitle", { label: t(themeLabelKey) })}
        onClick={cycleTheme}
        className="grid place-items-center rounded-control bg-control p-[5px] text-text transition-colors hover:bg-brand/20 hover:text-text-strong"
      >
        <ThemeIcon className="size-4" />
      </button>
    </span>
  );
}

/**
 * The two-line status zone under the header: dev server (or page) address
 * with the page-connection dot, then the Bridge line — which doubles as the
 * reconnect button while offline (auto-redial also runs, see App useEffect).
 */
function StatusLines() {
  const t = useT();
  const status = useSidepanelStore((s) => s.status);
  const pageUrl = useSidepanelStore((s) => s.pageUrl);
  const bridgeStatus = useSidepanelStore((s) => s.bridgeStatus);
  const bridgeProject = useSidepanelStore((s) => s.bridgeProject);
  const bridgeDevServerUrl = useSidepanelStore((s) => s.bridgeDevServerUrl);

  const address = hostPort(bridgeDevServerUrl ?? pageUrl);
  const bridgeLabel =
    bridgeStatus === "connected"
      ? (bridgeProject?.framework ?? "Unknown")
      : bridgeStatus === "connecting"
        ? t("bridge.connecting")
        : t("bridge.offline");

  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p
          className={`flex items-center gap-1.5 text-[12px] leading-tight ${
            status === "connected" ? "text-ok-text" : "text-text"
          }`}
        >
          <span
            className={`size-1.5 shrink-0 rounded-full ${
              status === "connected" ? "bg-ok-text" : "bg-ghost"
            }`}
          />
          <span className="truncate font-mono">{address ?? "—"}</span>
        </p>
        <p className="mt-0 text-[12px] leading-tight text-faint">
          {t("bridge.title")}：
          {bridgeStatus === "offline" ? (
            <button
              type="button"
              onClick={() => dialBridge()}
              title={t("action.reconnect")}
              className="hover:text-text"
            >
              {bridgeLabel}
            </button>
          ) : (
            <span className="font-mono">{bridgeLabel}</span>
          )}
        </p>
      </div>
      <PrefsToggles />
    </div>
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

type PanelTab = "preview" | "agent";

/** Preview / Agent tab bar (the design's eye + bot icons, purple active). */
function TabBar({ tab, onChange }: { tab: PanelTab; onChange(tab: PanelTab): void }) {
  const t = useT();
  const tabs: { key: PanelTab; labelKey: MessageKey; icon: typeof EyeIcon }[] = [
    { key: "preview", labelKey: "tab.preview", icon: EyeIcon },
    { key: "agent", labelKey: "tab.agent", icon: BotIcon },
  ];
  return (
    <div role="tablist" className="flex shrink-0 bg-brand/8">
      {tabs.map(({ key, labelKey, icon: Icon }) => {
        const active = tab === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={`relative flex flex-1 items-center justify-center gap-1 py-3 text-[14px] font-medium transition-colors ${
              active ? "text-brand-hover" : "text-faint hover:text-dim"
            }`}
          >
            <Icon className="size-5" />
            {t(labelKey)}
            {/* 选中横条：图标+文字下方的短条（设计稿 w-100px），不是整 tab 宽。 */}
            <span
              className={`absolute bottom-0 left-1/2 h-0.5 -translate-x-1/2 rounded-full transition-all ${
                active ? "w-[100px] bg-brand-hover" : "w-0"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

/** Sticky footer on the Preview tab (items exist): pick + copy all. */
function FooterActions() {
  const t = useT();
  const changes = useSidepanelStore((s) => s.changes);
  const elementNames = useSidepanelStore((s) => s.elementNames);
  const instructions = useSidepanelStore((s) => s.instructions);
  const selection = useSidepanelStore((s) => s.selection);
  const source = useSidepanelStore((s) => s.source);
  const [copied, setCopied] = useState(false);

  const copyChanges = async () => {
    try {
      await navigator.clipboard.writeText(
        formatChangesetForCopy({ changes, elementNames, instructions, source, selection }),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <footer className="flex shrink-0 items-center gap-4 px-5 py-3">
      <PickButton className="h-11 w-[110px] shrink-0" />
      <button
        type="button"
        onClick={() => void copyChanges()}
        title={t("changes.copyTitle")}
        className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-brand/12 text-[14px] font-medium text-text/90 transition-colors hover:bg-brand hover:text-white"
      >
        <CopyIcon className="size-4" />
        {copied ? t("action.copied") : t("changes.copy")}
      </button>
    </footer>
  );
}

/**
 * Editing happens in the page-side editor card; the panel is a two-tab
 * companion — Preview (changes list + pick/copy) and Agent (prompt hand-off).
 * The header badge and the status lines carry the connection truth.
 */
export function App() {
  const t = useT();
  const status = useSidepanelStore((s) => s.status);
  const statusError = useSidepanelStore((s) => s.statusError);
  const changes = useSidepanelStore((s) => s.changes);
  const instructions = useSidepanelStore((s) => s.instructions);
  const [tab, setTab] = useState<PanelTab>("preview");

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

    // Auto-reconnect, page side: a reload kills the content-script port and a
    // tab switch strands the panel on the old page — re-dial on both. The
    // store's stale-guards ignore a late disconnect from the previous port.
    const handleTabUpdated = (
      _tabId: number,
      changeInfo: { status?: string },
      tab: { active?: boolean },
    ): void => {
      if (changeInfo.status === "complete" && tab.active) void openChannel();
    };
    const handleTabActivated = (): void => void openChannel();
    chrome.tabs.onUpdated.addListener(handleTabUpdated);
    chrome.tabs.onActivated.addListener(handleTabActivated);

    // Auto-reconnect, bridge side: restarting the bridge (a dev-loop constant)
    // drops the socket — poll every 2s until it answers again.
    let bridgeRetry: ReturnType<typeof setTimeout> | null = null;
    const unsubscribeBridge = useSidepanelStore.subscribe((state, previous) => {
      if (state.bridgeStatus !== "offline" || previous.bridgeStatus === "offline") return;
      if (bridgeRetry !== null) clearTimeout(bridgeRetry);
      bridgeRetry = setTimeout(() => {
        bridgeRetry = null;
        // A manual 重新连接 may already be in flight — don't double-dial.
        if (useSidepanelStore.getState().bridgeStatus === "offline") dialBridge();
      }, 2000);
    });

    return () => {
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
      chrome.tabs.onActivated.removeListener(handleTabActivated);
      if (bridgeRetry !== null) clearTimeout(bridgeRetry);
      // Unsubscribe BEFORE reset() — reset drops the bridge to offline, which
      // would otherwise schedule a retry on a dead panel.
      unsubscribeBridge();
      registerCaptureHandler(null);
      useSidepanelStore.getState().reset();
    };
  }, [openChannel]);

  const hasItems = changes.length > 0 || Object.keys(instructions).length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-edge px-[18px] py-4">
        <h1 className="text-[14px] font-semibold tracking-tight">UI Tuner</h1>
        <StatusBadge status={status} />
      </header>

      {/* 状态区：设计稿无下边框，靠 py-14 与下方紫 tab 带自然分隔。 */}
      <div className="shrink-0 px-[18px] py-[14px]">
        <StatusLines />
      </div>

      <TabBar tab={tab} onChange={setTab} />

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-2.5">
        {tab === "preview" ? <ChangesTab /> : <AgentTab />}
      </main>

      {/* 断连横幅钉在面板底部（main 之上、页脚之上），单行：左文字右按钮。 */}
      {status === "disconnected" && (
        <section className="mx-4 my-3 flex shrink-0 items-center justify-between gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-danger-text">
          <p className="flex min-w-0 items-center gap-2 text-[12px] leading-relaxed">
            <WarningIcon className="size-4 shrink-0" />
            <span className="truncate">{statusError ?? t("error.notConnected")}</span>
          </p>
          <button
            type="button"
            onClick={() => void openChannel()}
            className="shrink-0 rounded-control border border-red-500/40 px-2.5 py-1 text-[11px] font-medium hover:bg-red-500/20"
          >
            {t("action.reconnect")}
          </button>
        </section>
      )}

      {tab === "preview" && hasItems && <FooterActions />}
    </div>
  );
}
