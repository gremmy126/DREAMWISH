"use client";

import { Activity, CalendarDays, CheckCircle2, Mail, Phone, Plus, Target, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/Common/EmptyState";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import type {
  CrmActivity,
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
  name: "",
  email: "",
  phone: "",
  companyName: "",
  position: "",
  memo: ""
};

export function CRMView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const selected = useMemo(
    () => customers.find((customer) => customer.id === selectedId) || customers[0] || null,
    [customers, selectedId]
  );
  const pipeline = useMemo(() => getCrmPipelineSummary(customers), [customers]);

  useEffect(() => {
    void loadCrm();
  }, []);

  async function loadCrm() {
    const response = await fetch("/api/crm/customers");
    const data = (await response.json()) as {
      customers?: Customer[];
      activities?: CrmActivity[];
    };
    setCustomers(data.customers || []);
    setActivities(data.activities || []);
    setSelectedId((data.customers || [])[0]?.id || null);
  }

  async function createCustomer() {
    const response = await fetch("/api/crm/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    if (response.ok) {
      setForm(emptyForm);
      setModalOpen(false);
      await loadCrm();
    }
  }

  async function updateSelectedCustomer(patch: {
    status?: CustomerStatus;
    importance?: CustomerImportance;
    activity?: Pick<CrmActivity, "type" | "title" | "body">;
  }) {
    if (!selected) return;
    const response = await fetch("/api/crm/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: selected.id, ...patch })
    });
    if (response.ok) await loadCrm();
  }

  async function addSelectedActivity(type: "note" | "task" | "email_draft") {
    if (!selected) return;
    const drafts = buildCrmActivityDrafts(selected.id, `${selected.name} follow-up`);
    const activity = drafts.find((draft) => draft.type === type) || drafts[0];
    await updateSelectedCustomer({ activity });
  }

  const activeCustomers = customers.filter((customer) => customer.status === "active").length;
  const leadCustomers = customers.filter((customer) => customer.status === "lead").length;

  return (
    <div className="space-y-5">
      <Header
        title="CRM"
        description="직접 추가한 고객, 외부 데이터 연결 후보, 승인 기반 Timeline을 관리합니다."
        action={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-app-primary px-4 text-sm font-semibold text-white shadow-soft"
          >
            <Plus size={16} />
            새 고객 초안
          </button>
        }
      />

      <div className="grid grid-cols-5 gap-4">
        <Metric icon={UsersRound} label="전체 고객" value={String(customers.length)} />
        <Metric icon={Target} label="리드" value={String(leadCustomers)} />
        <Metric icon={CheckCircle2} label="활성 고객" value={String(activeCustomers)} />
        <Metric icon={Activity} label="활동" value={String(activities.length)} />
        <Metric icon={CalendarDays} label="승인 대기" value="0" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-5">
        <SurfaceCard className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-app-text">고객 목록</h2>
            <span className="rounded-2xl border border-app-border bg-app-bg px-3 py-1 text-xs font-semibold text-app-muted">
              Local CRM
            </span>
          </div>
          {customers.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="고객 없음"
              description="새 고객 초안을 눌러 직접 고객을 추가하세요."
            />
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {customers.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => setSelectedId(customer.id)}
                  className={`rounded-app border bg-white p-4 text-left shadow-soft transition hover:bg-app-hover ${
                    selected?.id === customer.id ? "border-app-primary" : "border-app-border"
                  }`}
                >
                  <p className="truncate text-sm font-semibold text-app-text">{customer.name}</p>
                  <p className="mt-1 truncate text-xs text-app-muted">{customer.email || "이메일 없음"}</p>
                  <p className="mt-3 rounded-full bg-app-bg px-2 py-1 text-[11px] font-semibold text-app-muted">
                    {customer.status}
                  </p>
                </button>
              ))}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <div className="mb-5">
            <p className="text-base font-semibold text-app-text">고객 상세</p>
            <p className="mt-1 text-sm text-app-muted">{selected?.name || "선택된 고객 없음"}</p>
          </div>
          {selected ? (
            <>
              <div className="space-y-3 text-sm">
                <Detail label="이메일" value={selected.email || "-"} />
                <Detail label="전화" value={selected.phone || "-"} />
                <Detail label="직책" value={selected.position || "-"} />
                <Detail label="중요도" value={selected.importance} />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Select
                  label="Status"
                  value={selected.status}
                  options={["lead", "active", "paused", "inactive"]}
                  onChange={(status) =>
                    void updateSelectedCustomer({ status: status as CustomerStatus })
                  }
                />
                <Select
                  label="Importance"
                  value={selected.importance}
                  options={["low", "medium", "high", "critical"]}
                  onChange={(importance) =>
                    void updateSelectedCustomer({ importance: importance as CustomerImportance })
                  }
                />
              </div>
              <div className="mt-5 grid grid-cols-4 gap-2">
                {[Phone, Mail, Activity, CalendarDays].map((Icon, index) => (
                  <button
                    key={index}
                    type="button"
                    className="flex h-12 items-center justify-center rounded-2xl border border-app-border bg-white text-app-muted hover:bg-app-hover hover:text-app-primary"
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <ActionButton onClick={() => void addSelectedActivity("note")}>Note</ActionButton>
                <ActionButton onClick={() => void addSelectedActivity("task")}>Task</ActionButton>
                <ActionButton onClick={() => void addSelectedActivity("email_draft")}>
                  Draft
                </ActionButton>
              </div>
            </>
          ) : (
            <p className="text-sm leading-6 text-app-muted">고객을 만들면 상세 정보가 표시됩니다.</p>
          )}
        </SurfaceCard>
      </div>

      <SurfaceCard className="p-5">
        <h2 className="mb-4 text-base font-semibold text-app-text">최근 활동</h2>
        {activities.length === 0 ? (
          <p className="text-sm text-app-muted">아직 CRM 활동이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => (
              <div key={activity.id} className="rounded-2xl border border-app-border bg-white px-4 py-3">
                <p className="text-sm font-semibold text-app-text">{activity.title}</p>
                <p className="mt-1 text-xs text-app-muted">{activity.body}</p>
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard className="p-5">
        <h2 className="mb-4 text-base font-semibold text-app-text">Next Best Actions</h2>
        {pipeline.nextBestActions.length === 0 ? (
          <p className="text-sm text-app-muted">No CRM actions yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {pipeline.nextBestActions.map((item) => (
              <div key={item.customerId} className="rounded-2xl border border-app-border bg-app-bg p-3">
                <p className="truncate text-sm font-semibold text-app-text">{item.customerName}</p>
                <p className="mt-2 text-xs leading-5 text-app-muted">{item.action}</p>
                <p className="mt-2 text-[11px] font-semibold uppercase text-app-primary">{item.priority}</p>
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>

      {modalOpen ? (
        <Modal title="새 고객 초안" onClose={() => setModalOpen(false)}>
          <div className="grid gap-3">
            <Input label="이름" value={form.name} onChange={(name) => setForm((prev) => ({ ...prev, name }))} />
            <Input label="이메일" value={form.email} onChange={(email) => setForm((prev) => ({ ...prev, email }))} />
            <Input label="전화" value={form.phone} onChange={(phone) => setForm((prev) => ({ ...prev, phone }))} />
            <Input label="회사" value={form.companyName} onChange={(companyName) => setForm((prev) => ({ ...prev, companyName }))} />
            <Input label="직책" value={form.position} onChange={(position) => setForm((prev) => ({ ...prev, position }))} />
            <textarea
              value={form.memo}
              onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))}
              className="min-h-24 rounded-app border border-app-border bg-app-bg px-4 py-3 text-sm outline-none focus:border-app-primary"
              placeholder="메모"
            />
            <button
              type="button"
              onClick={() => void createCustomer()}
              className="h-11 rounded-app bg-app-primary text-sm font-semibold text-white"
            >
              저장
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function Header({ title, description, action }: { title: string; description: string; action: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-app-text">{title}</h1>
        <p className="mt-2 text-sm text-app-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof UsersRound; label: string; value: string }) {
  return (
    <SurfaceCard className="p-5">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-app-hover text-app-primary">
          <Icon size={20} />
        </div>
        <div>
          <p className="text-xs font-semibold text-app-muted">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-app-text">{value}</p>
        </div>
      </div>
    </SurfaceCard>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-app-muted">{label}</span>
      <span className="text-right font-semibold text-app-text">{value}</span>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-app-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-2xl border border-app-border bg-app-bg px-3 text-xs font-semibold text-app-text outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ActionButton({
  onClick,
  children
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-app-border bg-white px-3 py-2 text-xs font-semibold text-app-muted transition hover:bg-app-hover hover:text-app-primary"
    >
      {children}
    </button>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4">
      <div className="w-[460px] rounded-app border border-app-border bg-white p-5 shadow-app">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-app-text">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-2xl border border-app-border px-3 py-1 text-xs font-semibold text-app-muted">
            닫기
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-app-muted">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-app border border-app-border bg-app-bg px-4 py-3 text-sm outline-none focus:border-app-primary"
      />
    </label>
  );
}
