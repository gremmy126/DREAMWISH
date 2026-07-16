"use client";

import { BriefcaseBusiness, Building2, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { BusinessOperations } from "@/components/Business/BusinessOperations";
import { ErpWorkspace } from "@/components/Business/ErpWorkspace";
import { BusinessCardImport } from "@/components/Business/BusinessCardImport";
import { MeetingManager } from "@/components/Business/MeetingManager";
import { MessageWorkspace } from "@/components/Business/MessageWorkspace";
import { readApiResponse } from "@/src/lib/api/api-response";
import { buildBusinessSummary } from "@/src/lib/business/business-workspace";
import type {
  CrmActivity,
  CrmDeal,
  CrmTask,
  Customer
} from "@/src/lib/crm/crm.types";
import type { OAuthConnectionState } from "@/src/lib/oauth/oauth.types";

const sections = [
  { id: "overview", label: "개요" },
  { id: "erp", label: "ERP" },
  { id: "mail", label: "메일" },
  { id: "cards", label: "명함" },
  { id: "meetings", label: "회의" },
  { id: "reports", label: "리포트" }
] as const;

type BusinessSection = (typeof sections)[number]["id"];
type BusinessData = {
  customers: Customer[];
  activities: CrmActivity[];
  tasks: CrmTask[];
  deals: CrmDeal[];
};
type ConnectorState = {
  connectorId: string;
  auth?: {
    connectionState: OAuthConnectionState | "mock_mode";
    detail: string;
    accountLabel: string | null;
  };
};

const emptyData: BusinessData = {
  customers: [],
  activities: [],
  tasks: [],
  deals: []
};

const SECTION_STORAGE_KEY = "dreamwish.business.section";

export function BusinessHub() {
  const [section, setSection] = useState<BusinessSection>("overview");
  const [data, setData] = useState<BusinessData>(emptyData);
  const [connectors, setConnectors] = useState<ConnectorState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = window.localStorage.getItem(SECTION_STORAGE_KEY);
    if (saved && sections.some((item) => item.id === saved)) {
      setSection(saved as BusinessSection);
    }
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [crmResponse, integrationsResponse] = await Promise.all([
          fetch("/api/crm/customers"),
          fetch("/api/integrations/status")
        ]);
        const [crm, integrations] = await Promise.all([
          readApiResponse<Partial<BusinessData>>(crmResponse),
          readApiResponse<{ items?: ConnectorState[] }>(integrationsResponse)
        ]);
        setData({
          customers: crm.customers || [],
          activities: crm.activities || [],
          tasks: crm.tasks || [],
          deals: crm.deals || []
        });
        setConnectors(integrations.items || []);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "비즈니스 데이터를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const summary = useMemo(
    () => buildBusinessSummary({ ...data, revenueCandidates: [] }),
    [data]
  );

  function selectSection(next: BusinessSection) {
    setSection(next);
    window.localStorage.setItem(SECTION_STORAGE_KEY, next);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-app-primary">Business OS</p>
          <h1 className="mt-2 text-2xl font-semibold text-app-text">비즈니스 허브</h1>
          <p className="mt-2 text-sm text-app-muted">사업 목표, 프로젝트, 운영 일정과 전략을 한곳에서 관리합니다.</p>
        </div>
        <p className="rounded-2xl border border-app-border bg-white px-3 py-2 text-xs text-app-muted">
          외부 전송·초대·수정은 미리보기 후 사용자 승인으로만 실행됩니다.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Business sections">
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => selectSection(item.id)}
            aria-current={section === item.id ? "page" : undefined}
            className={`rounded-2xl px-4 py-2 text-xs font-semibold transition ${
              section === item.id
                ? "bg-app-primary text-white shadow-soft"
                : "border border-app-border bg-white text-app-muted hover:bg-app-hover hover:text-app-primary"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {loading ? <p className="py-12 text-center text-sm text-app-muted">불러오는 중...</p> : null}
      {!loading ? renderSection(section, data, summary, connectors) : null}
    </div>
  );
}

function renderSection(
  section: BusinessSection,
  data: BusinessData,
  summary: ReturnType<typeof buildBusinessSummary>,
  connectors: ConnectorState[]
) {
  if (section === "overview") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Metric icon={UsersRound} label="고객" value={`${summary.customerCount}명`} />
          <Metric icon={Building2} label="회사" value={`${summary.companyCount}개`} />
          <Metric icon={BriefcaseBusiness} label="진행 거래" value={`${summary.activeDealCount}건`} />
        </div>
        <BusinessOperations tasks={data.tasks} activities={data.activities} />
        <ConnectorPanel connectors={connectors} connectorIds={["gmail", "calendar", "slack", "drive"]} title="업무 연결 상태" />
      </div>
    );
  }
  if (section === "erp") return <ErpWorkspace />;
  if (section === "mail") return <MessageWorkspace />;
  if (section === "cards") return <BusinessCardImport />;
  if (section === "meetings") return <MeetingManager />;
  return <Reports summary={summary} />;
}

function Metric({
  icon: Icon,
  label,
  value
}: {
  icon: typeof UsersRound;
  label: string;
  value: string;
}) {
  return (
    <SurfaceCard className="p-5">
      <Icon size={18} className="text-app-primary" />
      <p className="mt-4 text-xs font-semibold text-app-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-app-text">{value}</p>
    </SurfaceCard>
  );
}

function ConnectorPanel({ connectors, connectorIds, title }: { connectors: ConnectorState[]; connectorIds: string[]; title: string }) {
  const selected = connectorIds.map((id) => connectors.find((item) => item.connectorId === id)).filter(Boolean) as ConnectorState[];
  return (
    <SurfaceCard className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-app-text">{title}</h2>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("dreamwish:navigate", { detail: { view: "integrations" } }))}
          className="rounded-2xl bg-app-hover px-3 py-2 text-xs font-semibold text-app-primary"
        >
          계정 연결 관리
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {selected.map((item) => {
          const state = item.auth?.connectionState || "not_connected";
          const verified = state === "connected";
          const reconnect = state === "configured_unverified" || state === "expired" || state === "revoked" || state === "error";
          return (
            <div key={item.connectorId} className="rounded-2xl border border-app-border bg-app-bg p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-app-text">{item.connectorId}</p>
                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${verified ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {verified ? "검증 연결됨" : reconnect ? "재연결 필요" : "연결 안 됨"}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-app-muted">{item.auth?.detail || "연결 상태를 확인할 수 없습니다."}</p>
            </div>
          );
        })}
        {selected.length === 0 ? <p className="text-sm text-app-muted">연결 정보를 불러오지 못했습니다.</p> : null}
      </div>
    </SurfaceCard>
  );
}

function Reports({ summary }: { summary: ReturnType<typeof buildBusinessSummary> }) {
  const rows: Array<[string, string]> = [
    ["후속 연락 필요 고객", `${summary.followUpCustomerCount}명`],
    ["미완료 업무", `${summary.openTaskCount}건`],
    ["오늘 회의", `${summary.todayMeetingCount}건`],
    ["전체 고객", `${summary.customerCount}명`],
    ["회사", `${summary.companyCount}개`]
  ];
  return (
    <SurfaceCard className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-app-bg text-xs text-app-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">지표</th>
              <th className="px-4 py-3 font-semibold">값</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label} className="border-t border-app-border">
                <td className="px-4 py-3 text-app-text">{label}</td>
                <td className="px-4 py-3 text-app-text">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SurfaceCard>
  );
}
