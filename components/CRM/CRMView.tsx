"use client";

import {
  Activity,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Download,
  Mail,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
  Upload,
  UsersRound
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/Common/EmptyState";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { PhoneContactImport } from "@/components/CRM/PhoneContactImport";
import { CrmPipelineBoard } from "@/components/CRM/CrmPipelineBoard";
import { MessageWorkspace } from "@/components/Business/MessageWorkspace";
import { readApiResponse } from "@/src/lib/api/api-response";
import { stringifyUnknownError } from "@/src/lib/auth/access-control";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import type {
  CrmActivity,
  CrmDeal,
  CrmInsight,
  CrmTask,
  Customer,
  CustomerImportance,
  CustomerStatus,
  DealStage
} from "@/src/lib/crm/crm.types";
import { buildCrmActivityDrafts, getCrmPipelineSummary } from "@/src/lib/crm/crm-workspace";

type CustomerForm = {
  name: string;
  email: string;
  phone: string;
  companyName: string;
  position: string;
  memo: string;
};

const emptyForm: CustomerForm = {
  name: "", email: "", phone: "", companyName: "", position: "", memo: ""
};

const crmTabs = [
  { id: "dashboard", label: "대시보드" },
  { id: "contacts", label: "연락처" },
  { id: "deals", label: "딜 (거래)" },
  { id: "activities", label: "활동" },
  { id: "email", label: "이메일" },
  { id: "reports", label: "보고서" }
] as const;

type CrmTab = (typeof crmTabs)[number]["id"];

const DEAL_STAGES: Array<{ id: DealStage; label: string }> = [
  { id: "discovery", label: "신규" },
  { id: "contacted", label: "접촉됨" },
  { id: "proposal", label: "제안" },
  { id: "negotiation", label: "협상" },
  { id: "won", label: "성사" },
  { id: "lost", label: "실패" }
];

const TAB_STORAGE_KEY = "dreamwish.crm.tab";

type ConnectorState = {
  connectorId: string;
  auth?: { connectionState: string; detail: string; accountLabel: string | null };
};

export function CRMView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [insights, setInsights] = useState<CrmInsight[]>([]);
  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [connectors, setConnectors] = useState<ConnectorState[]>([]);
  const [activeTab, setActiveTab] = useState<CrmTab>("dashboard");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const { language, t } = useAppLanguage();
  const labels = crmWorkspaceLabels(language);
  const selected = useMemo(
    () => customers.find((customer) => customer.id === selectedId) || customers[0] || null,
    [customers, selectedId]
  );
  const selectedActivities = useMemo(
    () => activities.filter((activity) => activity.customerId === selected?.id),
    [activities, selected?.id]
  );
  const selectedInsight = useMemo(
    () => insights.find((insight) => insight.customerId === selected?.id) || null,
    [insights, selected?.id]
  );
  const pipeline = useMemo(() => getCrmPipelineSummary(customers), [customers]);
  const openTasks = useMemo(() => tasks.filter((task) => !task.completedAt), [tasks]);
  const gmailConnected = connectors.some(
    (item) => item.connectorId === "gmail" && item.auth?.connectionState === "connected"
  );

  useEffect(() => {
    const saved = window.localStorage.getItem(TAB_STORAGE_KEY);
    if (saved && crmTabs.some((tab) => tab.id === saved)) setActiveTab(saved as CrmTab);
    void loadCrm("");
    void loadConnectors();
  }, []);

  function selectTab(tab: CrmTab) {
    setActiveTab(tab);
    window.localStorage.setItem(TAB_STORAGE_KEY, tab);
  }

  async function loadConnectors() {
    try {
      const response = await fetch("/api/integrations/status");
      const data = await readApiResponse<{ items?: ConnectorState[] }>(response);
      setConnectors(data.items || []);
    } catch {
      setConnectors([]);
    }
  }

  async function loadCrm(query?: string) {
    setLoadError(null);
    try {
      const effectiveQuery = query === undefined ? searchQuery : query;
      const encodedSearchQuery = encodeURIComponent(searchQuery);
      const encodedQuery = effectiveQuery === searchQuery
        ? encodedSearchQuery
        : encodeURIComponent(effectiveQuery);
      const response = await fetch(`/api/crm/customers?q=${encodedQuery}`);
      const data = await readApiResponse<{
        customers?: Customer[];
        activities?: CrmActivity[];
        insights?: CrmInsight[];
        deals?: CrmDeal[];
        tasks?: CrmTask[];
      }>(response);
      const nextCustomers = data.customers || [];
      setCustomers(nextCustomers);
      setActivities(data.activities || []);
      setInsights(data.insights || []);
      setDeals(data.deals || []);
      setTasks(data.tasks || []);
      setSelectedId((current) =>
        nextCustomers.some((customer) => customer.id === current)
          ? current
          : nextCustomers[0]?.id || null
      );
    } catch (caught) {
      setLoadError(stringifyUnknownError(caught));
    }
  }

  async function createCustomer() {
    setBusy(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/crm/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      await readApiResponse<{ customer: Customer }>(response);
      setForm(emptyForm);
      setModalOpen(false);
      await loadCrm();
    } catch (caught) {
      setLoadError(stringifyUnknownError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function updateSelectedCustomer(patch: {
    status?: CustomerStatus;
    importance?: CustomerImportance;
    nextContactAt?: string;
    expectedValue?: number;
    activity?: Pick<CrmActivity, "type" | "title" | "body">;
  }) {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await fetch("/api/crm/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: selected.id, ...patch })
      });
      await readApiResponse(response);
      await loadCrm();
    } catch (caught) {
      setLoadError(stringifyUnknownError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedCustomer() {
    if (!selected || !window.confirm(labels.deleteConfirm)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/crm/customers?customerId=${encodeURIComponent(selected.id)}`, {
        method: "DELETE"
      });
      await readApiResponse(response);
      await loadCrm();
    } catch (caught) {
      setLoadError(stringifyUnknownError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function addSelectedActivity(type: "note" | "task" | "email_draft") {
    if (!selected) return;
    const drafts = buildCrmActivityDrafts(selected.id, `${selected.name} follow-up`);
    const activity = drafts.find((draft) => draft.type === type) || drafts[0];
    await updateSelectedCustomer({ activity });
  }

  async function crmRequest(path: string, method: string, body?: unknown) {
    setLoadError(null);
    try {
      const response = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      await readApiResponse(response);
      await loadCrm();
    } catch (caught) {
      setLoadError(stringifyUnknownError(caught));
    }
  }

  function exportContactsCsv() {
    const header = "name,email,phone,companyName,position,status,importance,expectedValue";
    const rows = customers.map((customer) =>
      [customer.name, customer.email, customer.phone, customer.companyName, customer.position, customer.status, customer.importance, String(customer.expectedValue)]
        .map((cell) => `"${(cell || "").replace(/"/gu, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "crm-contacts.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importContactsCsv(file: File) {
    const text = await file.text();
    const lines = text.split(/\r?\n/u).filter((line) => line.trim());
    const startIndex = /name|이름/iu.test(lines[0] || "") ? 1 : 0;
    let imported = 0;
    for (const line of lines.slice(startIndex, startIndex + 200)) {
      const cells = parseCsvLine(line);
      const name = cells[0]?.trim();
      if (!name) continue;
      try {
        const response = await fetch("/api/crm/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email: cells[1]?.trim() || "",
            phone: cells[2]?.trim() || "",
            companyName: cells[3]?.trim() || "",
            position: cells[4]?.trim() || ""
          })
        });
        await readApiResponse(response);
        imported += 1;
      } catch {
        // Skip malformed rows; the import summary reflects only real inserts.
      }
    }
    setLoadError(imported > 0 ? null : "CSV에서 가져올 연락처를 찾지 못했습니다.");
    await loadCrm();
  }

  return (
    <div className="space-y-5">
      {loadError ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          <span>{loadError}</span>
          <button type="button" onClick={() => void loadCrm()} className="rounded-xl bg-white px-3 py-1.5 font-semibold">{labels.retry}</button>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-app-text">{t("crm.title")}</h1>
          <p className="mt-2 text-sm text-app-muted">{t("crm.description")}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex h-11 min-w-[280px] items-center gap-2 rounded-2xl border border-app-border bg-white px-3">
            <Search size={16} className="text-app-muted" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void loadCrm(); }}
              placeholder={labels.search}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <button type="button" onClick={() => void loadCrm()} className="h-11 rounded-2xl border border-app-border bg-white px-4 text-sm font-semibold text-app-text">{labels.searchButton}</button>
          <PhoneContactImport onImported={() => loadCrm()} />
          <button type="button" onClick={() => setModalOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-app-primary px-4 text-sm font-semibold text-white shadow-soft">
            <Plus size={16} /> {t("crm.newCustomer")}
          </button>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-app-border" role="tablist" aria-label="CRM sections">
        {crmTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => selectTab(tab.id)}
            className={`shrink-0 border-b-2 px-4 py-3 text-xs font-semibold transition ${activeTab === tab.id ? "border-app-primary text-app-primary" : "border-transparent text-app-muted hover:text-app-text"}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "dashboard" ? (
        <DashboardTab
          customers={customers}
          deals={deals}
          activities={activities}
          openTasks={openTasks}
          pipeline={pipeline}
          onSelectCustomer={(id) => { setSelectedId(id); selectTab("contacts"); }}
        />
      ) : null}

      {activeTab === "contacts" ? (
        <ContactsTab
          customers={customers}
          selected={selected}
          selectedActivities={selectedActivities}
          selectedInsight={selectedInsight}
          busy={busy}
          labels={labels}
          t={t}
          onSelect={setSelectedId}
          onUpdate={updateSelectedCustomer}
          onDelete={deleteSelectedCustomer}
          onAddActivity={addSelectedActivity}
          onExportCsv={exportContactsCsv}
          onImportCsvClick={() => csvInputRef.current?.click()}
        />
      ) : null}

      {activeTab === "deals" ? (
        <DealsTab
          deals={deals}
          customers={customers}
          onCreate={(body) => void crmRequest("/api/crm/deals", "POST", body)}
          onMoveStage={(dealId, stage) => void crmRequest("/api/crm/deals", "PATCH", { dealId, stage })}
          onDelete={(dealId) => {
            if (window.confirm("이 딜을 삭제할까요?")) void crmRequest(`/api/crm/deals?dealId=${encodeURIComponent(dealId)}`, "DELETE");
          }}
        />
      ) : null}

      {activeTab === "activities" ? (
        <ActivitiesTab
          activities={activities}
          tasks={tasks}
          customers={customers}
          onCreateTask={(body) => void crmRequest("/api/crm/tasks", "POST", body)}
          onToggleTask={(taskId, completed) => void crmRequest("/api/crm/tasks", "PATCH", { taskId, completed })}
          onDeleteTask={(taskId) => void crmRequest(`/api/crm/tasks?taskId=${encodeURIComponent(taskId)}`, "DELETE")}
          onCreateActivity={(customerId, type, title, body) =>
            void crmRequest("/api/crm/customers", "PATCH", { customerId, activity: { type, title, body } })}
        />
      ) : null}

      {activeTab === "email" ? (
        gmailConnected ? (
          <div className="space-y-4">
            <EmailContactMatches
              customers={customers}
              onSelectCustomer={(id) => {
                setSelectedId(id);
                selectTab("contacts");
              }}
            />
            <MessageWorkspace />
          </div>
        ) : (
          <SurfaceCard className="p-10 text-center">
            <Mail size={28} className="mx-auto text-app-primary" />
            <h2 className="mt-4 text-base font-semibold text-app-text">연결된 이메일 계정이 없습니다.</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-app-muted">
              Gmail 계정을 연결하면 고객과 주고받은 실제 이메일을 CRM에서 확인하고 답장할 수 있습니다. 더미 이메일은 표시하지 않습니다.
            </p>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("dreamwish:navigate", { detail: { view: "integrations", connectorId: "gmail" } }))}
              className="mt-5 rounded-2xl bg-app-primary px-5 py-2.5 text-sm font-semibold text-white"
            >
              Gmail 연결하기
            </button>
          </SurfaceCard>
        )
      ) : null}

      {activeTab === "reports" ? (
        <ReportsTab customers={customers} deals={deals} tasks={tasks} activities={activities} />
      ) : null}

      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importContactsCsv(file);
          event.currentTarget.value = "";
        }}
      />

      {modalOpen ? (
        <Modal title={t("crm.newCustomer")} closeLabel={t("common.close")} onClose={() => setModalOpen(false)}>
          <div className="grid gap-3">
            <Input label={t("crm.name")} value={form.name} onChange={(name) => setForm((previous) => ({ ...previous, name }))} />
            <Input label={t("crm.email")} value={form.email} onChange={(email) => setForm((previous) => ({ ...previous, email }))} />
            <Input label={t("crm.phone")} value={form.phone} onChange={(phone) => setForm((previous) => ({ ...previous, phone }))} />
            <Input label={t("crm.company")} value={form.companyName} onChange={(companyName) => setForm((previous) => ({ ...previous, companyName }))} />
            <Input label={t("crm.position")} value={form.position} onChange={(position) => setForm((previous) => ({ ...previous, position }))} />
            <textarea value={form.memo} onChange={(event) => setForm((previous) => ({ ...previous, memo: event.target.value }))} className="min-h-24 rounded-app border border-app-border bg-app-bg px-4 py-3 text-sm outline-none focus:border-app-primary" placeholder={t("crm.memo")} />
            <button type="button" disabled={busy || !form.name.trim()} onClick={() => void createCustomer()} className="h-11 rounded-app bg-app-primary text-sm font-semibold text-white disabled:opacity-50">{t("common.save")}</button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function DashboardTab({
  customers,
  deals,
  activities,
  openTasks,
  pipeline,
  onSelectCustomer
}: {
  customers: Customer[];
  deals: CrmDeal[];
  activities: CrmActivity[];
  openTasks: CrmTask[];
  pipeline: ReturnType<typeof getCrmPipelineSummary>;
  onSelectCustomer: (id: string) => void;
}) {
  const openDeals = deals.filter((deal) => deal.stage !== "won" && deal.stage !== "lost");
  const todayTasks = openTasks.filter(
    (task) => task.dueAt && task.dueAt.slice(0, 10) <= new Date().toISOString().slice(0, 10)
  );
  const recentActivities = [...activities]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={UsersRound} label="전체 연락처" value={String(customers.length)} />
        <Metric icon={BriefcaseBusiness} label="진행 중 딜" value={String(openDeals.length)} />
        <Metric icon={CalendarDays} label="예정된 활동" value={String(openTasks.length)} />
        <Metric icon={Target} label="리드" value={String(pipeline.leads)} />
        <Metric icon={Activity} label="총 활동" value={String(activities.length)} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <CrmPipelineBoard deals={deals} />
        <SurfaceCard className="p-5">
          <h2 className="text-sm font-semibold text-app-text">활동 요약</h2>
          <div className="mt-5 flex items-center gap-5">
            <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full" style={{ background: "conic-gradient(#635bff 0 38%, #38bdf8 38% 66%, #34d399 66% 84%, #fbbf24 84% 100%)" }}><div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-white"><span className="text-xl font-semibold text-app-text">{activities.length}</span><span className="text-[10px] text-app-muted">총 활동</span></div></div>
            <div className="min-w-0 flex-1 space-y-2">{(["email_draft", "call", "meeting", "task"] as const).map((type) => <div key={type} className="flex items-center justify-between text-xs"><span className="text-app-muted">{type === "email_draft" ? "이메일" : type === "call" ? "통화" : type === "meeting" ? "미팅" : "작업"}</span><span className="font-semibold text-app-text">{activities.filter((item) => item.type === type).length}</span></div>)}</div>
          </div>
        </SurfaceCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <SurfaceCard className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-app-text"><CheckCircle2 size={15} className="text-app-primary" />오늘 해야 할 일</h2>
          {todayTasks.length === 0 ? <p className="text-sm text-app-muted">오늘 마감인 업무가 없습니다.</p> : (
            <div className="space-y-2">{todayTasks.slice(0, 6).map((task) => <div key={task.id} className="flex items-center justify-between gap-2 rounded-xl bg-app-bg px-3 py-2 text-xs"><span className="min-w-0 flex-1 truncate text-app-text">{task.title}</span><span className="shrink-0 text-app-muted">{task.dueAt?.slice(0, 10)}</span></div>)}</div>
          )}
          <h2 className="mb-3 mt-5 border-t border-app-border pt-4 text-sm font-semibold text-app-text">최근 활동</h2>
          {recentActivities.length === 0 ? <p className="text-sm text-app-muted">최근 활동이 없습니다.</p> : (
            <div className="space-y-2">{recentActivities.map((activity) => <div key={activity.id} className="flex items-center justify-between gap-2 rounded-xl bg-app-bg px-3 py-2 text-xs"><span className="min-w-0 flex-1 truncate text-app-text">{activity.title}</span><span className="shrink-0 text-app-muted">{new Date(activity.createdAt).toLocaleDateString("ko-KR")}</span></div>)}</div>
          )}
        </SurfaceCard>
        <SurfaceCard className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-app-text"><Sparkles size={15} className="text-app-primary" />AI 추천 후속 조치</h2>
          <div className="grid grid-cols-1 gap-3">
            {pipeline.nextBestActions.map((item) => (
              <button key={item.customerId} type="button" onClick={() => onSelectCustomer(item.customerId)} className="rounded-2xl border border-app-border bg-app-bg p-3 text-left">
                <p className="truncate text-sm font-semibold text-app-text">{item.customerName}</p>
                <p className="mt-2 text-xs leading-5 text-app-muted">{item.action}</p>
                <p className="mt-2 text-[11px] font-semibold uppercase text-app-primary">{item.priority}</p>
              </button>
            ))}
            {pipeline.nextBestActions.length === 0 ? <p className="text-sm text-app-muted">아직 저장된 연락처가 없습니다.</p> : null}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}

function ContactsTab({
  customers,
  selected,
  selectedActivities,
  selectedInsight,
  busy,
  labels,
  t,
  onSelect,
  onUpdate,
  onDelete,
  onAddActivity,
  onExportCsv,
  onImportCsvClick
}: {
  customers: Customer[];
  selected: Customer | null;
  selectedActivities: CrmActivity[];
  selectedInsight: CrmInsight | null;
  busy: boolean;
  labels: ReturnType<typeof crmWorkspaceLabels>;
  t: (key: string) => string;
  onSelect: (id: string) => void;
  onUpdate: (patch: {
    status?: CustomerStatus;
    importance?: CustomerImportance;
    nextContactAt?: string;
    expectedValue?: number;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
  onAddActivity: (type: "note" | "task" | "email_draft") => Promise<void>;
  onExportCsv: () => void;
  onImportCsvClick: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onImportCsvClick} className="inline-flex items-center gap-1.5 rounded-2xl border border-app-border bg-white px-3 py-2 text-xs font-semibold text-app-muted hover:text-app-primary"><Upload size={13} />CSV 가져오기</button>
        <button type="button" onClick={onExportCsv} className="inline-flex items-center gap-1.5 rounded-2xl border border-app-border bg-white px-3 py-2 text-xs font-semibold text-app-muted hover:text-app-primary"><Download size={13} />CSV 내보내기</button>
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <SurfaceCard className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-app-text">연락처</h2>
            <span className="rounded-2xl border border-app-border bg-app-bg px-3 py-1 text-xs font-semibold text-app-muted">{t("crm.localCrm")}</span>
          </div>
          {customers.length === 0 ? (
            <EmptyState icon={UsersRound} title={t("crm.emptyTitle")} description={t("crm.emptyDescription")} />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {customers.map((customer) => (
                <button key={customer.id} type="button" onClick={() => onSelect(customer.id)} className={`rounded-app border bg-white p-4 text-left shadow-soft transition hover:bg-app-hover ${selected?.id === customer.id ? "border-app-primary" : "border-app-border"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-app-text">{customer.name}</p>
                    <span className="rounded-full bg-app-bg px-2 py-1 text-[10px] font-semibold text-app-muted">{customer.status}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-app-muted">{customer.companyName || customer.email || t("crm.noEmail")}</p>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-app-muted">
                    <span>{customer.nextContactAt?.slice(0, 10) || labels.noFollowUp}</span>
                    <span>{customer.expectedValue.toLocaleString()}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-app-text">{t("crm.details")}</p>
              <p className="mt-1 text-sm text-app-muted">{selected?.name || t("crm.noSelected")}</p>
            </div>
            {selected ? (
              <button type="button" disabled={busy} onClick={() => void onDelete()} className="inline-flex items-center gap-1 rounded-xl border border-red-200 px-2 py-1.5 text-xs font-semibold text-red-600">
                <Trash2 size={13} /> {labels.delete}
              </button>
            ) : null}
          </div>
          {selected ? (
            <div className="space-y-5">
              <div className="space-y-3 text-sm">
                <Detail label={t("crm.email")} value={selected.email || "-"} />
                <Detail label={t("crm.phone")} value={selected.phone || "-"} />
                <Detail label={t("crm.position")} value={selected.position || "-"} />
                <Detail label={labels.company} value={selected.companyName || "-"} />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Select label={t("crm.status")} value={selected.status} options={["lead", "active", "paused", "inactive"]} onChange={(status) => void onUpdate({ status: status as CustomerStatus })} />
                <Select label={t("crm.importance")} value={selected.importance} options={["low", "medium", "high", "critical"]} onChange={(importance) => void onUpdate({ importance: importance as CustomerImportance })} />
              </div>
              <label className="block text-xs font-semibold text-app-muted">
                {labels.nextContact}
                <input type="datetime-local" value={toLocalDateTime(selected.nextContactAt)} onChange={(event) => void onUpdate({ nextContactAt: event.target.value ? new Date(event.target.value).toISOString() : "" })} className="mt-1 h-10 w-full rounded-xl border border-app-border bg-app-bg px-3 text-xs outline-none" />
              </label>
              <label className="block text-xs font-semibold text-app-muted">
                {labels.expectedValue}
                <input type="number" min="0" value={selected.expectedValue} onChange={(event) => void onUpdate({ expectedValue: Number(event.target.value) || 0 })} className="mt-1 h-10 w-full rounded-xl border border-app-border bg-app-bg px-3 text-xs outline-none" />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <ActionButton onClick={() => void onAddActivity("note")}>{t("crm.note")}</ActionButton>
                <ActionButton onClick={() => void onAddActivity("task")}>{t("crm.task")}</ActionButton>
                <ActionButton onClick={() => void onAddActivity("email_draft")}><Mail size={13} /> {t("crm.draft")}</ActionButton>
              </div>
            </div>
          ) : <p className="text-sm leading-6 text-app-muted">{t("crm.createDetailsHint")}</p>}
        </SurfaceCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <SurfaceCard className="p-5">
          <h2 className="mb-4 text-base font-semibold text-app-text">{labels.timeline}</h2>
          {selectedActivities.length === 0 ? <p className="text-sm text-app-muted">{t("crm.noActivities")}</p> : (
            <div className="space-y-3">
              {selectedActivities.map((activity) => (
                <div key={activity.id} className="rounded-2xl border border-app-border bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-app-text">{activity.title}</p>
                    <span className="text-[10px] text-app-muted">{new Date(activity.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-app-muted">{activity.body}</p>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-app-text"><Sparkles size={16} className="text-app-primary" />{labels.aiInsight}</h2>
          {selectedInsight ? (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-app-text">{selectedInsight.summary}</p>
              <div className="grid grid-cols-2 gap-3">
                <InsightMetric label={labels.contractProbability} value={selectedInsight.contractProbability} />
                <InsightMetric label={labels.riskScore} value={selectedInsight.riskScore} danger />
              </div>
              <div className="rounded-2xl bg-app-bg p-3">
                <p className="text-xs font-semibold text-app-text">{labels.nextAction}</p>
                <p className="mt-1 text-xs leading-5 text-app-muted">{selectedInsight.nextAction}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-app-text">{labels.evidence}</p>
                <ul className="mt-2 space-y-1 text-xs text-app-muted">{selectedInsight.evidence.map((item) => <li key={item}>• {item}</li>)}</ul>
              </div>
            </div>
          ) : <p className="text-sm text-app-muted">{labels.noInsight}</p>}
        </SurfaceCard>
      </div>
    </div>
  );
}

function DealsTab({
  deals,
  customers,
  onCreate,
  onMoveStage,
  onDelete
}: {
  deals: CrmDeal[];
  customers: Customer[];
  onCreate: (body: { customerId: string; title: string; value: number; probability: number }) => void;
  onMoveStage: (dealId: string, stage: DealStage) => void;
  onDelete: (dealId: string) => void;
}) {
  const [customerId, setCustomerId] = useState("");
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <SurfaceCard className="p-4">
        <p className="text-xs font-semibold text-app-text">딜 생성</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-app-muted">
            고객
            <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="h-9 min-w-[160px] rounded-xl border border-app-border bg-white px-2.5 text-xs text-app-text outline-none">
              <option value="">고객 선택</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-app-muted">
            딜 이름
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-9 w-44 rounded-xl border border-app-border bg-white px-2.5 text-xs text-app-text outline-none focus:border-app-primary" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-app-muted">
            거래 금액(원)
            <input value={value} inputMode="numeric" onChange={(event) => setValue(event.target.value)} className="h-9 w-32 rounded-xl border border-app-border bg-white px-2.5 text-xs text-app-text outline-none focus:border-app-primary" />
          </label>
          <button
            type="button"
            disabled={!customerId || !title.trim() || !/^\d*$/u.test(value.trim())}
            onClick={() => {
              onCreate({ customerId, title, value: parseInt(value || "0", 10), probability: 30 });
              setTitle("");
              setValue("");
            }}
            className="inline-flex h-9 items-center gap-1 rounded-xl bg-app-primary px-3.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Plus size={13} />추가
          </button>
        </div>
        {customers.length === 0 ? <p className="mt-2 text-xs text-app-muted">딜을 만들려면 먼저 연락처를 추가하세요.</p> : null}
      </SurfaceCard>

      <div className="grid min-w-0 grid-cols-2 gap-3 overflow-x-auto md:grid-cols-3 xl:grid-cols-6">
        {DEAL_STAGES.map((stage) => {
          const items = deals.filter((deal) => deal.stage === stage.id);
          const total = items.reduce((sum, deal) => sum + deal.value, 0);
          return (
            <section
              key={stage.id}
              aria-label={`${stage.label} 단계`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => { if (dragId) { onMoveStage(dragId, stage.id); setDragId(null); } }}
              className="min-h-56 rounded-2xl border border-app-border bg-white p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-app-text">{stage.label}</span>
                <span className="text-[10px] text-app-muted">{items.length}건</span>
              </div>
              <p className="mt-0.5 text-[10px] text-app-muted">{total.toLocaleString("ko-KR")}원</p>
              <div className="mt-2 space-y-2">
                {items.map((deal) => {
                  const customer = customers.find((item) => item.id === deal.customerId);
                  return (
                    <article
                      key={deal.id}
                      draggable
                      onDragStart={() => setDragId(deal.id)}
                      className="cursor-grab rounded-xl border border-app-border bg-app-bg p-2.5 active:cursor-grabbing"
                    >
                      <p className="line-clamp-2 text-xs font-semibold text-app-text">{deal.title}</p>
                      <p className="mt-1 truncate text-[10px] text-app-muted">{customer?.name || "고객"} · {deal.value.toLocaleString("ko-KR")}원 · {deal.probability}%</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <select
                          value={deal.stage}
                          aria-label="단계 이동"
                          onChange={(event) => onMoveStage(deal.id, event.target.value as DealStage)}
                          className="h-6 rounded-lg border border-app-border bg-white px-1 text-[10px] text-app-text outline-none"
                        >
                          {DEAL_STAGES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                        </select>
                        <button type="button" aria-label="딜 삭제" onClick={() => onDelete(deal.id)} className="text-app-muted hover:text-red-600"><Trash2 size={11} /></button>
                      </div>
                    </article>
                  );
                })}
                {items.length === 0 ? <p className="py-4 text-center text-[10px] text-app-muted">딜 없음</p> : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ActivitiesTab({
  activities,
  tasks,
  customers,
  onCreateTask,
  onToggleTask,
  onDeleteTask,
  onCreateActivity
}: {
  activities: CrmActivity[];
  tasks: CrmTask[];
  customers: Customer[];
  onCreateTask: (body: { customerId: string; title: string; dueAt?: string; priority?: string }) => void;
  onToggleTask: (taskId: string, completed: boolean) => void;
  onDeleteTask: (taskId: string) => void;
  onCreateActivity: (customerId: string, type: CrmActivity["type"], title: string, body: string) => void;
}) {
  const [taskCustomer, setTaskCustomer] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [activityCustomer, setActivityCustomer] = useState("");
  const [activityType, setActivityType] = useState<CrmActivity["type"]>("call");
  const [activityTitle, setActivityTitle] = useState("");

  const sortedActivities = [...activities].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <SurfaceCard className="p-5">
        <h2 className="text-sm font-semibold text-app-text">할 일 · 후속 연락</h2>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <select value={taskCustomer} onChange={(event) => setTaskCustomer(event.target.value)} aria-label="업무 고객" className="h-9 min-w-[130px] rounded-xl border border-app-border bg-white px-2.5 text-xs text-app-text outline-none">
            <option value="">고객 선택</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
          <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="업무 내용" className="h-9 min-w-0 flex-1 rounded-xl border border-app-border bg-white px-2.5 text-xs text-app-text outline-none focus:border-app-primary" />
          <input type="date" value={taskDue} onChange={(event) => setTaskDue(event.target.value)} aria-label="마감일" className="h-9 rounded-xl border border-app-border bg-white px-2.5 text-xs text-app-text outline-none" />
          <button
            type="button"
            disabled={!taskCustomer || !taskTitle.trim()}
            onClick={() => {
              onCreateTask({ customerId: taskCustomer, title: taskTitle, dueAt: taskDue ? new Date(taskDue).toISOString() : undefined });
              setTaskTitle("");
              setTaskDue("");
            }}
            className="h-9 rounded-xl bg-app-primary px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            추가
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center gap-2 rounded-xl border border-app-border bg-app-bg px-3 py-2">
              <input
                type="checkbox"
                checked={Boolean(task.completedAt)}
                onChange={(event) => onToggleTask(task.id, event.target.checked)}
                aria-label={`${task.title} 완료`}
                className="h-3.5 w-3.5 accent-[#6d5df6]"
              />
              <span className={`min-w-0 flex-1 truncate text-xs ${task.completedAt ? "text-app-muted line-through" : "text-app-text"}`}>{task.title}</span>
              <span className="shrink-0 text-[10px] text-app-muted">{task.dueAt ? task.dueAt.slice(0, 10) : "기한 없음"}</span>
              <button type="button" aria-label="업무 삭제" onClick={() => onDeleteTask(task.id)} className="shrink-0 text-app-muted hover:text-red-600"><Trash2 size={12} /></button>
            </div>
          ))}
          {tasks.length === 0 ? <p className="py-4 text-center text-xs text-app-muted">등록된 업무가 없습니다.</p> : null}
        </div>
      </SurfaceCard>

      <SurfaceCard className="p-5">
        <h2 className="text-sm font-semibold text-app-text">활동 기록 (통화·미팅·메모)</h2>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <select value={activityCustomer} onChange={(event) => setActivityCustomer(event.target.value)} aria-label="활동 고객" className="h-9 min-w-[130px] rounded-xl border border-app-border bg-white px-2.5 text-xs text-app-text outline-none">
            <option value="">고객 선택</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
          <select value={activityType} onChange={(event) => setActivityType(event.target.value as CrmActivity["type"])} aria-label="활동 유형" className="h-9 rounded-xl border border-app-border bg-white px-2.5 text-xs text-app-text outline-none">
            <option value="call">전화</option>
            <option value="meeting">미팅</option>
            <option value="note">메모</option>
            <option value="email_draft">이메일 초안</option>
          </select>
          <input value={activityTitle} onChange={(event) => setActivityTitle(event.target.value)} placeholder="활동 내용" className="h-9 min-w-0 flex-1 rounded-xl border border-app-border bg-white px-2.5 text-xs text-app-text outline-none focus:border-app-primary" />
          <button
            type="button"
            disabled={!activityCustomer || !activityTitle.trim()}
            onClick={() => {
              onCreateActivity(activityCustomer, activityType, activityTitle, "");
              setActivityTitle("");
            }}
            className="h-9 rounded-xl bg-app-primary px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            기록
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {sortedActivities.slice(0, 12).map((activity) => {
            const customer = customers.find((item) => item.id === activity.customerId);
            return (
              <div key={activity.id} className="rounded-xl border border-app-border bg-app-bg px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate font-semibold text-app-text">{activity.title}</span>
                  <span className="shrink-0 text-app-muted">{new Date(activity.createdAt).toLocaleDateString("ko-KR")}</span>
                </div>
                <p className="mt-0.5 text-[10px] text-app-muted">{customer?.name || "고객"} · {activityTypeLabel(activity.type)}</p>
              </div>
            );
          })}
          {sortedActivities.length === 0 ? <p className="py-4 text-center text-xs text-app-muted">기록된 활동이 없습니다.</p> : null}
        </div>
      </SurfaceCard>
    </div>
  );
}

function ReportsTab({
  customers,
  deals,
  tasks,
  activities
}: {
  customers: Customer[];
  deals: CrmDeal[];
  tasks: CrmTask[];
  activities: CrmActivity[];
}) {
  const [periodDays, setPeriodDays] = useState<number>(90);
  const cutoff = periodDays > 0 ? Date.now() - periodDays * 86_400_000 : 0;
  const inPeriod = (timestamp: string) => new Date(timestamp).getTime() >= cutoff;

  const newContacts = customers.filter((customer) => inPeriod(customer.createdAt)).length;
  const periodTasks = tasks.filter((task) => inPeriod(task.createdAt));
  const completedTasks = periodTasks.filter((task) => task.completedAt).length;
  const completionRate = periodTasks.length > 0 ? Math.round((completedTasks / periodTasks.length) * 100) : 0;
  const wonDeals = deals.filter((deal) => deal.stage === "won");
  const lostDeals = deals.filter((deal) => deal.stage === "lost");
  const averageDealDays = wonDeals.length > 0
    ? Math.round(wonDeals.reduce((sum, deal) => sum + Math.max(0, new Date(deal.updatedAt).getTime() - new Date(deal.createdAt).getTime()), 0) / wonDeals.length / 86_400_000)
    : 0;
  const stageRows = DEAL_STAGES.map((stage) => ({
    label: stage.label,
    count: deals.filter((deal) => deal.stage === stage.id).length
  }));

  function exportReportCsv() {
    const rows = [
      "지표,값",
      `기간(일),${periodDays === 0 ? "전체" : periodDays}`,
      `신규 연락처,${newContacts}`,
      `활동 완료율(%),${completionRate}`,
      `성공한 딜,${wonDeals.length}`,
      `실패한 딜,${lostDeals.length}`,
      `평균 딜 소요일,${averageDealDays}`,
      ...stageRows.map((row) => `딜 단계 ${row.label},${row.count}`)
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "crm-report.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5" role="group" aria-label="기간 필터">
          {[
            { days: 30, label: "최근 30일" },
            { days: 90, label: "최근 90일" },
            { days: 0, label: "전체" }
          ].map((option) => (
            <button key={option.days} type="button" onClick={() => setPeriodDays(option.days)} className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${periodDays === option.days ? "bg-app-primary text-white" : "border border-app-border bg-white text-app-muted"}`}>{option.label}</button>
          ))}
        </div>
        <button type="button" onClick={exportReportCsv} className="inline-flex items-center gap-1.5 rounded-xl border border-app-border bg-white px-3 py-1.5 text-xs font-semibold text-app-muted hover:text-app-primary"><Download size={13} />CSV 내보내기</button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Metric icon={UsersRound} label="신규 연락처" value={String(newContacts)} />
        <Metric icon={CheckCircle2} label="활동 완료율" value={`${completionRate}%`} />
        <Metric icon={Target} label="성공한 딜" value={String(wonDeals.length)} />
        <Metric icon={Activity} label="실패한 딜" value={String(lostDeals.length)} />
        <Metric icon={CalendarDays} label="평균 딜 소요일" value={`${averageDealDays}일`} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SurfaceCard className="p-5">
          <h2 className="text-sm font-semibold text-app-text">딜 단계별 분포</h2>
          <div className="mt-4 space-y-2">
            {stageRows.map((row) => {
              const max = Math.max(1, ...stageRows.map((item) => item.count));
              return (
                <div key={row.label} className="flex items-center gap-3">
                  <span className="w-12 text-xs text-app-muted">{row.label}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-app-primary" style={{ width: `${(row.count / max) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right text-xs text-app-text">{row.count}</span>
                </div>
              );
            })}
          </div>
        </SurfaceCard>
        <SurfaceCard className="p-5">
          <h2 className="text-sm font-semibold text-app-text">연락처별 상호작용</h2>
          <div className="mt-4 space-y-2">
            {customers.slice(0, 8).map((customer) => {
              const count = activities.filter((activity) => activity.customerId === customer.id).length;
              return (
                <div key={customer.id} className="flex items-center justify-between gap-2 rounded-xl bg-app-bg px-3 py-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-app-text">{customer.name}</span>
                  <span className="shrink-0 text-app-muted">활동 {count}건</span>
                </div>
              );
            })}
            {customers.length === 0 ? <p className="py-3 text-center text-xs text-app-muted">아직 저장된 연락처가 없습니다.</p> : null}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}

function EmailContactMatches({
  customers,
  onSelectCustomer
}: {
  customers: Customer[];
  onSelectCustomer: (id: string) => void;
}) {
  const [matches, setMatches] = useState<
    Array<{ customer: Customer; conversationCount: number; lastAt: string }>
  >([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/business/messages?provider=gmail", { cache: "no-store" });
        const data = await readApiResponse<{
          conversations?: Array<{ updatedAt: string; messages: Array<{ sender?: string }> }>;
        }>(response);
        if (cancelled) return;
        const byEmail = new Map(
          customers
            .filter((customer) => customer.email.trim())
            .map((customer) => [customer.email.trim().toLowerCase(), customer])
        );
        const counter = new Map<string, { customer: Customer; conversationCount: number; lastAt: string }>();
        for (const conversation of data.conversations || []) {
          const emails = new Set(
            conversation.messages
              .map((message) => extractEmailAddress(message.sender || ""))
              .filter((email): email is string => Boolean(email))
          );
          for (const email of emails) {
            const customer = byEmail.get(email);
            if (!customer) continue;
            const current = counter.get(customer.id) || {
              customer,
              conversationCount: 0,
              lastAt: conversation.updatedAt
            };
            current.conversationCount += 1;
            if (conversation.updatedAt > current.lastAt) current.lastAt = conversation.updatedAt;
            counter.set(customer.id, current);
          }
        }
        setMatches(
          [...counter.values()].sort((a, b) => b.conversationCount - a.conversationCount)
        );
      } catch {
        if (!cancelled) setMatches([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customers]);

  if (!loaded || matches.length === 0) return null;

  return (
    <SurfaceCard className="p-4">
      <h2 className="text-xs font-semibold text-app-text">CRM 연락처와 자동 연결된 대화</h2>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {matches.slice(0, 8).map((match) => (
          <button
            key={match.customer.id}
            type="button"
            onClick={() => onSelectCustomer(match.customer.id)}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-app-border bg-app-bg px-3 py-1.5 text-xs transition hover:border-app-primary"
            title={`마지막 대화 ${new Date(match.lastAt).toLocaleDateString("ko-KR")}`}
          >
            <span className="font-semibold text-app-text">{match.customer.name}</span>
            <span className="text-app-muted">대화 {match.conversationCount}건</span>
          </button>
        ))}
      </div>
    </SurfaceCard>
  );
}

function extractEmailAddress(sender: string): string | null {
  const match = sender.match(/<([^>]+@[^>]+)>/u) || sender.match(/([^\s<>]+@[^\s<>]+\.[^\s<>]+)/u);
  return match ? match[1].trim().toLowerCase() : null;
}

function activityTypeLabel(type: CrmActivity["type"]) {
  if (type === "call") return "전화";
  if (type === "meeting") return "미팅";
  if (type === "email_draft") return "이메일 초안";
  if (type === "task") return "작업";
  return "메모";
}

function Metric({ icon: Icon, label, value }: { icon: typeof UsersRound; label: string; value: string }) {
  return <SurfaceCard className="p-5"><div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-app-hover text-app-primary"><Icon size={20} /></div><div><p className="text-xs font-semibold text-app-muted">{label}</p><p className="mt-1 text-2xl font-semibold text-app-text">{value}</p></div></div></SurfaceCard>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><span className="text-app-muted">{label}</span><span className="text-right font-semibold text-app-text">{value}</span></div>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="block"><span className="text-[11px] font-semibold text-app-muted">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-2xl border border-app-border bg-app-bg px-3 text-xs font-semibold text-app-text outline-none">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function ActionButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="flex items-center justify-center gap-1 rounded-2xl border border-app-border bg-white px-3 py-2 text-xs font-semibold text-app-muted transition hover:bg-app-hover hover:text-app-primary">{children}</button>;
}

function InsightMetric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <div className="rounded-2xl border border-app-border bg-white p-3"><p className="text-[11px] font-semibold text-app-muted">{label}</p><p className={`mt-1 text-xl font-semibold ${danger && value > 60 ? "text-red-600" : "text-app-primary"}`}>{value}%</p></div>;
}

function Modal({ title, closeLabel, children, onClose }: { title: string; closeLabel: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4"><div className="max-h-[90vh] w-full max-w-[460px] overflow-y-auto rounded-app border border-app-border bg-white p-5 shadow-app"><div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold text-app-text">{title}</h2><button type="button" onClick={onClose} className="rounded-2xl border border-app-border px-3 py-1 text-xs font-semibold text-app-muted">{closeLabel}</button></div>{children}</div></div>;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="text-xs font-semibold text-app-muted">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-app border border-app-border bg-app-bg px-4 py-3 text-sm outline-none focus:border-app-primary" /></label>;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function crmWorkspaceLabels(language: "ko" | "en" | "ja") {
  if (language === "en") return { retry: "Retry", search: "Search customers, company, tags", searchButton: "Search", noFollowUp: "No follow-up", company: "Company", nextContact: "Next contact", expectedValue: "Expected value", delete: "Delete", deleteConfirm: "Delete this customer? The record will be retained in the audit log.", timeline: "Customer timeline", aiInsight: "AI customer insight", contractProbability: "Contract probability", riskScore: "Risk score", nextAction: "Recommended next action", evidence: "Evidence", noInsight: "Select a customer to view analysis." };
  if (language === "ja") return { retry: "再試行", search: "顧客・会社・タグを検索", searchButton: "検索", noFollowUp: "フォロー予定なし", company: "会社", nextContact: "次回連絡", expectedValue: "予想金額", delete: "削除", deleteConfirm: "この顧客を削除しますか？監査ログは保持されます。", timeline: "顧客タイムライン", aiInsight: "AI顧客分析", contractProbability: "契約確率", riskScore: "リスクスコア", nextAction: "推奨アクション", evidence: "根拠", noInsight: "顧客を選択すると分析を表示します。" };
  return { retry: "다시 시도", search: "고객·회사·태그 검색", searchButton: "검색", noFollowUp: "후속 일정 없음", company: "회사", nextContact: "다음 연락", expectedValue: "예상 금액", delete: "삭제", deleteConfirm: "이 고객을 삭제할까요? 감사 기록은 유지됩니다.", timeline: "고객 타임라인", aiInsight: "AI 고객 분석", contractProbability: "계약 가능성", riskScore: "위험 점수", nextAction: "추천 다음 행동", evidence: "판단 근거", noInsight: "고객을 선택하면 분석을 표시합니다." };
}
