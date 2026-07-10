"use client";

import {
  AlertTriangle,
  BarChart3,
  Brain,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  FolderOpen,
  Inbox,
  Link2,
  Link2Off,
  Network,
  RefreshCw,
  ShieldCheck,
  Tags,
  UserRound
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/Common/EmptyState";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import type { AppLanguage } from "@/src/lib/i18n/translations";
import type {
  KnowledgeEntity,
  MemoryCandidate,
  MemoryDashboardSnapshot
} from "@/src/lib/memory/memory.types";
import type { KnowledgeNote } from "@/src/lib/knowledge/knowledge.repository";
import {
  KNOWLEDGE_MEMORY_TABS,
  buildKnowledgeTabModel,
  type KnowledgeTabId
} from "@/src/lib/knowledge/knowledge-tabs";

export function MemoryView() {
  const [snapshot, setSnapshot] = useState<MemoryDashboardSnapshot | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [knowledgeNotes, setKnowledgeNotes] = useState<KnowledgeNote[]>([]);
  const [knowledgeTab, setKnowledgeTab] = useState<KnowledgeTabId>("network");
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const { language, t } = useAppLanguage();

  useEffect(() => {
    void loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    const [response, knowledgeResponse] = await Promise.all([
      fetch("/api/memory/dashboard"),
      fetch("/api/knowledge/notes")
    ]);
    const data = (await response.json()) as MemoryDashboardSnapshot;
    const knowledgeData = (await knowledgeResponse.json()) as { notes?: KnowledgeNote[] };
    setSnapshot(data);
    setKnowledgeNotes(knowledgeData.notes || []);
    setSelectedNodeId(data.knowledgeNetwork.nodes[0]?.id || null);
    setLoading(false);
  }

  async function approveCandidate(candidate: MemoryCandidate) {
    setApprovingId(candidate.id);
    const response = await fetch(`/api/memory/candidates/${candidate.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "user", note: "Approved from Memory Inbox" })
    });
    setApprovingId(null);
    if (response.ok) await loadDashboard();
  }

  const selectedNode = useMemo(
    () => snapshot?.knowledgeNetwork.nodes.find((node) => node.id === selectedNodeId) || null,
    [snapshot, selectedNodeId]
  );
  const knowledgeModel = useMemo(
    () => buildKnowledgeTabModel(knowledgeNotes),
    [knowledgeNotes]
  );

  async function acceptKnowledgeRecommendation(
    recommendation: (typeof knowledgeModel.recommendations)[number]
  ) {
    if (recommendation.targetType !== "app" && recommendation.targetType !== "website") {
      setConnectionMessage(t("memory.connectionPinned", { title: recommendation.title }));
      return;
    }

    const response = await fetch("/api/local/connections/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: recommendation.targetType,
        externalTargetId: recommendation.targetId,
        targetPath: recommendation.targetId,
        approved: true
      })
    });
    const data = (await response.json()) as { message?: string };
    setConnectionMessage(data.message || t("memory.connectionAccepted"));
  }

  if (loading && !snapshot) {
    return (
      <SurfaceCard className="min-h-[520px] p-6">
        <EmptyState icon={Brain} title={t("memory.loadingTitle")} description={t("memory.loadingDescription")} />
      </SurfaceCard>
    );
  }

  if (!snapshot) {
    return (
      <SurfaceCard className="min-h-[520px] p-6">
        <EmptyState icon={AlertTriangle} title={t("memory.loadFailedTitle")} description={t("memory.loadFailedDescription")} />
      </SurfaceCard>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-app-text">{t("memory.title")}</h1>
          <p className="mt-2 text-sm text-app-muted">
            {t("memory.description")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadDashboard()}
          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-app-border bg-white px-3 text-xs font-semibold text-app-text shadow-soft transition hover:bg-app-hover hover:text-app-primary"
        >
          <RefreshCw size={14} />
          {t("memory.refresh")}
        </button>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <Metric icon={Inbox} label={t("memory.inbox")} value={snapshot.statistics.totalCandidates} />
        <Metric icon={Brain} label={t("memory.approvedMemory")} value={snapshot.statistics.totalMemories} />
        <Metric icon={UserRound} label={t("memory.people")} value={snapshot.statistics.totalPeople} />
        <Metric icon={FolderOpen} label={t("memory.projects")} value={snapshot.statistics.totalProjects} />
        <Metric icon={Network} label={t("memory.edges")} value={snapshot.statistics.totalEdges} />
      </div>

      <SurfaceCard className="p-5">
        <PanelTitle icon={Network} title={t("memory.knowledge")} detail={`${knowledgeNotes.length} ${t("memory.documents")}`} />
        <div className="mb-4 flex flex-wrap gap-2">
          {KNOWLEDGE_MEMORY_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setKnowledgeTab(tab.id)}
              className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                knowledgeTab === tab.id
                  ? "border-app-primary bg-app-hover text-app-primary"
                  : "border-app-border bg-white text-app-muted hover:bg-app-hover"
              }`}
              title={tab.description}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {connectionMessage ? (
          <p className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {connectionMessage}
          </p>
        ) : null}
        {knowledgeTab === "network" ? (
          <div className="grid grid-cols-3 gap-3">
            <KnowledgeMiniMetric icon={Network} label="Network nodes" value={snapshot.knowledgeNetwork.nodes.length} />
            <KnowledgeMiniMetric icon={Link2} label="Edges" value={snapshot.knowledgeNetwork.edges.length} />
            <KnowledgeMiniMetric icon={Tags} label="Tags" value={knowledgeModel.tags.length} />
          </div>
        ) : null}
        {knowledgeTab === "documents" ? (
          <div className="grid grid-cols-2 gap-3">
            {knowledgeModel.documents.slice(0, 8).map((note) => (
              <div key={note.id} className="rounded-2xl border border-app-border bg-app-bg p-3">
                <p className="truncate text-sm font-semibold text-app-text">{note.title}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-app-muted">{note.body}</p>
              </div>
            ))}
            {knowledgeModel.documents.length === 0 ? (
              <p className="text-sm text-app-muted">{t("memory.noDocuments")}</p>
            ) : null}
          </div>
        ) : null}
        {knowledgeTab === "tags" ? (
          <div className="flex flex-wrap gap-2">
            {knowledgeModel.tags.map((tag) => (
              <span key={tag.tag} className="rounded-2xl border border-app-border bg-app-bg px-3 py-2 text-xs font-semibold text-app-text">
                #{tag.tag} <span className="text-app-muted">{tag.count}</span>
              </span>
            ))}
            {knowledgeModel.tags.length === 0 ? (
              <p className="text-sm text-app-muted">{t("memory.noTags")}</p>
            ) : null}
          </div>
        ) : null}
        {knowledgeTab === "recommendations" ? (
          <div className="grid grid-cols-2 gap-3">
            {knowledgeModel.recommendations.slice(0, 6).map((recommendation) => (
              <div key={recommendation.id} className="rounded-2xl border border-app-border bg-app-bg p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-app-text">{recommendation.title}</p>
                  <span className="text-[11px] font-semibold text-app-primary">{Math.round(recommendation.strength * 100)}%</span>
                </div>
                <p className="mt-1 text-xs capitalize text-app-muted">{recommendation.targetType}</p>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{recommendation.reason}</p>
                <button
                  type="button"
                  onClick={() => void acceptKnowledgeRecommendation(recommendation)}
                  className="mt-3 rounded-xl bg-app-primary px-3 py-1.5 text-[11px] font-semibold text-white"
                >
                  {t("memory.acceptConnection")}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </SurfaceCard>

      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] gap-5">
        <SurfaceCard className="p-5">
          <PanelTitle icon={Inbox} title={t("memory.memoryInbox")} detail={`${snapshot.inbox.length} ${t("memory.pending")}`} />
          {snapshot.inbox.length === 0 ? (
            <EmptyState icon={CheckCircle2} title={t("memory.noPendingTitle")} description={t("memory.noPendingDescription")} compact />
          ) : (
            <div className="space-y-3">
              {snapshot.inbox.map((candidate) => (
                <div key={candidate.id} className="rounded-app border border-app-border bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-app-text">{candidate.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-app-muted">{candidate.preview}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void approveCandidate(candidate)}
                      disabled={approvingId === candidate.id}
                      className="h-9 shrink-0 rounded-2xl bg-app-primary px-3 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {approvingId === candidate.id ? t("memory.approving") : t("memory.approve")}
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-[11px] font-semibold text-app-muted">
                    <Score label={t("memory.importance")} value={candidate.importance} />
                    <Score label={t("memory.recency")} value={candidate.recency} />
                    <Score label={t("memory.frequency")} value={candidate.frequency} raw />
                    <Score label={t("memory.confidence")} value={candidate.confidence} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <PanelTitle icon={CalendarDays} title={t("memory.dailyBrief")} detail={snapshot.dailyBrief.date} />
          <BriefList title={t("memory.todayTasks")} items={snapshot.dailyBrief.todayTasks} empty={t("memory.noItems")} />
          <BriefList title={t("memory.recentProjects")} items={snapshot.dailyBrief.recentProjects} empty={t("memory.noItems")} />
          <BriefList title={t("memory.unresolvedIssues")} items={snapshot.dailyBrief.unresolvedIssues} empty={t("memory.noItems")} />
          <BriefList title={t("memory.likelyForgotten")} items={snapshot.dailyBrief.likelyForgotten} empty={t("memory.noItems")} />
        </SurfaceCard>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_330px] gap-5">
        <SurfaceCard className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-app-border px-5 py-4">
            <PanelTitle icon={Network} title={t("memory.knowledgeNetwork")} detail={`${snapshot.knowledgeNetwork.nodes.length} ${t("memory.networkNodes")}`} compact />
          </div>
          <div className="relative h-[420px] bg-[radial-gradient(circle,#e8eaf2_1px,transparent_1px)] [background-size:18px_18px]">
            {snapshot.knowledgeNetwork.nodes.length === 0 ? (
              <EmptyState icon={Network} title={t("memory.networkEmptyTitle")} description={t("memory.networkEmptyDescription")} />
            ) : (
              <>
                <svg className="absolute inset-0 h-full w-full">
                  {snapshot.knowledgeNetwork.edges.slice(0, 40).map((edge, index) => (
                    <line
                      key={edge.id}
                      x1={`${nodePosition(index, 1).x}%`}
                      y1={`${nodePosition(index, 1).y}%`}
                      x2={`${nodePosition(index, 2).x}%`}
                      y2={`${nodePosition(index, 2).y}%`}
                      stroke="#6D5DF6"
                      strokeOpacity="0.3"
                    />
                  ))}
                </svg>
                {snapshot.knowledgeNetwork.nodes.slice(0, 18).map((node, index) => {
                  const position = nodePosition(index);
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`absolute z-10 w-36 rounded-app border bg-white p-3 text-left shadow-soft transition hover:-translate-y-0.5 ${
                        selectedNodeId === node.id ? "border-app-primary ring-2 ring-app-primary/20" : "border-app-border"
                      }`}
                      style={{ left: `${position.x}%`, top: `${position.y}%` }}
                    >
                      <p className="truncate text-xs font-semibold text-app-text">{node.label}</p>
                      <p className="mt-1 text-[11px] capitalize text-app-muted">{node.type}</p>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </SurfaceCard>

        <div className="space-y-5">
          <SurfaceCard className="p-5">
            <PanelTitle icon={ShieldCheck} title={t("memory.selectedEntity")} detail={selectedNode?.type || "-"} />
            {selectedNode ? (
              <div className="space-y-3 text-sm">
                <p className="text-lg font-semibold text-app-text">{selectedNode.label}</p>
                <Detail label={t("memory.confidence")} value={`${Math.round(selectedNode.confidence * 100)}%`} />
                <Detail label={t("memory.sources")} value={String(selectedNode.sourceIds.length)} />
              </div>
            ) : (
              <p className="text-sm text-app-muted">{t("memory.noSelectedEntity")}</p>
            )}
          </SurfaceCard>
          <EntityList title={t("memory.people")} icon={UserRound} items={snapshot.people} emptySuffix={t("memory.noItems")} />
          <EntityList title={t("memory.projects")} icon={FolderOpen} items={snapshot.projects} emptySuffix={t("memory.noItems")} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <SurfaceCard className="p-5">
          <PanelTitle icon={Brain} title={t("memory.recentMemory")} detail={`${snapshot.recentMemory.length}`} />
          <SimpleList items={snapshot.recentMemory.map((memory) => memory.title)} empty={t("memory.noMemory")} />
        </SurfaceCard>
        <SurfaceCard className="p-5">
          <PanelTitle icon={Clock3} title={t("memory.timeline")} detail={`${snapshot.timeline.length}`} />
          <SimpleList items={snapshot.timeline.map((item) => `${item.title} · ${formatDate(item.createdAt, language)}`)} empty={t("memory.noTimeline")} />
        </SurfaceCard>
        <SurfaceCard className="p-5">
          <PanelTitle icon={BarChart3} title={t("memory.memoryHealth")} detail={t("memory.localFirst")} />
          <Detail label={t("memory.approvalQueue")} value={String(snapshot.health.approvalQueueSize)} />
          <Detail label={t("memory.duplicateSuggestions")} value={String(snapshot.health.duplicateSuggestions.length)} />
          <Detail label={t("memory.brokenLinks")} value={String(snapshot.health.brokenLinkCount)} />
          {snapshot.health.brokenLinks.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">
              <div className="mb-2 flex items-center gap-2 font-semibold">
                <Link2Off size={13} />
                {t("memory.brokenLinks")}
              </div>
              {snapshot.health.brokenLinks.slice(0, 4).map((link) => (
                <p key={link} className="truncate">{link}</p>
              ))}
            </div>
          ) : null}
        </SurfaceCard>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Inbox; label: string; value: number }) {
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

function KnowledgeMiniMetric({
  icon: Icon,
  label,
  value
}: {
  icon: typeof FileText;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-app-border bg-app-bg p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-app-muted">
        <Icon size={14} className="text-app-primary" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold text-app-text">{value}</p>
    </div>
  );
}

function PanelTitle({ icon: Icon, title, detail, compact = false }: { icon: typeof Inbox; title: string; detail?: string; compact?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${compact ? "w-full" : "mb-4"}`}>
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-app-primary" />
        <h2 className="text-base font-semibold text-app-text">{title}</h2>
      </div>
      {detail ? <span className="rounded-2xl border border-app-border bg-app-bg px-3 py-1 text-[11px] font-semibold text-app-muted">{detail}</span> : null}
    </div>
  );
}

function Score({ label, value, raw = false }: { label: string; value: number; raw?: boolean }) {
  return (
    <div className="rounded-2xl bg-app-bg px-3 py-2">
      <p>{label}</p>
      <p className="mt-1 text-app-text">{raw ? value : `${Math.round(value * 100)}%`}</p>
    </div>
  );
}

function BriefList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="border-b border-app-border py-3 last:border-b-0">
      <p className="text-xs font-semibold text-app-muted">{title}</p>
      <SimpleList items={items} empty={empty} compact />
    </div>
  );
}

function EntityList({ title, icon: Icon, items, emptySuffix }: { title: string; icon: typeof UserRound; items: KnowledgeEntity[]; emptySuffix: string }) {
  return (
    <SurfaceCard className="p-5">
      <PanelTitle icon={Icon} title={title} detail={String(items.length)} />
      <SimpleList items={items.slice(0, 6).map((item) => item.label)} empty={emptySuffix} compact />
    </SurfaceCard>
  );
}

function SimpleList({ items, empty, compact = false }: { items: string[]; empty: string; compact?: boolean }) {
  if (items.length === 0) {
    return <p className={`${compact ? "mt-2" : ""} text-sm text-app-muted`}>{empty}</p>;
  }
  return (
    <div className={`${compact ? "mt-2" : ""} space-y-2`}>
      {items.slice(0, compact ? 4 : 8).map((item) => (
        <p key={item} className="truncate rounded-2xl bg-app-bg px-3 py-2 text-xs font-medium text-app-text">
          {item}
        </p>
      ))}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-4 text-sm">
      <span className="text-app-muted">{label}</span>
      <span className="text-right font-semibold text-app-text">{value}</span>
    </div>
  );
}

function nodePosition(index: number, edgeOffset = 0) {
  const positions = [
    { x: 42, y: 42 },
    { x: 16, y: 18 },
    { x: 64, y: 16 },
    { x: 72, y: 58 },
    { x: 24, y: 62 },
    { x: 45, y: 14 },
    { x: 50, y: 70 },
    { x: 8, y: 44 },
    { x: 80, y: 34 }
  ];
  return positions[(index + edgeOffset) % positions.length];
}

function formatDate(value: string, language: AppLanguage) {
  const locale = language === "en" ? "en-US" : language === "ja" ? "ja-JP" : "ko-KR";
  return new Date(value).toLocaleDateString(locale, {
    month: "2-digit",
    day: "2-digit"
  });
}
