"use client";

import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Mail,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
  UsersRound
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/Common/EmptyState";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { readApiResponse } from "@/src/lib/api/api-response";
import { stringifyUnknownError } from "@/src/lib/auth/access-control";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import type {
  CrmActivity,
  CrmInsight,
  Customer,
  CustomerImportance,
  CustomerStatus
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

export function CRMView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [insights, setInsights] = useState<CrmInsight[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  useEffect(() => {
    void loadCrm("");
  }, []);

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
      }>(response);
      const nextCustomers = data.customers || [];
      setCustomers(nextCustomers);
      setActivities(data.activities || []);
      setInsights(data.insights || []);
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

  const activeCustomers = customers.filter((customer) => customer.status === "active").length;
  const leadCustomers = customers.filter((customer) => customer.status === "lead").length;
  const expectedRevenue = customers.reduce((sum, customer) => sum + customer.expectedValue, 0);

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
          <button type="button" onClick={() => setModalOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-app-primary px-4 text-sm font-semibold text-white shadow-soft">
            <Plus size={16} /> {t("crm.newCustomer")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={UsersRound} label={t("crm.totalCustomers")} value={String(customers.length)} />
        <Metric icon={Target} label={t("crm.leads")} value={String(leadCustomers)} />
        <Metric icon={CheckCircle2} label={t("crm.activeCustomers")} value={String(activeCustomers)} />
        <Metric icon={Activity} label={t("crm.activities")} value={String(activities.length)} />
        <Metric icon={CalendarDays} label={labels.expectedRevenue} value={expectedRevenue.toLocaleString()} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <SurfaceCard className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-app-text">{t("crm.customerList")}</h2>
            <span className="rounded-2xl border border-app-border bg-app-bg px-3 py-1 text-xs font-semibold text-app-muted">{t("crm.localCrm")}</span>
          </div>
          {customers.length === 0 ? (
            <EmptyState icon={UsersRound} title={t("crm.emptyTitle")} description={t("crm.emptyDescription")} />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {customers.map((customer) => (
                <button key={customer.id} type="button" onClick={() => setSelectedId(customer.id)} className={`rounded-app border bg-white p-4 text-left shadow-soft transition hover:bg-app-hover ${selected?.id === customer.id ? "border-app-primary" : "border-app-border"}`}>
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
              <button type="button" disabled={busy} onClick={() => void deleteSelectedCustomer()} className="inline-flex items-center gap-1 rounded-xl border border-red-200 px-2 py-1.5 text-xs font-semibold text-red-600">
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
                <Select label={t("crm.status")} value={selected.status} options={["lead", "active", "paused", "inactive"]} onChange={(status) => void updateSelectedCustomer({ status: status as CustomerStatus })} />
                <Select label={t("crm.importance")} value={selected.importance} options={["low", "medium", "high", "critical"]} onChange={(importance) => void updateSelectedCustomer({ importance: importance as CustomerImportance })} />
              </div>
              <label className="block text-xs font-semibold text-app-muted">
                {labels.nextContact}
                <input type="datetime-local" value={toLocalDateTime(selected.nextContactAt)} onChange={(event) => void updateSelectedCustomer({ nextContactAt: event.target.value ? new Date(event.target.value).toISOString() : "" })} className="mt-1 h-10 w-full rounded-xl border border-app-border bg-app-bg px-3 text-xs outline-none" />
              </label>
              <label className="block text-xs font-semibold text-app-muted">
                {labels.expectedValue}
                <input type="number" min="0" value={selected.expectedValue} onChange={(event) => void updateSelectedCustomer({ expectedValue: Number(event.target.value) || 0 })} className="mt-1 h-10 w-full rounded-xl border border-app-border bg-app-bg px-3 text-xs outline-none" />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <ActionButton onClick={() => void addSelectedActivity("note")}>{t("crm.note")}</ActionButton>
                <ActionButton onClick={() => void addSelectedActivity("task")}>{t("crm.task")}</ActionButton>
                <ActionButton onClick={() => void addSelectedActivity("email_draft")}><Mail size={13} /> {t("crm.draft")}</ActionButton>
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

      <SurfaceCard className="p-5">
        <h2 className="mb-4 text-base font-semibold text-app-text">{t("crm.nextBestActions")}</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pipeline.nextBestActions.map((item) => (
            <button key={item.customerId} type="button" onClick={() => setSelectedId(item.customerId)} className="rounded-2xl border border-app-border bg-app-bg p-3 text-left">
              <p className="truncate text-sm font-semibold text-app-text">{item.customerName}</p>
              <p className="mt-2 text-xs leading-5 text-app-muted">{item.action}</p>
              <p className="mt-2 text-[11px] font-semibold uppercase text-app-primary">{item.priority}</p>
            </button>
          ))}
        </div>
      </SurfaceCard>

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

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function crmWorkspaceLabels(language: "ko" | "en" | "ja") {
  if (language === "en") return { retry: "Retry", search: "Search customers, company, tags", searchButton: "Search", expectedRevenue: "Expected revenue", noFollowUp: "No follow-up", company: "Company", nextContact: "Next contact", expectedValue: "Expected value", delete: "Delete", deleteConfirm: "Delete this customer? The record will be retained in the audit log.", timeline: "Customer timeline", aiInsight: "AI customer insight", contractProbability: "Contract probability", riskScore: "Risk score", nextAction: "Recommended next action", evidence: "Evidence", noInsight: "Select a customer to view analysis." };
  if (language === "ja") return { retry: "再試行", search: "顧客・会社・タグを検索", searchButton: "検索", expectedRevenue: "予想売上", noFollowUp: "フォロー予定なし", company: "会社", nextContact: "次回連絡", expectedValue: "予想金額", delete: "削除", deleteConfirm: "この顧客を削除しますか？監査ログは保持されます。", timeline: "顧客タイムライン", aiInsight: "AI顧客分析", contractProbability: "契約確率", riskScore: "リスクスコア", nextAction: "推奨アクション", evidence: "根拠", noInsight: "顧客を選択すると分析を表示します。" };
  return { retry: "다시 시도", search: "고객·회사·태그 검색", searchButton: "검색", expectedRevenue: "예상 매출", noFollowUp: "후속 일정 없음", company: "회사", nextContact: "다음 연락", expectedValue: "예상 금액", delete: "삭제", deleteConfirm: "이 고객을 삭제할까요? 감사 기록은 유지됩니다.", timeline: "고객 타임라인", aiInsight: "AI 고객 분석", contractProbability: "계약 가능성", riskScore: "위험 점수", nextAction: "추천 다음 행동", evidence: "판단 근거", noInsight: "고객을 선택하면 분석을 표시합니다." };
}
