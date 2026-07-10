"use client";

import { BarChart3, CheckCircle2, Clock3, Play, Plus, ScrollText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/Common/EmptyState";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import type { AutomationRecord } from "@/src/lib/automation/automation.repository";
import {
  actionExamples,
  buildAutomationDraftTemplate,
  triggerExamples
} from "@/src/lib/automation/automation-designer";

export function AutomationView() {
  const [rows, setRows] = useState<AutomationRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", trigger: "", action: "" });
  const { t } = useAppLanguage();
  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) || rows[0] || null,
    [rows, selectedId]
  );
  const automationPreview = useMemo(() => buildAutomationDraftTemplate(form), [form]);

  useEffect(() => {
    void loadAutomations();
  }, []);

  async function loadAutomations() {
    const response = await fetch("/api/automation/automations");
    const data = (await response.json()) as { automations?: AutomationRecord[] };
    setRows(data.automations || []);
    setSelectedId((data.automations || [])[0]?.id || null);
  }

  async function createAutomation() {
    const response = await fetch("/api/automation/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    if (response.ok) {
      setForm({ name: "", trigger: "", action: "" });
      setModalOpen(false);
      await loadAutomations();
    }
  }

  return (
    <div className="space-y-5">
      <Header title={t("automation.title")} description={t("automation.description")} action={<button type="button" onClick={() => setModalOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-app-primary px-4 text-sm font-semibold text-white shadow-soft"><Plus size={16} />{t("automation.newAutomation")}</button>} />

      <div className="grid grid-cols-4 gap-4">
        <Metric icon={Play} label={t("automation.activeAutomations")} value={String(rows.filter((row) => row.status === "active").length)} />
        <Metric icon={BarChart3} label={t("automation.totalAutomations")} value={String(rows.length)} />
        <Metric icon={CheckCircle2} label={t("automation.approvalQueue")} value="0" />
        <Metric icon={Clock3} label={t("automation.runHistory")} value={String(rows.reduce((sum, row) => sum + row.runs, 0))} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-5">
        <SurfaceCard className="overflow-hidden">
          <div className="border-b border-app-border px-5 py-4">
            <p className="text-base font-semibold text-app-text">{t("automation.listTitle")}</p>
          </div>
          {rows.length === 0 ? (
            <div className="p-8">
              <EmptyState icon={ScrollText} title={t("automation.emptyTitle")} description={t("automation.emptyDescription")} />
            </div>
          ) : (
            rows.map((row) => (
              <button key={row.id} type="button" onClick={() => setSelectedId(row.id)} className={`grid w-full grid-cols-[minmax(220px,1fr)_120px_160px_100px] items-center border-b border-app-border px-5 py-4 text-left text-sm last:border-b-0 hover:bg-app-hover ${selectedId === row.id ? "bg-app-hover" : "bg-white"}`}>
                <span><span className="block font-semibold text-app-text">{row.name}</span><span className="text-xs text-app-muted">{row.action}</span></span>
                <Status status={row.status} />
                <span className="text-app-muted">{row.trigger}</span>
                <span className="font-semibold text-app-text">{row.runs}</span>
              </button>
            ))
          )}
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <p className="text-lg font-semibold text-app-text">{selected?.name || t("automation.noSelected")}</p>
          <p className="mt-2 text-sm leading-6 text-app-muted">
            {selected ? t("automation.selectedDescription") : t("automation.createDetailsHint")}
          </p>
          {selected ? (
            <div className="mt-5 space-y-3 text-sm">
              <Detail label={t("automation.trigger")} value={selected.trigger} />
              <Detail label={t("automation.action")} value={selected.action} />
              <Detail label={t("automation.status")} value={selected.status} />
              <Detail label={t("automation.successRate")} value={`${selected.successRate}%`} />
            </div>
          ) : null}
        </SurfaceCard>
      </div>

      {modalOpen ? (
        <Modal title={t("automation.newAutomation")} closeLabel={t("common.close")} onClose={() => setModalOpen(false)}>
          <Input label={t("automation.name")} value={form.name} onChange={(name) => setForm((prev) => ({ ...prev, name }))} />
          <Input label={t("automation.trigger")} value={form.trigger} onChange={(trigger) => setForm((prev) => ({ ...prev, trigger }))} />
          <Input label={t("automation.action")} value={form.action} onChange={(action) => setForm((prev) => ({ ...prev, action }))} />
          <button type="button" onClick={() => void createAutomation()} className="mt-3 h-11 w-full rounded-app bg-app-primary text-sm font-semibold text-white">{t("common.save")}</button>
          <AutomationHelp
            triggerHelp={automationPreview.triggerHelp}
            actionHelp={automationPreview.actionHelp}
            triggerLabel={t("automation.trigger")}
            actionLabel={t("automation.action")}
            triggerExamples={triggerExamples.map((item) => item.value)}
            actionExamples={actionExamples.map((item) => item.value)}
            previewFlowLabel={t("automation.previewFlow")}
            previewSteps={automationPreview.previewSteps}
            onTrigger={(trigger) => setForm((prev) => ({ ...prev, trigger }))}
            onAction={(action) => setForm((prev) => ({ ...prev, action }))}
          />
        </Modal>
      ) : null}
    </div>
  );
}

function Header({ title, description, action }: { title: string; description: string; action: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold text-app-text">{title}</h1><p className="mt-2 text-sm text-app-muted">{description}</p></div>{action}</div>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Play; label: string; value: string }) {
  return <SurfaceCard className="p-5"><div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-app-hover text-app-primary"><Icon size={20} /></div><div><p className="text-xs font-semibold text-app-muted">{label}</p><p className="mt-1 text-2xl font-semibold text-app-text">{value}</p></div></div></SurfaceCard>;
}

function Status({ status }: { status: AutomationRecord["status"] }) {
  const className = status === "active" ? "bg-emerald-50 text-emerald-700" : status === "error" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600";
  return <span className={`w-fit rounded-full px-2 py-1 text-xs font-semibold ${className}`}>{status}</span>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-app-muted">{label}</span><span className="font-semibold text-app-text">{value}</span></div>;
}

function Modal({ title, closeLabel, children, onClose }: { title: string; closeLabel: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4"><div className="w-[440px] rounded-app border border-app-border bg-white p-5 shadow-app"><div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold text-app-text">{title}</h2><button type="button" onClick={onClose} className="rounded-2xl border border-app-border px-3 py-1 text-xs font-semibold text-app-muted">{closeLabel}</button></div>{children}</div></div>;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="mb-3 block"><span className="text-xs font-semibold text-app-muted">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-app border border-app-border bg-app-bg px-4 py-3 text-sm outline-none focus:border-app-primary" /></label>;
}

function AutomationHelp({
  triggerHelp,
  actionHelp,
  triggerLabel,
  actionLabel,
  triggerExamples,
  actionExamples,
  previewFlowLabel,
  previewSteps,
  onTrigger,
  onAction
}: {
  triggerHelp: string;
  actionHelp: string;
  triggerLabel: string;
  actionLabel: string;
  triggerExamples: string[];
  actionExamples: string[];
  previewFlowLabel: string;
  previewSteps: string[];
  onTrigger: (value: string) => void;
  onAction: (value: string) => void;
}) {
  return (
    <div className="mt-3 space-y-3 rounded-app border border-app-border bg-app-bg p-3">
      <HelpGroup label={triggerLabel} description={triggerHelp} examples={triggerExamples} onPick={onTrigger} />
      <HelpGroup label={actionLabel} description={actionHelp} examples={actionExamples} onPick={onAction} />
      <div>
        <p className="text-xs font-semibold text-app-text">{previewFlowLabel}</p>
        <div className="mt-2 space-y-1">
          {previewSteps.map((step) => (
            <p key={step} className="text-xs leading-5 text-app-muted">{step}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function HelpGroup({
  label,
  description,
  examples,
  onPick
}: {
  label: string;
  description: string;
  examples: string[];
  onPick: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-app-text">{label}</p>
      <p className="mt-1 text-xs leading-5 text-app-muted">{description}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {examples.slice(0, 3).map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onPick(example)}
            className="rounded-xl border border-app-border bg-white px-2 py-1 text-[11px] font-semibold text-app-muted hover:bg-app-hover"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
