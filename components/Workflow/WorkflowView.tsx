"use client";

import { AlertTriangle, CheckCircle2, Clock3, LayoutTemplate, Play, Plus, Workflow } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/Common/EmptyState";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import { APP_TRANSLATIONS } from "@/src/lib/i18n/translations";
import type { Workflow as WorkflowRecord } from "@/src/lib/automation/workflow.types";

export function WorkflowView() {
  const [workspaces, setWorkspaces] = useState<WorkflowRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", triggerType: "manual" });
  const { language, t } = useAppLanguage();
  const selected = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedId) || workspaces[0] || null,
    [workspaces, selectedId]
  );

  useEffect(() => {
    void loadWorkspaces();
  }, []);

  async function loadWorkspaces() {
    const response = await fetch("/api/workflow/workspaces");
    const data = (await response.json()) as { workspaces?: WorkflowRecord[] };
    setWorkspaces(data.workspaces || []);
    setSelectedId((data.workspaces || [])[0]?.id || null);
  }

  async function createWorkspace() {
    const response = await fetch("/api/workflow/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    if (response.ok) {
      setForm({ name: "", description: "", triggerType: "manual" });
      setModalOpen(false);
      await loadWorkspaces();
    }
  }

  return (
    <div className="space-y-5">
      <Header
        title={t("workflow.title")}
        description={t("workflow.description")}
        action={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-app-primary px-4 text-sm font-semibold text-white shadow-soft"
          >
            <Plus size={16} />
            {t("workflow.newWorkspace")}
          </button>
        }
      />

      <div className="grid grid-cols-5 gap-4">
        <Metric icon={Workflow} label="Workspace" value={String(workspaces.length)} />
        <Metric icon={Play} label={t("workflow.active")} value={String(workspaces.filter((item) => item.status === "active").length)} />
        <Metric icon={CheckCircle2} label={t("workflow.draft")} value={String(workspaces.filter((item) => item.status === "draft").length)} />
        <Metric icon={AlertTriangle} label={t("workflow.approvalQueue")} value="0" />
        <Metric icon={Clock3} label={t("workflow.averageRun")} value="-" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-5">
        <SurfaceCard className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-app-text">{t("workflow.workspaceList")}</h2>
            <span className="rounded-2xl border border-app-border bg-app-bg px-3 py-1 text-xs text-app-muted">{t("workflow.savedReal")}</span>
          </div>
          {workspaces.length === 0 ? (
            <EmptyState icon={LayoutTemplate} title={t("workflow.emptyTitle")} description={t("workflow.emptyDescription")} />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  onClick={() => setSelectedId(workspace.id)}
                  className={`rounded-app border bg-white p-4 text-left shadow-soft transition hover:bg-app-hover ${
                    selected?.id === workspace.id ? "border-app-primary" : "border-app-border"
                  }`}
                >
                  <p className="text-sm font-semibold text-app-text">{workspace.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-app-muted">{workspace.description}</p>
                  <p className="mt-3 text-xs font-semibold text-app-primary">{workspace.trigger.label}</p>
                </button>
              ))}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <p className="text-lg font-semibold text-app-text">{selected?.name || t("workflow.noSelected")}</p>
          <p className="mt-2 text-sm leading-6 text-app-muted">
            {selected?.description || t("workflow.createDetailsHint")}
          </p>
          {selected ? (
            <div className="mt-5 space-y-3 text-sm">
              <Detail label={t("workflow.trigger")} value={selected.trigger.label} />
              <Detail label={t("workflow.conditions")} value={String(selected.conditions.length)} />
              <Detail label={t("workflow.actions")} value={String(selected.actions.length)} />
              <Detail label={t("workflow.status")} value={selected.status} />
            </div>
          ) : null}
        </SurfaceCard>
      </div>

      <SurfaceCard className="overflow-hidden">
        <div className="border-b border-app-border px-5 py-4">
          <p className="text-base font-semibold text-app-text">
            {selected?.name || t("workflow.flowTitle")}
          </p>
          <p className="mt-1 text-xs text-app-muted">{t("workflow.flowDescription")}</p>
        </div>
        <div className="relative h-[280px] bg-[radial-gradient(circle,#e8eaf2_1px,transparent_1px)] [background-size:18px_18px]">
          {APP_TRANSLATIONS[language].workflow.steps.map((label, index) => (
            <div key={label} className="absolute top-[42%] z-10 w-32 rounded-app border border-app-border bg-white p-3 text-center shadow-soft" style={{ left: `${8 + index * 20}%` }}>
              <p className="text-xs font-semibold text-app-text">{label}</p>
            </div>
          ))}
        </div>
      </SurfaceCard>

      {modalOpen ? (
        <Modal title={t("workflow.newWorkspace")} closeLabel={t("common.close")} onClose={() => setModalOpen(false)}>
          <Input label={t("workflow.name")} value={form.name} onChange={(name) => setForm((prev) => ({ ...prev, name }))} />
          <textarea
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            className="mt-3 min-h-24 w-full rounded-app border border-app-border bg-app-bg px-4 py-3 text-sm outline-none focus:border-app-primary"
            placeholder={t("workflow.descriptionField")}
          />
          <button type="button" onClick={() => void createWorkspace()} className="mt-3 h-11 w-full rounded-app bg-app-primary text-sm font-semibold text-white">
            {t("common.save")}
          </button>
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

function Metric({ icon: Icon, label, value }: { icon: typeof Workflow; label: string; value: string }) {
  return (
    <SurfaceCard className="p-5">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-app-hover text-app-primary"><Icon size={20} /></div>
        <div>
          <p className="text-xs font-semibold text-app-muted">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-app-text">{value}</p>
        </div>
      </div>
    </SurfaceCard>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><span className="text-app-muted">{label}</span><span className="font-semibold text-app-text">{value}</span></div>;
}

function Modal({ title, closeLabel, children, onClose }: { title: string; closeLabel: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4"><div className="w-[460px] rounded-app border border-app-border bg-white p-5 shadow-app"><div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold text-app-text">{title}</h2><button type="button" onClick={onClose} className="rounded-2xl border border-app-border px-3 py-1 text-xs font-semibold text-app-muted">{closeLabel}</button></div>{children}</div></div>;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="text-xs font-semibold text-app-muted">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-app border border-app-border bg-app-bg px-4 py-3 text-sm outline-none focus:border-app-primary" /></label>;
}
