"use client";

import {
  Cable,
  FileText,
  Github,
  Globe2,
  Mail,
  MessageSquare,
  PlugZap,
  ShieldCheck,
  Webhook
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ApprovalModal } from "@/components/approval/ApprovalModal";
import { ApprovalQueue } from "@/components/approval/ApprovalQueue";
import { ExecutionPreviewCard } from "@/components/approval/ExecutionPreviewCard";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { createApprovalPreviewForConnector } from "@/src/lib/integrations/permission";
import { connectorRegistry } from "@/src/lib/integrations/registry";
import type {
  Connector,
  ConnectorExecutionPreview,
  ConnectorPermission,
  Integration
} from "@/src/lib/integrations/types";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import { readApiResponse } from "@/src/lib/api/api-response";
import { AUTOMATION_APPS } from "@/src/lib/automation/app-registry";
import type { VerifiedConnectionState } from "@/src/lib/integrations/verified-connection.service";
import { AutomationAppLogo } from "@/components/Automation/AutomationAppLogo";
import type {
  ConnectableOAuthProviderId,
  OAuthConnectionState,
  OAuthServiceId
} from "@/src/lib/oauth/oauth.types";
import { CalendarIntegrationCard } from "./CalendarIntegrationCard";
import { ConnectorLogViewer } from "./ConnectorLogViewer";
import { ConnectorPermissionList } from "./ConnectorPermissionList";
import { ConnectionTestPanel } from "./ConnectionTestPanel";
import { ExternalDataPreview } from "./ExternalDataPreview";
import { ExternalMatchReview } from "./ExternalMatchReview";
import { GmailIntegrationCard } from "./GmailIntegrationCard";
import { IntegrationCard } from "./IntegrationCard";
import { IntegrationDisconnectButton } from "./IntegrationDisconnectButton";
import { IntegrationErrorPanel } from "./IntegrationErrorPanel";
import { OAuthConnectButton } from "./OAuthConnectButton";
import { PermissionScopeViewer } from "./PermissionScopeViewer";
import { SlackIntegrationCard } from "./SlackIntegrationCard";
import { SyncButton } from "./SyncButton";
import { SyncHistoryTable } from "./SyncHistoryTable";
import { KeyCredentialPanel } from "./KeyCredentialPanel";

const iconMap = {
  drive: FileText,
  notion: FileText,
  github: Github,
  discord: MessageSquare,
  firebase: Globe2,
  browser: Globe2,
  "local-files": FileText,
  webhook: Webhook
};

type ConnectorViewState = {
  connector: Connector;
  integration: Integration;
  permissions: ConnectorPermission[];
  auth?: {
    configured: boolean;
    detail: string;
    connectionState: OAuthConnectionState | "mock_mode";
    canConnect: boolean;
    canReconnect: boolean;
    verifiedAt: string | null;
    expectedRedirectUri: string | null;
    redirectMatches: boolean | null;
  };
};

type IntegrationStatusResponse = {
  items?: Array<{
    connectorId: string;
    integration: Integration;
    auth?: ConnectorViewState["auth"];
  }>;
  firebase?: {
    clientConfigured: boolean;
    adminConfigured: boolean;
    projectIdConfigured: boolean;
  };
  ai?: {
    providers: Array<{ provider: string; connected: boolean }>;
  };
  connections?: VerifiedConnectionState[];
};

export function IntegrationCenter({ selectedConnectorId }: { selectedConnectorId?: string | null }) {
  const connectors = useMemo(() => connectorRegistry.list(), []);
  const [items, setItems] = useState<ConnectorViewState[]>([]);
  const [selectedId, setSelectedId] = useState(connectors[0].id);
  const [preview, setPreview] = useState<ConnectorExecutionPreview | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusSummary, setStatusSummary] = useState<IntegrationStatusResponse | null>(null);
  const [connections, setConnections] = useState<VerifiedConnectionState[]>([]);
  const [selectedAppId, setSelectedAppId] = useState(selectedConnectorId || "gmail");
  const [statusVersion, setStatusVersion] = useState(0);
  const { t, language } = useAppLanguage();

  useEffect(() => {
    async function load() {
      try {
        const baseItems = await Promise.all(
          connectors.map(async (connector) => ({
            connector,
            integration: await connector.getStatus(),
            permissions: await connector.getPermissions()
          }))
        );
        const response = await fetch("/api/integrations/status");
        const statusData = await readApiResponse<IntegrationStatusResponse>(response);
        const statusById = new Map(
          (statusData?.items || []).map((item) => [item.connectorId, item])
        );
        setStatusSummary(statusData);
        setConnections(statusData.connections || []);
        setItems(
          baseItems.map((item) => {
            const serverItem = statusById.get(item.connector.id);
            const merged = serverItem
              ? {
                  ...item,
                  integration: serverItem.integration,
                  auth: serverItem.auth
                }
              : item;
            return {
              ...merged,
              integration: localizeIntegration(merged.connector.id, merged.integration, language)
            };
          })
        );
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : t("integrations.failed"));
      }
    }
    void load();
  }, [connectors, language, statusVersion]);

  useEffect(() => {
    if (!selectedConnectorId) return;
    setSelectedAppId(selectedConnectorId);
    if (connectors.some((connector) => connector.id === selectedConnectorId)) setSelectedId(selectedConnectorId);
  }, [connectors, selectedConnectorId]);

  const selected = items.find((item) => item.connector.id === selectedId) || items[0];
  const connectedCount = connections.filter((item) => item.status === "connected").length;
  const aiConnectedCount =
    statusSummary?.ai?.providers.filter((provider) => provider.connected).length || 0;
  const firebaseReady = Boolean(
    statusSummary?.firebase?.clientConfigured ||
      statusSummary?.firebase?.adminConfigured ||
      statusSummary?.firebase?.projectIdConfigured
  );

  function showPreview() {
    if (!selected) return;
    const action = previewActionFor(selected.connector.id, selected.connector.name);
    setPreview(createApprovalPreviewForConnector(action, selected.permissions));
    setApprovalOpen(true);
  }

  function approvePreview() {
    setNotice(t("integrations.approved"));
    setApprovalOpen(false);
  }

  function rejectPreview() {
    setNotice(t("integrations.rejected"));
    setApprovalOpen(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-app-text">{t("integrations.title")}</h1>
          <p className="mt-2 text-sm text-app-muted">{t("integrations.description")}</p>
        </div>
        <button
          type="button"
          onClick={showPreview}
          className="inline-flex h-11 items-center gap-2 rounded-2xl bg-app-primary px-4 text-sm font-semibold text-white shadow-soft"
        >
          <PlugZap size={16} />
          {t("integrations.preview")}
        </button>
      </div>

      <IntegrationErrorPanel message={error} />
      {notice ? (
        <div className="rounded-app border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      <div className="grid grid-cols-4 gap-4">
        <Metric icon={Cable} label={t("integrations.connectedMetric")} value={String(connectedCount)} />
        <Metric icon={Mail} label={t("integrations.aiProviders")} value={String(aiConnectedCount)} />
        <Metric icon={MessageSquare} label="Slack" value="OAuth v2" />
        <Metric
          icon={ShieldCheck}
          label="Firebase"
          value={firebaseReady ? t("integrations.firebaseConfigured") : t("integrations.firebaseMissing")}
        />
      </div>

      <section className="grid gap-4 rounded-[24px] border border-app-border bg-app-bg/70 p-4 lg:grid-cols-[310px_minmax(0,1fr)]">
        <div className="rounded-[20px] border border-app-border bg-white p-3 shadow-soft">
          <div className="mb-3 flex items-center justify-between px-1">
            <div><h2 className="text-sm font-bold text-app-text">앱 계정 연결</h2><p className="mt-1 text-[11px] text-app-muted">앱별 OAuth 또는 정확한 키 항목. 핵심 커넥터는 위 카드에서 관리합니다.</p></div>
            <span className="rounded-full bg-app-hover px-2 py-1 text-[10px] font-bold text-app-primary">{connectedCount}/{AUTOMATION_APPS.length}</span>
          </div>
          <div className="grid max-h-[560px] grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-1">
            {AUTOMATION_APPS.filter(
              (app) => !items.some((item) => item.connector.id === app.id)
            ).map((app) => {
              const connection = connections.find((item) => item.connectorId === app.id);
              return (
                <button key={app.id} type="button" onClick={() => setSelectedAppId(app.id)} className={`flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${selectedAppId === app.id ? "bg-app-hover ring-1 ring-app-primary/20" : "hover:bg-app-bg"}`}>
                  <AutomationAppLogo appId={app.id} size={30} color={app.color} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-app-text">{app.label}</span><span className={`mt-0.5 block text-[10px] ${connection?.status === "connected" ? "text-emerald-600" : connection?.status === "needs_reconnect" ? "text-amber-600" : "text-app-muted"}`}>{connection?.status === "connected" ? "연결됨" : connection?.status === "needs_reconnect" ? "재연결 필요" : "연결 안 됨"}</span></span>
                </button>
              );
            })}
          </div>
        </div>
        <KeyCredentialPanel appId={selectedAppId} connection={connections.find((item) => item.connectorId === selectedAppId)} onChanged={() => setStatusVersion((value) => value + 1)} />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)_390px] gap-5">
        <SurfaceCard className="p-5">
          <div className="mb-4 grid grid-cols-4 gap-3">
            {items.map((item) => renderIntegrationCard(item, selectedId, setSelectedId))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SurfaceCard className="p-4">
              <h2 className="mb-3 text-sm font-semibold text-app-text">
                {t("integrations.syncHistory")}
              </h2>
              <SyncHistoryTable />
            </SurfaceCard>
            <SurfaceCard className="p-4">
              <h2 className="mb-3 text-sm font-semibold text-app-text">
                {t("integrations.connectorLogs")}
              </h2>
              <ConnectorLogViewer />
            </SurfaceCard>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4">
            <ExecutionPreviewCard preview={preview} />
            <ExternalDataPreview preview={preview} />
            <ExternalMatchReview />
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          {selected ? (
            <div className="space-y-4">
              <div>
                <p className="text-lg font-semibold text-app-text">
                  {selected.integration.serviceName}
                </p>
                <p className="mt-1 text-sm leading-6 text-app-muted">
                  {selected.integration.description}
                </p>
                {selected.auth?.detail ? (
                  <p className="mt-2 rounded-2xl border border-app-border bg-app-bg px-3 py-2 text-xs leading-5 text-app-muted">
                    {selected.auth.detail}
                  </p>
                ) : null}
              </div>

              <ConnectorAccountActions
                connectorId={selected.connector.id}
                auth={selected.auth}
              />
              <PermissionScopeViewer permissions={selected.permissions} />
              <ConnectorPermissionList permissions={selected.permissions} />
              <ConnectionTestPanel connector={selected.connector} />
              <SyncButton connectorId={selected.connector.id} />
              <ApprovalQueue />
            </div>
          ) : (
            <p className="text-sm text-app-muted">{t("integrations.noneSelected")}</p>
          )}
        </SurfaceCard>
      </div>

      <ApprovalModal
        preview={approvalOpen ? preview : null}
        onApprove={approvePreview}
        onReject={rejectPreview}
        onClose={() => setApprovalOpen(false)}
      />
    </div>
  );
}

function localizeIntegration(connectorId: string, integration: Integration, language: string): Integration {
  const display = connectorDisplay(connectorId, language);
  return {
    ...integration,
    serviceName: display.name || integration.serviceName,
    description: display.description || integration.description
  };
}

function connectorDisplay(connectorId: string, language: string) {
  const table: Record<string, Record<string, { name: string; description: string }>> = {
    drive: {
      ko: { name: "Google Drive", description: "Google Drive 파일 연결은 Google OAuth의 Drive 전용 scope로 처리합니다." },
      en: { name: "Google Drive", description: "Connects Drive with service-specific Google OAuth scopes." },
      ja: { name: "Google Drive", description: "Google OAuth scopes are separated for Drive access." }
    },
    gmail: {
      ko: { name: "Gmail", description: "Gmail 메시지 읽기, 검색, 첨부 파일 메타데이터, 초안 생성과 승인 후 발송을 담당합니다." },
      en: { name: "Gmail", description: "Reads, searches, drafts, and sends Gmail messages only after approval." },
      ja: { name: "Gmail", description: "Gmailの読み取り、検索、下書き作成、承認後の送信を担当します。" }
    },
    calendar: {
      ko: { name: "Google Calendar", description: "일정 읽기, 일정 생성/수정 미리보기, 승인 후 일정 실행을 담당합니다." },
      en: { name: "Google Calendar", description: "Reads events and prepares create/update previews before approved execution." },
      ja: { name: "Google Calendar", description: "予定の読み取り、作成/更新プレビュー、承認後の実行を担当します。" }
    },
    slack: {
      ko: { name: "Slack", description: "워크스페이스, 채널, 메시지를 읽고 승인 후 메시지를 전송합니다." },
      en: { name: "Slack", description: "Reads workspaces, channels, and messages, then sends messages after approval." },
      ja: { name: "Slack", description: "ワークスペース、チャンネル、メッセージを読み取り、承認後に送信します。" }
    },
    github: {
      ko: { name: "GitHub", description: "저장소, 이슈, PR 맥락을 읽고 승인 후 이슈 생성 같은 쓰기 작업을 준비합니다." },
      en: { name: "GitHub", description: "Reads repository, issue, and PR context and prepares approved write actions." },
      ja: { name: "GitHub", description: "リポジトリ、Issue、PRの文脈を読み取り、承認後の書き込み操作を準備します。" }
    },
    notion: {
      ko: { name: "Notion", description: "페이지와 데이터베이스를 읽고 승인 후 페이지 생성 작업을 준비합니다." },
      en: { name: "Notion", description: "Reads pages and databases and prepares approved page creation." },
      ja: { name: "Notion", description: "ページとデータベースを読み取り、承認後のページ作成を準備します。" }
    },
    discord: {
      ko: { name: "Discord", description: "Discord 계정 식별 정보를 먼저 연결하고 서버 scope는 필요한 기능에서만 요청합니다." },
      en: { name: "Discord", description: "Connects Discord identity first, with optional server scopes only when needed." },
      ja: { name: "Discord", description: "Discord identity OAuth is connected before optional server scopes." }
    },
    firebase: {
      ko: { name: "Firebase", description: "Firebase 프로젝트 설정, 배포 준비 상태, 동기화 상태를 추적합니다." },
      en: { name: "Firebase", description: "Tracks Firebase project configuration, deployment readiness, and sync status." },
      ja: { name: "Firebase", description: "Firebaseプロジェクト設定、デプロイ準備、同期状態を追跡します。" }
    }
  };
  return table[connectorId]?.[language] || table[connectorId]?.ko || { name: "", description: "" };
}

function ConnectorAccountActions({
  connectorId,
  auth
}: {
  connectorId: string;
  auth?: ConnectorViewState["auth"];
}) {
  const { t } = useAppLanguage();
  const target = oauthTargetForConnector(connectorId);
  if (!target) return null;

  const labelByConnector: Record<string, string> = {
    drive: "Connect Google Drive",
    gmail: t("integrations.connectGoogle"),
    calendar: t("integrations.connectGoogle"),
    slack: t("integrations.connectSlack"),
    github: t("integrations.connectGithub"),
    notion: t("integrations.connectNotion"),
    discord: "Connect Discord"
  };

  return (
    <div className="grid gap-2">
      <OAuthConnectButton
        provider={target.provider}
        service={target.service}
        label={labelByConnector[connectorId] || "Connect"}
        reconnect={Boolean(auth?.canReconnect)}
      />
      {auth?.connectionState === "connected" || auth?.connectionState === "configured_unverified" ? (
        <IntegrationDisconnectButton provider={target.provider} service={target.service} />
      ) : null}
      {auth?.expectedRedirectUri ? (
        <RedirectUriControl uri={auth.expectedRedirectUri} matches={auth.redirectMatches} />
      ) : null}
    </div>
  );
}

function RedirectUriControl({ uri, matches }: { uri: string; matches: boolean | null }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  async function copyRedirectUri() {
    try {
      await navigator.clipboard.writeText(uri);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div className={`rounded-2xl border px-3 py-3 ${matches === false ? "border-amber-300 bg-amber-50" : "border-app-border bg-app-bg"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold text-app-text">OAuth Callback URI</p>
        <button
          type="button"
          onClick={() => void copyRedirectUri()}
          className="shrink-0 rounded-xl border border-app-border bg-white px-2.5 py-1.5 text-[10px] font-semibold text-app-primary transition hover:bg-app-hover"
        >
          {copyState === "copied" ? "Callback URI 복사됨" : "Callback URI 복사"}
        </button>
      </div>

      <p className="mt-2 break-all text-[11px] leading-5 text-app-muted">{uri}</p>
      <p aria-live="polite" className={`mt-1 text-[10px] ${copyState === "error" || matches === false ? "text-amber-700" : "text-emerald-700"}`}>
        {copyState === "error"
          ? "복사하지 못했습니다. URI를 직접 선택해 복사해 주세요."
          : matches === false
            ? "배포 환경과 공급자 콘솔의 Callback URI가 다릅니다."
            : "공급자 콘솔에 이 URI를 정확히 등록하세요."}
      </p>
    </div>
  );
}

function oauthTargetForConnector(connectorId: string): {
  provider: ConnectableOAuthProviderId;
  service: OAuthServiceId;
} | null {
  if (connectorId === "drive") return { provider: "google", service: "drive" };
  if (connectorId === "gmail") return { provider: "google", service: "gmail" };
  if (connectorId === "calendar") return { provider: "google", service: "calendar" };
  if (connectorId === "slack") return { provider: "slack", service: "slack" };
  if (connectorId === "github") return { provider: "github", service: "github" };
  if (connectorId === "notion") return { provider: "notion", service: "notion" };
  if (connectorId === "discord") return { provider: "discord", service: "discord" };
  return null;
}

function renderIntegrationCard(
  item: ConnectorViewState,
  selectedId: string,
  setSelectedId: (id: string) => void
) {
  const props = {
    integration: item.integration,
    active: selectedId === item.connector.id,
    onSelect: () => setSelectedId(item.connector.id)
  };

  if (item.connector.id === "gmail") {
    return <GmailIntegrationCard key={item.connector.id} {...props} />;
  }
  if (item.connector.id === "calendar") {
    return <CalendarIntegrationCard key={item.connector.id} {...props} />;
  }
  if (item.connector.id === "slack") {
    return <SlackIntegrationCard key={item.connector.id} {...props} />;
  }

  const Icon = iconMap[item.connector.id as keyof typeof iconMap] || Cable;
  return <IntegrationCard key={item.connector.id} {...props} icon={Icon} />;
}

function previewActionFor(connectorId: string, name: string) {
  if (connectorId === "gmail") {
    return {
      type: "gmail.send",
      connectorId,
      goal: "Gmail send preview",
      requiredPermissionKeys: ["gmail.send"],
      payload: { to: "customer@example.com", subject: "Next meeting schedule" }
    };
  }
  if (connectorId === "calendar") {
    return {
      type: "calendar.create_event",
      connectorId,
      goal: "Google Calendar event preview",
      requiredPermissionKeys: ["calendar.events"],
      payload: { title: "Customer meeting", attendees: ["customer@example.com"] }
    };
  }
  if (connectorId === "slack") {
    return {
      type: "slack.send_message",
      connectorId,
      goal: "Slack message preview",
      requiredPermissionKeys: ["chat.write"],
      payload: { channel: "#project", text: "Share decision notes" }
    };
  }
  if (connectorId === "github") {
    return {
      type: "github.issue.write",
      connectorId,
      goal: "GitHub issue preview",
      requiredPermissionKeys: ["github.issue.write"],
      payload: { title: "DREAMWISH task", body: "Created after approval." }
    };
  }
  if (connectorId === "notion") {
    return {
      type: "notion.page.create",
      connectorId,
      goal: "Notion page preview",
      requiredPermissionKeys: ["notion.page.create"],
      payload: { title: "DREAMWISH note" }
    };
  }
  if (connectorId === "drive") {
    return {
      type: "drive.file.read",
      connectorId,
      goal: "Google Drive file preview",
      requiredPermissionKeys: ["drive.file"],
      payload: { source: "drive" }
    };
  }
  if (connectorId === "discord") {
    return {
      type: "discord.identity.read",
      connectorId,
      goal: "Discord identity preview",
      requiredPermissionKeys: ["discord.identify"],
      payload: { source: "discord" }
    };
  }
  return {
    type: "mock_sync",
    connectorId,
    goal: `${name} action preview`,
    requiredPermissionKeys: [],
    payload: {}
  };
}

function Metric({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Cable;
  label: string;
  value: string;
}) {
  return (
    <SurfaceCard className="p-5">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-app-hover text-app-primary">
          <Icon size={20} />
        </div>
        <div>
          <p className="text-xs font-semibold text-app-muted">{label}</p>
          <p className="mt-1 text-xl font-semibold text-app-text">{value}</p>
        </div>
      </div>
    </SurfaceCard>
  );
}
