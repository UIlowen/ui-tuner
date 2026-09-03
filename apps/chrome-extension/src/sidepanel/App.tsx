import { useCallback, useEffect, useState } from "react";
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
import { ApplySection } from "./components/ApplySection";
import { ChangesTab } from "./components/ChangesTab";
import { StylePanel } from "../style-editor/StylePanel";
import { StyleEditContext } from "../style-editor/StyleEditContext";
import { formatChangesetForCopy } from "./format-changeset";

function isLocalhostUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
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

/**
 * Local bridge status (plan §35: offline never blocks preview editing).
 * Offline → guidance card in the status zone; connected → one slim line.
 */
function BridgeStatus() {
  const t = useT();
  const bridgeStatus = useSidepanelStore((s) => s.bridgeStatus);
  const bridgeProject = useSidepanelStore((s) => s.bridgeProject);
  const bridgeDevServerUrl = useSidepanelStore((s) => s.bridgeDevServerUrl);

  if (bridgeStatus === "connected") {
    return (
      <p className="flex items-center gap-1.5 px-1 text-[10px] text-faint">
        <span className="size-1.5 rounded-full bg-emerald-400" />
        <span className="font-medium tracking-wider uppercase">{t("bridge.title")}</span>
        <span className="font-mono text-dim">{bridgeProject?.framework}</span>
        {bridgeDevServerUrl && (
          <span className="ml-auto truncate font-mono" title={bridgeDevServerUrl}>
            {bridgeDevServerUrl.replace("http://", "")}
          </span>
        )}
      </p>
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

/** Slim one-line element header above the style editor (replaces SelectionCard). */
function EditorHeader() {
  const t = useT();
  const selection = useSidepanelStore((s) => s.selection);
  const source = useSidepanelStore((s) => s.source);
  if (!selection) return null;
  const { element } = selection;

  // Plan §20: three honest states — never fabricate a source location.
  const badge =
    source?.confidence === "exact"
      ? { labelKey: "source.exact" as const, className: "bg-emerald-500/15 text-ok-text" }
      : source?.confidence === "inferred"
        ? { labelKey: "source.inferred" as const, className: "bg-amber-500/15 text-warn-text" }
        : { labelKey: "source.previewOnly" as const, className: "bg-control text-faint" };

  return (
    <div className="flex items-baseline gap-2 border-b border-edge pb-1.5">
      <span className="truncate font-mono text-[12px] font-semibold text-accent-text">
        {"<"}
        {element.tagName}
        {">"}
      </span>
      <span className="font-mono text-[10px] text-dim tabular-nums">
        {element.bounds.width} × {element.bounds.height}
      </span>
      <span className={`ml-auto rounded px-1 py-px text-[9px] ${badge.className}`}>
        {t(badge.labelKey)}
      </span>
    </div>
  );
}

/** Sticky footer (annotation mode OFF, changes exist): copy all + send to agent. */
function FooterActions() {
  const t = useT();
  const changes = useSidepanelStore((s) => s.changes);
  const elementNames = useSidepanelStore((s) => s.elementNames);
  const selection = useSidepanelStore((s) => s.selection);
  const source = useSidepanelStore((s) => s.source);
  const [copied, setCopied] = useState(false);

  const copyChanges = async () => {
    try {
      await navigator.clipboard.writeText(
        formatChangesetForCopy({ changes, elementNames, source, selection }),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <footer className="flex shrink-0 items-start gap-2 border-t border-edge px-3 py-2.5">
      <button
        type="button"
        onClick={() => void copyChanges()}
        title={t("changes.copyTitle")}
        className="shrink-0 rounded-md bg-sky-500/15 px-2.5 py-1.5 text-[11px] font-medium text-info-text ring-1 ring-sky-500/40 transition-colors hover:bg-sky-500/25"
      >
        {copied ? t("action.copied") : t("changes.copy")}
      </button>
      <div className="min-w-0 flex-1">
        <ApplySection />
      </div>
    </footer>
  );
}

/**
 * Two-state annotation-mode panel:
 *  - picking ON  → pick button (exit label) + slim-header editor + "done with
 *    this element" (clears the selection, keeps annotation mode on)
 *  - picking OFF → changes grouped per element + collapsed Agent settings +
 *    sticky footer (copy all / send to agent)
 * Debug-only blocks were removed — the header pill and status zone carry the
 * connection truth.
 */
export function App() {
  const t = useT();
  const status = useSidepanelStore((s) => s.status);
  const statusError = useSidepanelStore((s) => s.statusError);
  const picking = useSidepanelStore((s) => s.picking);
  const selection = useSidepanelStore((s) => s.selection);
  const changes = useSidepanelStore((s) => s.changes);
  const setPicking = useSidepanelStore((s) => s.setPicking);
  const clearSelection = useSidepanelStore((s) => s.clearSelection);
  const cancelElement = useSidepanelStore((s) => s.cancelElement);
  const styleValues = useSidepanelStore((s) => s.styleValues);
  const updateStyle = useSidepanelStore((s) => s.updateStyle);
  const [agentOpen, setAgentOpen] = useState(false);

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

  const pickButtonLabel = picking ? t("pick.exit") : t("pick.start");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-edge px-3 py-2.5">
        <h1 className="text-[13px] font-semibold tracking-tight">UI Tuner</h1>
        <span className="flex items-center">
          <PrefsToggles />
          <StatusPill status={status} />
        </span>
      </header>

      <main className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-2.5">
        {/* Status zone: connection errors and bridge state live here. */}
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
        <BridgeStatus />

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
          {picking && status === "connected" && !selection && (
            <p className="mt-1.5 text-center text-[10px] text-info-text/80">{t("pick.hint")}</p>
          )}
        </section>

        {/* Annotation mode ON + element selected: the editor. */}
        {picking && selection && (
          <>
            <section className="rounded-md border border-edge bg-surface px-3 py-2.5">
              <EditorHeader />
              <div className="mt-1.5">
                {styleValues && (
                  <StyleEditContext.Provider value={{ values: styleValues, updateStyle }}>
                    <StylePanel />
                  </StyleEditContext.Provider>
                )}
              </div>
            </section>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelElement}
                className="rounded-md border border-edge px-3 py-1.5 text-[12px] font-medium text-dim transition-colors hover:bg-control hover:text-text"
              >
                {t("action.cancel")}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="flex-1 rounded-md border border-edge-strong px-3 py-1.5 text-[12px] font-medium text-text transition-colors hover:bg-control"
              >
                {t("done.element")}
              </button>
            </div>
          </>
        )}

        {/* Annotation mode OFF: changes list + collapsed agent settings. */}
        {!picking && (
          <>
            <ChangesTab />
            <section className="rounded-md border border-edge bg-surface px-3 py-2.5">
              <button
                type="button"
                onClick={() => setAgentOpen(!agentOpen)}
                className="flex w-full items-center gap-1.5 text-[10px] font-medium tracking-wider text-faint uppercase"
              >
                <span
                  className={`inline-block transition-transform ${agentOpen ? "rotate-90" : ""}`}
                >
                  ▸
                </span>
                {t("agent.advancedSettings")}
              </button>
              {agentOpen && (
                <div className="mt-2">
                  <AgentTab />
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {!picking && changes.length > 0 && <FooterActions />}
    </div>
  );
}
