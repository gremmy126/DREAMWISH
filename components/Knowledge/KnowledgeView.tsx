"use client";

import { FileText, Link2, Network, Plus, Sparkles, Tags, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/Common/EmptyState";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import type { KnowledgeNote } from "@/src/lib/knowledge/knowledge.repository";
import {
  KNOWLEDGE_MEMORY_TABS,
  buildKnowledgeTabModel,
  type KnowledgeTabId
} from "@/src/lib/knowledge/knowledge-tabs";

type GraphNode = {
  id: string;
  title: string;
  x: number;
  y: number;
  tag: string;
};

export function KnowledgeView() {
  const [notes, setNotes] = useState<KnowledgeNote[]>([]);
  const [graph, setGraph] = useState<GraphNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<KnowledgeTabId>("network");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", tags: "" });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { t } = useAppLanguage();
  const selectedNode = graph.find((node) => node.id === selected) || graph[0] || null;
  const tabModel = useMemo(() => buildKnowledgeTabModel(notes), [notes]);

  useEffect(() => {
    void loadKnowledge();
  }, []);

  async function loadKnowledge() {
    const response = await fetch("/api/knowledge/notes");
    const data = (await response.json()) as { notes?: KnowledgeNote[]; graph?: GraphNode[] };
    setNotes(data.notes || []);
    setGraph(data.graph || []);
    setSelected((data.graph || [])[0]?.id || null);
  }

  async function createNote(sourceFileId: string | null = null) {
    const response = await fetch("/api/knowledge/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        body: form.body,
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        projectId: null,
        sourceFileId
      })
    });
    if (response.ok) {
      setForm({ title: "", body: "", tags: "" });
      setModalOpen(false);
      await loadKnowledge();
    }
  }

  async function createFromFile(file: globalThis.File) {
    const body = await file.text();
    const fileResponse = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: file.name,
        mimeType: file.type || "text/plain",
        size: file.size,
        source: "knowledge",
        textPreview: body.slice(0, 12000),
        projectId: null
      })
    });
    const fileData = (await fileResponse.json()) as { file?: { id: string } };
    const noteResponse = await fetch("/api/knowledge/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: file.name.replace(/\.[^.]+$/u, ""),
        body,
        tags: ["file"],
        projectId: null,
        sourceFileId: fileData.file?.id || null
      })
    });
    if (noteResponse.ok) await loadKnowledge();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-app-text">{t("knowledgePage.title")}</h1>
          <p className="mt-2 text-sm text-app-muted">{t("knowledgePage.description")}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-app-border bg-white px-4 text-sm font-semibold text-app-text shadow-soft hover:bg-app-hover">
            <Upload size={16} />{t("knowledgePage.addFile")}
          </button>
          <button type="button" onClick={() => setModalOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-app-primary px-4 text-sm font-semibold text-white shadow-soft">
            <Plus size={16} />{t("knowledgePage.addKnowledge")}
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept=".md,.txt,.json,.csv,.tsv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void createFromFile(file); event.currentTarget.value = ""; }} />
      </div>

      <div className="grid grid-cols-5 gap-4">
        <Metric icon={FileText} label={t("knowledgePage.totalNotes")} value={String(notes.length)} />
        <Metric icon={Link2} label={t("knowledgePage.linkedFiles")} value={String(notes.filter((note) => note.sourceFileId).length)} />
        <Metric icon={Network} label={t("knowledgePage.knowledgeNetwork")} value={String(graph.length)} />
        <Metric icon={Sparkles} label={t("knowledgePage.projectKnowledge")} value={String(notes.filter((note) => note.projectId).length)} />
        <Metric icon={Plus} label={t("knowledgePage.recentlyAdded")} value={notes[0] ? new Date(notes[0].createdAt).toLocaleDateString("ko-KR") : "-"} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_330px] gap-5">
        <SurfaceCard className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-app-border px-5 py-4">
            <div className="flex flex-wrap gap-2 text-sm font-semibold">
              {KNOWLEDGE_MEMORY_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-2xl px-3 py-1.5 text-xs ${
                    activeTab === tab.id
                      ? "bg-app-hover text-app-primary"
                      : "text-app-muted hover:bg-app-hover"
                  }`}
                  title={tab.description}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex gap-6 text-sm font-semibold">
              {[t("knowledgePage.graph"), t("knowledgePage.knowledgeNetwork"), t("knowledgePage.documents"), t("knowledgePage.tags"), t("knowledgePage.recommendations")].map((tab, index) => <span key={tab} className={index === 0 ? "text-app-primary" : "text-app-muted"}>{tab}</span>)}
            </div>
          </div>
          <div className="relative h-[520px] bg-[radial-gradient(circle,#e8eaf2_1px,transparent_1px)] [background-size:18px_18px]">
            {activeTab === "documents" ? (
              <div className="grid h-full grid-cols-2 gap-3 overflow-auto p-5 app-scrollbar">
                {tabModel.documents.map((note) => (
                  <article key={note.id} className="rounded-2xl border border-app-border bg-white p-4 shadow-soft">
                    <p className="truncate text-sm font-semibold text-app-text">{note.title}</p>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-app-muted">{note.body}</p>
                  </article>
                ))}
              </div>
            ) : activeTab === "tags" ? (
              <div className="flex h-full flex-wrap content-start gap-2 overflow-auto p-5 app-scrollbar">
                {tabModel.tags.map((tag) => (
                  <span key={tag.tag} className="rounded-2xl border border-app-border bg-white px-3 py-2 text-xs font-semibold text-app-text shadow-soft">
                    #{tag.tag} <span className="text-app-muted">{tag.count}</span>
                  </span>
                ))}
              </div>
            ) : activeTab === "recommendations" ? (
              <div className="grid h-full grid-cols-2 gap-3 overflow-auto p-5 app-scrollbar">
                {tabModel.recommendations.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-app-border bg-white p-4 shadow-soft">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-app-text">{item.title}</p>
                      <span className="text-[11px] font-semibold text-app-primary">{Math.round(item.strength * 100)}%</span>
                    </div>
                    <p className="mt-1 text-xs capitalize text-app-muted">{item.targetType}</p>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{item.reason}</p>
                  </article>
                ))}
              </div>
            ) : graph.length === 0 ? (
              <div className="flex h-full items-center justify-center p-6">
                <EmptyState icon={Network} title={t("knowledgePage.graphEmptyTitle")} description={t("knowledgePage.graphEmptyDescription")} />
              </div>
            ) : (
              <>
                <svg className="absolute inset-0 h-full w-full">
                  {graph.map((node) => <line key={node.id} x1="50%" y1="50%" x2={`${node.x + 8}%`} y2={`${node.y + 5}%`} stroke="#6D5DF6" strokeOpacity="0.45" strokeWidth="1.4" />)}
                </svg>
                <button className="absolute left-1/2 top-1/2 z-10 w-40 -translate-x-1/2 -translate-y-1/2 rounded-app bg-app-primary p-4 text-left text-white shadow-app">
                  <p className="text-sm font-semibold">{t("knowledgePage.centralNode")}</p>
                  <p className="mt-2 text-xs text-white/80">{t("knowledgePage.centralNodeDescription")}</p>
                </button>
                {graph.map((node) => <KnowledgeNode key={node.id} node={node} active={selected === node.id} onClick={() => setSelected(node.id)} />)}
              </>
            )}
          </div>
        </SurfaceCard>

        <div className="space-y-5">
          <SurfaceCard className="p-5">
            <h2 className="mb-4 text-base font-semibold text-app-text">{t("knowledgePage.selectedNode")}</h2>
            {selectedNode ? (
              <>
                <p className="text-lg font-semibold text-app-text">{selectedNode.title}</p>
                <p className="mt-2 text-sm leading-6 text-app-muted">{t("knowledgePage.tagLabel")}: {selectedNode.tag}</p>
              </>
            ) : (
              <p className="text-sm leading-6 text-app-muted">{t("knowledgePage.noSelected")}</p>
            )}
          </SurfaceCard>
          <SurfaceCard className="p-5">
            <h2 className="mb-4 text-base font-semibold text-app-text">{t("knowledgePage.recentNotes")}</h2>
            {notes.length === 0 ? <p className="text-sm text-app-muted">{t("knowledgePage.noNotes")}</p> : notes.slice(0, 5).map((note) => <div key={note.id} className="border-b border-app-border py-3 last:border-b-0"><p className="text-sm font-semibold text-app-text">{note.title}</p><p className="mt-1 line-clamp-2 text-xs text-app-muted">{note.body}</p></div>)}
          </SurfaceCard>
        </div>
      </div>

      {modalOpen ? (
        <Modal title={t("knowledgePage.addKnowledge")} closeLabel={t("common.close")} onClose={() => setModalOpen(false)}>
          <Input label={t("knowledgePage.titleField")} value={form.title} onChange={(title) => setForm((prev) => ({ ...prev, title }))} />
          <Input label={t("knowledgePage.tagsField")} value={form.tags} onChange={(tags) => setForm((prev) => ({ ...prev, tags }))} />
          <textarea value={form.body} onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))} className="mb-3 min-h-32 w-full rounded-app border border-app-border bg-app-bg px-4 py-3 text-sm outline-none focus:border-app-primary" placeholder={t("knowledgePage.bodyField")} />
          <button type="button" onClick={() => void createNote()} className="h-11 w-full rounded-app bg-app-primary text-sm font-semibold text-white">{t("common.save")}</button>
        </Modal>
      ) : null}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: string }) {
  return <SurfaceCard className="p-5"><div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-app-hover text-app-primary"><Icon size={20} /></div><div><p className="text-xs font-semibold text-app-muted">{label}</p><p className="mt-1 text-2xl font-semibold text-app-text">{value}</p></div></div></SurfaceCard>;
}

function KnowledgeNode({ node, active, onClick }: { node: GraphNode; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`absolute z-10 w-36 rounded-app border border-app-border bg-white p-3 text-left shadow-soft ${active ? "ring-2 ring-app-primary" : ""}`} style={{ left: `${node.x}%`, top: `${node.y}%` }}><p className="text-xs font-semibold text-app-text">{node.title}</p><p className="mt-2 flex items-center gap-2 text-[11px] text-app-muted"><Tags size={11} />{node.tag}</p></button>;
}

function Modal({ title, closeLabel, children, onClose }: { title: string; closeLabel: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4"><div className="w-[520px] rounded-app border border-app-border bg-white p-5 shadow-app"><div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold text-app-text">{title}</h2><button type="button" onClick={onClose} className="rounded-2xl border border-app-border px-3 py-1 text-xs font-semibold text-app-muted">{closeLabel}</button></div>{children}</div></div>;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="mb-3 block"><span className="text-xs font-semibold text-app-muted">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-app border border-app-border bg-app-bg px-4 py-3 text-sm outline-none focus:border-app-primary" /></label>;
}
