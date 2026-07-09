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

const iconMap = {
  notion: FileText,
  github: Github,
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
};

export function IntegrationCenter() {
  const connectors = useMemo(() => connectorRegistry.list(), []);
  const [items, setItems] = useState<ConnectorViewState[]>([]);
  const [selectedId, setSelectedId] = useState(connectors[0].id);
  const [preview, setPreview] = useState<ConnectorExecutionPreview | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusSummary, setStatusSummary] = useState<IntegrationStatusResponse | null>(null);

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
        const statusData = response.ok
          ? ((await response.json()) as IntegrationStatusResponse)
          : null;
        const statusById = new Map(
          (statusData?.items || []).map((item) => [item.connectorId, item])
        );
        setStatusSummary(statusData);
        setItems(
          baseItems.map((item) => {
            const serverItem = statusById.get(item.connector.id);
            return serverItem
              ? {
                  ...item,
                  integration: serverItem.integration,
                  auth: serverItem.auth
                }
              : item;
          })
        );
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Integration 상태를 읽지 못했습니다.");
      }
    }
    void load();
  }, [connectors]);

  const selected = items.find((item) => item.connector.id === selectedId) || items[0];
  const connectedCount = items.filter((item) => item.integration.status === "connected").length;
  const aiConnectedCount =
    statusSummary?.ai?.providers.filter((provider) => provider.connected).length || 0;
  const firebaseReady = Boolean(
    statusSummary?.firebase?.clientConfigured || statusSummary?.firebase?.adminConfigured
  );
  const approvalCount = items.reduce(
    (count, item) =>
      count +
      item.permissions.filter((permission) => permission.riskLevel === "high" || permission.riskLevel === "critical")
        .length,
    0
  );

  function showPreview() {
    if (!selected) return;
    const action = previewActionFor(selected.connector.id, selected.connector.name);
    setPreview(createApprovalPreviewForConnector(action, selected.permissions));
    setApprovalOpen(true);
  }

  function approvePreview() {
    setNotice("승인되었습니다. 실제 실행은 Connector Execute 단계에서 기록됩니다.");
    setApprovalOpen(false);
  }

  function rejectPreview() {
    setNotice("거절되었습니다. 외부 서비스에는 아무 작업도 실행하지 않았습니다.");
    setApprovalOpen(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-app-text">Integrations</h1>
          <p className="mt-2 text-sm text-app-muted">
            Gmail, Google Calendar, Slack을 OAuth로 연결하고 Preview와 Approval 뒤에만 실행합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={showPreview}
          className="inline-flex h-11 items-center gap-2 rounded-2xl bg-app-primary px-4 text-sm font-semibold text-white shadow-soft"
        >
          <PlugZap size={16} />
          실행 미리보기
        </button>
      </div>

      <IntegrationErrorPanel message={error} />
      {notice ? (
        <div className="rounded-app border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      <div className="grid grid-cols-4 gap-4">
        <Metric icon={Cable} label="Connected" value={String(connectedCount)} />
        <Metric icon={Mail} label="AI Providers" value={String(aiConnectedCount)} />
        <Metric icon={MessageSquare} label="Slack" value="OAuth v2" />
        <Metric icon={ShieldCheck} label="Firebase" value={firebaseReady ? "Configured" : "Missing"} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_390px] gap-5">
        <SurfaceCard className="p-5">
          <div className="mb-4 grid grid-cols-4 gap-3">
            {items.map((item) => renderIntegrationCard(item, selectedId, setSelectedId))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SurfaceCard className="p-4">
              <h2 className="mb-3 text-sm font-semibold text-app-text">Sync History</h2>
              <SyncHistoryTable />
            </SurfaceCard>
            <SurfaceCard className="p-4">
              <h2 className="mb-3 text-sm font-semibold text-app-text">Connector Logs</h2>
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

              {selected.connector.id === "gmail" || selected.connector.id === "calendar" ? (
                <OAuthConnectButton provider="google" label="Google 연결" />
              ) : null}
              {selected.connector.id === "slack" ? (
                <OAuthConnectButton provider="slack" label="Slack 연결" />
              ) : null}

              <PermissionScopeViewer permissions={selected.permissions} />
              <ConnectorPermissionList permissions={selected.permissions} />
              <ConnectionTestPanel connector={selected.connector} />
              <SyncButton connectorId={selected.connector.id} />
              {selected.connector.id === "gmail" || selected.connector.id === "calendar" ? (
                <IntegrationDisconnectButton provider="google" />
              ) : null}
              {selected.connector.id === "slack" ? (
                <IntegrationDisconnectButton provider="slack" />
              ) : null}
              <ApprovalQueue />
            </div>
          ) : (
            <p className="text-sm text-app-muted">Integration 상태를 불러오는 중입니다.</p>
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

function renderIntegrationCard(
  item: ConnectorViewState,
  selectedId: string,
  setSelectedId: (id: string) => void
) {
  const common = {
    key: item.connector.id,
    integration: item.integration,
    active: selectedId === item.connector.id,
    onSelect: () => setSelectedId(item.connector.id)
  };

  if (item.connector.id === "gmail") return <GmailIntegrationCard {...common} />;
  if (item.connector.id === "calendar") return <CalendarIntegrationCard {...common} />;
  if (item.connector.id === "slack") return <SlackIntegrationCard {...common} />;

  const Icon = iconMap[item.connector.id as keyof typeof iconMap] || Cable;
  return <IntegrationCard {...common} icon={Icon} />;
}

function previewActionFor(connectorId: string, name: string) {
  if (connectorId === "gmail") {
    return {
      type: "gmail.send",
      connectorId,
      goal: "Gmail 메일 발송 Preview",
      requiredPermissionKeys: ["gmail.send"],
      payload: { to: "customer@example.com", subject: "다음 주 미팅 일정 제안" }
    };
  }
  if (connectorId === "calendar") {
    return {
      type: "calendar.create_event",
      connectorId,
      goal: "Google Calendar 일정 생성 Preview",
      requiredPermissionKeys: ["calendar.events"],
      payload: { title: "고객 미팅", attendees: ["customer@example.com"] }
    };
  }
  if (connectorId === "slack") {
    return {
      type: "slack.send_message",
      connectorId,
      goal: "Slack 메시지 전송 Preview",
      requiredPermissionKeys: ["chat.write"],
      payload: { channel: "#project", text: "결정사항 공유" }
    };
  }
  return {
    type: "mock_sync",
    connectorId,
    goal: `${name} 작업 Preview`,
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
