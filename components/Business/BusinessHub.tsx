"use client";

import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  ContactRound,
  HandCoins,
  Mail,
  ReceiptText,
  UsersRound
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CRMView } from "@/components/CRM/CRMView";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { readApiResponse } from "@/src/lib/api/api-response";
import { buildBusinessSummary } from "@/src/lib/business/business-workspace";
import type {
  CrmActivity,
  CrmDeal,
  CrmTask,
  Customer
} from "@/src/lib/crm/crm.types";
import type { OAuthConnectionState } from "@/src/lib/oauth/oauth.types";
import type { RevenueCandidate } from "@/src/lib/business/revenue.types";

const sections = [
  { id: "overview", label: "개요" },
  { id: "customers", label: "고객" },
  { id: "companies", label: "회사" },
  { id: "sales", label: "영업·매출" },
  { id: "mail", label: "메일" },
  { id: "cards", label: "명함" },
  { id: "meetings", label: "회의" },
  { id: "tasks", label: "업무" },
  { id: "reports", label: "리포트" }
] as const;

type BusinessSection = (typeof sections)[number]["id"];
type BusinessData = {
  customers: Customer[];
  activities: CrmActivity[];
  tasks: CrmTask[];
  deals: CrmDeal[];
  revenueCandidates: RevenueCandidate[];
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
  deals: [],
  revenueCandidates: []
};

export function BusinessHub({ initialSection }: { initialSection?: BusinessSection }) {
  const [section, setSection] = useState<BusinessSection>(initialSection || "overview");
  const [data, setData] = useState<BusinessData>(emptyData);
  const [connectors, setConnectors] = useState<ConnectorState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const pathSection = window.location.pathname.split("/")[2];
    const querySection = new URLSearchParams(window.location.search).get("tab");
    const requested = pathSection || querySection;
    if (isBusinessSection(requested)) setSection(requested);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [crmResponse, integrationsResponse, revenueResponse] = await Promise.all([
          fetch("/api/crm/customers"),
          fetch("/api/integrations/status"),
          fetch("/api/business/revenue")
        ]);
        const [crm, integrations, revenue] = await Promise.all([
          readApiResponse<Partial<BusinessData>>(crmResponse),
          readApiResponse<{ items?: ConnectorState[] }>(integrationsResponse),
          readApiResponse<{ candidates?: RevenueCandidate[] }>(revenueResponse)
        ]);
        setData({
          customers: crm.customers || [],
          activities: crm.activities || [],
          tasks: crm.tasks || [],
          deals: crm.deals || [],
          revenueCandidates: revenue.candidates || []
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

  const summary = useMemo(() => buildBusinessSummary({ ...data }), [data]);

  function selectSection(next: BusinessSection) {
    setSection(next);
    window.history.replaceState(null, "", `/business/${next}`);
  }

  function upsertRevenueCandidate(candidate: RevenueCandidate) {
    setData((current) => ({
      ...current,
      revenueCandidates: [
        candidate,
        ...current.revenueCandidates.filter((item) => item.id !== candidate.id)
      ]
    }));
  }

  async function transitionRevenue(id: string, status: "confirmed" | "rejected") {
    const response = await fetch("/api/business/revenue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status })
    });
    const result = await readApiResponse<{ candidate: RevenueCandidate }>(response);
    upsertRevenueCandidate(result.candidate);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-app-primary">Business OS</p>
          <h1 className="mt-2 text-2xl font-semibold text-app-text">비즈니스 허브</h1>
          <p className="mt-2 text-sm text-app-muted">고객, 매출, 메일, 회의와 업무를 한곳에서 관리합니다.</p>
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
      {!loading
        ? renderSection(section, data, summary, connectors, transitionRevenue, upsertRevenueCandidate)
        : null}
    </div>
  );
}

function renderSection(
  section: BusinessSection,
  data: BusinessData,
  summary: ReturnType<typeof buildBusinessSummary>,
  connectors: ConnectorState[],
  onRevenueTransition: (id: string, status: "confirmed" | "rejected") => Promise<void>,
  onRevenueCreated: (candidate: RevenueCandidate) => void
) {
  if (section === "customers") return <CRMView />;
  if (section === "overview") return <Overview summary={summary} connectors={connectors} />;
  if (section === "companies") return <Companies customers={data.customers} />;
  if (section === "sales") {
    return (
      <Sales
        deals={data.deals}
        summary={summary}
        candidates={data.revenueCandidates}
        onTransition={onRevenueTransition}
        onCreated={onRevenueCreated}
      />
    );
  }
  if (section === "mail") return <ConnectorPanel connectors={connectors} connectorIds={["gmail", "slack"]} title="메일·메시지" />;
  if (section === "cards") return <EmptyPanel icon={ContactRound} title="명함 관리" body="명함 이미지를 검토해 고객 후보로 저장합니다. 자동 병합 없이 확인 후 반영됩니다." />;
  if (section === "meetings") return <Activities activities={data.activities.filter((item) => item.type === "meeting")} />;
  if (section === "tasks") return <Tasks tasks={data.tasks} />;
  return <Reports summary={summary} />;
}

function Overview({ summary, connectors }: { summary: ReturnType<typeof buildBusinessSummary>; connectors: ConnectorState[] }) {
  const metrics = [
    ["확정 매출", currency(summary.confirmedRevenue), HandCoins],
    ["예상 매출", currency(summary.expectedRevenue), ReceiptText],
    ["가중 파이프라인", currency(summary.weightedPipeline), BarChart3],
    ["고객", `${summary.customerCount}명`, UsersRound],
    ["회사", `${summary.companyCount}개`, Building2],
    ["진행 거래", `${summary.activeDealCount}건`, BriefcaseBusiness]
  ] as const;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(([label, value, Icon]) => (
          <SurfaceCard key={label} className="p-5">
            <Icon size={18} className="text-app-primary" />
            <p className="mt-4 text-xs font-semibold text-app-muted">{label}</p>
            <p className="mt-1 text-xl font-semibold text-app-text">{value}</p>
          </SurfaceCard>
        ))}
      </div>
      <ConnectorPanel connectors={connectors} connectorIds={["gmail", "calendar", "slack", "drive"]} title="업무 연결 상태" />
    </div>
  );
}

function Companies({ customers }: { customers: Customer[] }) {
  const companies = Array.from(
    customers.reduce((map, customer) => {
      const name = customer.companyName.trim() || "회사 미지정";
      const current = map.get(name) || { name, contacts: 0, expectedValue: 0 };
      current.contacts += 1;
      current.expectedValue += customer.expectedValue;
      map.set(name, current);
      return map;
    }, new Map<string, { name: string; contacts: number; expectedValue: number }>()).values()
  );
  return <SimpleTable headers={["회사", "연락처", "예상 가치"]} rows={companies.map((item) => [item.name, `${item.contacts}명`, currency(item.expectedValue)])} />;
}

function Sales({
  deals,
  summary,
  candidates,
  onTransition,
  onCreated
}: {
  deals: CrmDeal[];
  summary: ReturnType<typeof buildBusinessSummary>;
  candidates: RevenueCandidate[];
  onTransition: (id: string, status: "confirmed" | "rejected") => Promise<void>;
  onCreated: (candidate: RevenueCandidate) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
        은행 알림에서 수집한 금액은 확인 전까지 임시 매출이며, 확정 매출에 자동 합산되지 않습니다.
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <SurfaceCard className="p-4">
          <p className="text-sm font-semibold text-app-text">Android 자동 수집</p>
          <p className="mt-2 text-xs leading-5 text-app-muted">알림 접근 권한과 허용 금융 앱을 직접 선택한 경우에만 수집합니다.</p>
        </SurfaceCard>
        <SurfaceCard className="p-4">
          <p className="text-sm font-semibold text-app-text">iPhone 가져오기</p>
          <p className="mt-2 text-xs leading-5 text-app-muted">다른 앱 알림은 자동으로 읽을 수 없습니다. 공유 확장, 복사 텍스트, Gmail 또는 CSV를 사용합니다.</p>
        </SurfaceCard>
      </div>
      <ManualRevenueImport onCreated={onCreated} />
      <SurfaceCard className="p-5">
        <h2 className="text-sm font-semibold text-app-text">모바일 매출 후보</h2>
        <div className="mt-4 space-y-3">
          {candidates.map((candidate) => (
            <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-app-border bg-app-bg p-4">
              <div>
                <p className="text-sm font-semibold text-app-text">{candidate.amount === null ? "금액 확인 필요" : currency(candidate.amount)}</p>
                <p className="mt-1 text-xs text-app-muted">{candidate.platform} · {candidate.captureMethod} · 신뢰도 {Math.round(candidate.confidence * 100)}%</p>
              </div>
              {candidate.status === "provisional" ? (
                <div className="flex gap-2">
                  <button type="button" onClick={() => void onTransition(candidate.id, "confirmed")} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">매출 확정</button>
                  <button type="button" onClick={() => void onTransition(candidate.id, "rejected")} className="rounded-xl border border-app-border bg-white px-3 py-2 text-xs font-semibold text-app-muted">개인/오류 제외</button>
                </div>
              ) : (
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-app-muted">{candidate.status === "confirmed" ? "확정됨" : "제외됨"}</span>
              )}
            </div>
          ))}
          {candidates.length === 0 ? <p className="py-4 text-center text-sm text-app-muted">수집된 매출 후보가 없습니다.</p> : null}
        </div>
      </SurfaceCard>
      <SimpleTable
        headers={["거래", "단계", "금액", "확률"]}
        rows={deals.map((deal) => [deal.title, deal.stage, currency(deal.value), `${deal.probability}%`])}
        empty="등록된 거래가 없습니다. 고객 화면에서 예상 가치를 관리할 수 있습니다."
      />
      <p className="text-right text-sm font-semibold text-app-text">확정 {currency(summary.confirmedRevenue)} · 가중 예상 {currency(summary.weightedPipeline)}</p>
    </div>
  );
}

function ManualRevenueImport({ onCreated }: { onCreated: (candidate: RevenueCandidate) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/business/revenue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "web",
          captureMethod: "manual",
          sourceApp: "business-hub",
          eventId: `manual_${Date.now()}`,
          rawText: text
        })
      });
      const result = await readApiResponse<{ candidate: RevenueCandidate }>(response);
      onCreated(result.candidate);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SurfaceCard className="p-5">
      <label className="text-sm font-semibold text-app-text" htmlFor="manual-revenue-text">알림 문구 직접 가져오기</label>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <textarea id="manual-revenue-text" value={text} onChange={(event) => setText(event.target.value)} placeholder="예: 입금 50,000원 홍길동" className="min-h-20 flex-1 rounded-2xl border border-app-border bg-white px-3 py-2 text-sm outline-none focus:border-app-primary" />
        <button type="button" disabled={busy || !text.trim()} onClick={() => void submit()} className="rounded-2xl bg-app-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "분석 중" : "임시 매출 추가"}</button>
      </div>
    </SurfaceCard>
  );
}

function ConnectorPanel({ connectors, connectorIds, title }: { connectors: ConnectorState[]; connectorIds: string[]; title: string }) {
  const selected = connectorIds.map((id) => connectors.find((item) => item.connectorId === id)).filter(Boolean) as ConnectorState[];
  return (
    <SurfaceCard className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-app-text">{title}</h2>
        <button type="button" onClick={() => window.location.assign("/?view=integrations")} className="rounded-2xl bg-app-hover px-3 py-2 text-xs font-semibold text-app-primary">계정 연결 관리</button>
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

function Activities({ activities }: { activities: CrmActivity[] }) {
  return <SimpleTable headers={["회의", "내용", "기록 시각"]} rows={activities.map((item) => [item.title, item.body || "-", dateTime(item.createdAt)])} empty="기록된 회의가 없습니다." />;
}

function Tasks({ tasks }: { tasks: CrmTask[] }) {
  return <SimpleTable headers={["업무", "우선순위", "마감", "상태"]} rows={tasks.map((item) => [item.title, item.priority, item.dueAt ? dateTime(item.dueAt) : "미정", item.completedAt ? "완료" : "진행"])} empty="등록된 업무가 없습니다." />;
}

function Reports({ summary }: { summary: ReturnType<typeof buildBusinessSummary> }) {
  return <SimpleTable headers={["지표", "값"]} rows={[
    ["확정 매출", currency(summary.confirmedRevenue)],
    ["예상 매출", currency(summary.expectedRevenue)],
    ["후속 연락 필요 고객", `${summary.followUpCustomerCount}명`],
    ["미완료 업무", `${summary.openTaskCount}건`],
    ["오늘 회의", `${summary.todayMeetingCount}건`]
  ]} />;
}

function EmptyPanel({ icon: Icon, title, body }: { icon: typeof Mail; title: string; body: string }) {
  return <SurfaceCard className="p-8 text-center"><Icon size={28} className="mx-auto text-app-primary" /><h2 className="mt-4 text-base font-semibold text-app-text">{title}</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-app-muted">{body}</p></SurfaceCard>;
}

function SimpleTable({ headers, rows, empty = "표시할 데이터가 없습니다." }: { headers: string[]; rows: string[][]; empty?: string }) {
  return (
    <SurfaceCard className="overflow-hidden">
      {rows.length === 0 ? <p className="p-8 text-center text-sm text-app-muted">{empty}</p> : (
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-app-bg text-xs text-app-muted"><tr>{headers.map((header) => <th key={header} className="px-4 py-3 font-semibold">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-t border-app-border">{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className="px-4 py-3 text-app-text">{cell}</td>)}</tr>)}</tbody></table></div>
      )}
    </SurfaceCard>
  );
}

function isBusinessSection(value: string | null | undefined): value is BusinessSection {
  return sections.some((item) => item.id === value);
}

function currency(value: number) {
  return new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(value);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
