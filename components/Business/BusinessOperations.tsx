"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileText,
  Flag,
  FolderKanban,
  ListTodo,
  Plus,
  Sparkles,
  Trash2,
  Workflow
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { readApiResponse } from "@/src/lib/api/api-response";
import type {
  BusinessGoal,
  BusinessPriority,
  BusinessRisk
} from "@/src/lib/business/business-plan.repository";
import type { CrmActivity, CrmTask } from "@/src/lib/crm/crm.types";

type ProjectRecord = { id: string; name: string; createdAt: string };
type MeetingRecord = { id: string; title: string; startsAt?: string; createdAt?: string };
type AutomationRecord = { id: string; name?: string; title?: string; enabled?: boolean };
type KnowledgeNoteRecord = { id: string; title: string; updatedAt?: string; createdAt?: string };

type PlanData = {
  goals: BusinessGoal[];
  risks: BusinessRisk[];
  priorities: BusinessPriority[];
};

export function BusinessOperations({
  tasks,
  activities
}: {
  tasks: CrmTask[];
  activities: CrmActivity[];
}) {
  const [plan, setPlan] = useState<PlanData>({ goals: [], risks: [], priorities: [] });
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [automations, setAutomations] = useState<AutomationRecord[]>([]);
  const [documents, setDocuments] = useState<KnowledgeNoteRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadPlan = useCallback(async () => {
    try {
      const response = await fetch("/api/business/plan", { cache: "no-store" });
      setPlan(await readApiResponse<PlanData>(response));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "사업 계획을 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    void loadPlan();
    void (async () => {
      const [projectsRes, meetingsRes, automationsRes, notesRes] = await Promise.allSettled([
        fetch("/api/projects").then((res) => readApiResponse<{ projects?: ProjectRecord[] }>(res)),
        fetch("/api/business/meetings").then((res) =>
          readApiResponse<{ meetings?: MeetingRecord[] }>(res)
        ),
        fetch("/api/automation/automations").then((res) =>
          readApiResponse<{ automations?: AutomationRecord[] }>(res)
        ),
        fetch("/api/knowledge/notes").then((res) =>
          readApiResponse<{ notes?: KnowledgeNoteRecord[] }>(res)
        )
      ]);
      if (projectsRes.status === "fulfilled") setProjects(projectsRes.value.projects || []);
      if (meetingsRes.status === "fulfilled") setMeetings(meetingsRes.value.meetings || []);
      if (automationsRes.status === "fulfilled")
        setAutomations(automationsRes.value.automations || []);
      if (notesRes.status === "fulfilled") setDocuments(notesRes.value.notes || []);
    })();
  }, [loadPlan]);

  async function addPlanItem(kind: "goal" | "risk" | "priority", title: string) {
    if (!title.trim()) return;
    await fetch("/api/business/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, title })
    });
    await loadPlan();
  }

  async function updateGoalProgress(goal: BusinessGoal, progress: number) {
    await fetch("/api/business/plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "goal", id: goal.id, progress })
    });
    await loadPlan();
  }

  async function removePlanItem(kind: "goal" | "risk" | "priority", id: string) {
    await fetch(`/api/business/plan?kind=${kind}&id=${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    await loadPlan();
  }

  const openTasks = useMemo(() => tasks.filter((task) => !task.completedAt), [tasks]);
  const activeGoals = plan.goals.filter((goal) => goal.status !== "completed");
  const overallProgress =
    plan.goals.length > 0
      ? Math.round(plan.goals.reduce((sum, goal) => sum + goal.progress, 0) / plan.goals.length)
      : 0;
  const recentActivities = useMemo(
    () =>
      [...activities]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5),
    [activities]
  );

  const nextActions = useMemo(() => {
    const suggestions: string[] = [];
    const overdue = openTasks.filter(
      (task) => task.dueAt && new Date(task.dueAt).getTime() < Date.now()
    );
    if (overdue.length > 0)
      suggestions.push(`기한이 지난 업무 ${overdue.length}건을 먼저 처리하세요.`);
    const stalled = activeGoals.filter((goal) => goal.progress === 0);
    if (stalled.length > 0)
      suggestions.push(`아직 시작하지 않은 목표 "${stalled[0].title}"의 첫 단계를 정하세요.`);
    const highRisks = plan.risks.filter((risk) => risk.level === "high");
    if (highRisks.length > 0)
      suggestions.push(`높은 리스크 "${highRisks[0].title}"의 대응 방안을 점검하세요.`);
    if (meetings.length === 0) suggestions.push("이번 주 운영 회의 일정을 등록하세요.");
    if (suggestions.length === 0)
      suggestions.push("모든 항목이 정상 진행 중입니다. 다음 목표의 진행률을 갱신하세요.");
    return suggestions.slice(0, 4);
  }, [openTasks, activeGoals, plan.risks, meetings.length]);

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Flag} label="진행 중 목표" value={`${activeGoals.length}개`} />
        <StatCard icon={CheckCircle2} label="사업 진행률" value={`${overallProgress}%`} />
        <StatCard icon={ListTodo} label="미완료 핵심 업무" value={`${openTasks.length}건`} />
        <StatCard icon={FolderKanban} label="주요 프로젝트" value={`${projects.length}개`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SurfaceCard className="p-5">
          <PanelHeader icon={Flag} title="사업 목표" />
          <QuickAdd placeholder="새 사업 목표 입력" onAdd={(title) => void addPlanItem("goal", title)} />
          <div className="mt-3 space-y-2.5">
            {plan.goals.map((goal) => (
              <div key={goal.id} className="rounded-2xl border border-app-border bg-app-bg p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className={`min-w-0 truncate text-sm font-semibold ${goal.status === "completed" ? "text-app-muted line-through" : "text-app-text"}`}>
                    {goal.title}
                  </p>
                  <button
                    type="button"
                    aria-label="목표 삭제"
                    onClick={() => void removePlanItem("goal", goal.id)}
                    className="shrink-0 text-app-muted hover:text-red-600"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={goal.progress}
                    aria-label={`${goal.title} 진행률`}
                    onChange={(event) => void updateGoalProgress(goal, Number(event.target.value))}
                    className="h-1.5 flex-1 accent-[#6d5df6]"
                  />
                  <span className="w-10 text-right text-xs font-semibold text-app-primary">
                    {goal.progress}%
                  </span>
                </div>
              </div>
            ))}
            {plan.goals.length === 0 ? (
              <p className="py-3 text-center text-xs text-app-muted">아직 등록된 사업 목표가 없습니다.</p>
            ) : null}
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <PanelHeader icon={Sparkles} title="전략적 우선순위 · 다음 실행 추천" />
          <QuickAdd
            placeholder="우선순위 추가"
            onAdd={(title) => void addPlanItem("priority", title)}
          />
          <ol className="mt-3 space-y-1.5">
            {plan.priorities.map((priority, index) => (
              <li
                key={priority.id}
                className="flex items-center gap-2 rounded-xl border border-app-border bg-white px-3 py-2 text-xs"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-app-hover text-[10px] font-bold text-app-primary">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-app-text">
                  {priority.title}
                </span>
                <button
                  type="button"
                  aria-label="우선순위 삭제"
                  onClick={() => void removePlanItem("priority", priority.id)}
                  className="text-app-muted hover:text-red-600"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-4 rounded-2xl bg-app-bg p-3">
            <p className="text-[11px] font-semibold text-app-primary">다음 실행 추천</p>
            <ul className="mt-1.5 space-y-1 text-xs leading-5 text-app-text">
              {nextActions.map((action) => (
                <li key={action}>• {action}</li>
              ))}
            </ul>
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <PanelHeader icon={AlertTriangle} title="주요 리스크" />
          <QuickAdd placeholder="리스크 추가" onAdd={(title) => void addPlanItem("risk", title)} />
          <div className="mt-3 space-y-2">
            {plan.risks.map((risk) => (
              <div
                key={risk.id}
                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${
                  risk.level === "high"
                    ? "border-red-200 bg-red-50"
                    : risk.level === "medium"
                      ? "border-amber-200 bg-amber-50"
                      : "border-app-border bg-app-bg"
                }`}
              >
                <span className="min-w-0 flex-1 truncate font-medium text-app-text">{risk.title}</span>
                <span className="shrink-0 text-[10px] font-semibold text-app-muted">
                  {risk.level === "high" ? "높음" : risk.level === "medium" ? "보통" : "낮음"}
                </span>
                <button
                  type="button"
                  aria-label="리스크 삭제"
                  onClick={() => void removePlanItem("risk", risk.id)}
                  className="shrink-0 text-app-muted hover:text-red-600"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {plan.risks.length === 0 ? (
              <p className="py-3 text-center text-xs text-app-muted">등록된 리스크가 없습니다.</p>
            ) : null}
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <PanelHeader icon={CalendarDays} title="운영 일정 · 핵심 업무" />
          <div className="space-y-2">
            {meetings.slice(0, 4).map((meeting) => (
              <div key={meeting.id} className="flex items-center justify-between gap-2 rounded-xl bg-app-bg px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium text-app-text">{meeting.title}</span>
                <span className="shrink-0 text-app-muted">
                  {new Date(meeting.startsAt || meeting.createdAt || Date.now()).toLocaleDateString("ko-KR")}
                </span>
              </div>
            ))}
            {meetings.length === 0 ? (
              <p className="py-2 text-center text-xs text-app-muted">예정된 운영 일정이 없습니다.</p>
            ) : null}
          </div>
          <div className="mt-3 border-t border-app-border pt-3">
            {openTasks.slice(0, 5).map((task) => (
              <div key={task.id} className="flex items-center justify-between gap-2 py-1 text-xs">
                <span className="min-w-0 flex-1 truncate text-app-text">{task.title}</span>
                <span className="shrink-0 text-app-muted">
                  {task.dueAt ? new Date(task.dueAt).toLocaleDateString("ko-KR") : "기한 없음"}
                </span>
              </div>
            ))}
            {openTasks.length === 0 ? (
              <p className="py-2 text-center text-xs text-app-muted">미완료 업무가 없습니다.</p>
            ) : null}
          </div>
        </SurfaceCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ListPanel
          icon={FolderKanban}
          title="주요 프로젝트"
          items={projects.slice(0, 6).map((project) => project.name)}
          empty="등록된 프로젝트가 없습니다."
        />
        <ListPanel
          icon={FileText}
          title="연결된 문서"
          items={documents.slice(0, 6).map((note) => note.title)}
          empty="연결된 문서가 없습니다."
        />
        <ListPanel
          icon={Workflow}
          title="연결된 자동화"
          items={automations.slice(0, 6).map((automation) => automation.name || automation.title || "자동화")}
          empty="연결된 자동화가 없습니다."
        />
      </div>

      <SurfaceCard className="p-5">
        <PanelHeader icon={ListTodo} title="최근 활동" />
        <div className="space-y-2">
          {recentActivities.map((activity) => (
            <div key={activity.id} className="flex items-center justify-between gap-2 rounded-xl bg-app-bg px-3 py-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-app-text">{activity.title}</span>
              <span className="shrink-0 text-app-muted">
                {new Date(activity.createdAt).toLocaleDateString("ko-KR")}
              </span>
            </div>
          ))}
          {recentActivities.length === 0 ? (
            <p className="py-2 text-center text-xs text-app-muted">최근 활동이 없습니다.</p>
          ) : null}
        </div>
      </SurfaceCard>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Flag;
  label: string;
  value: string;
}) {
  return (
    <SurfaceCard className="p-4">
      <Icon size={16} className="text-app-primary" />
      <p className="mt-3 text-xs font-semibold text-app-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-app-text">{value}</p>
    </SurfaceCard>
  );
}

function PanelHeader({ icon: Icon, title }: { icon: typeof Flag; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon size={15} className="text-app-primary" />
      <h2 className="text-sm font-semibold text-app-text">{title}</h2>
    </div>
  );
}

function QuickAdd({
  placeholder,
  onAdd
}: {
  placeholder: string;
  onAdd: (title: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && value.trim()) {
            onAdd(value);
            setValue("");
          }
        }}
        placeholder={placeholder}
        className="h-9 min-w-0 flex-1 rounded-xl border border-app-border bg-white px-3 text-xs text-app-text outline-none focus:border-app-primary"
      />
      <button
        type="button"
        aria-label="추가"
        disabled={!value.trim()}
        onClick={() => {
          onAdd(value);
          setValue("");
        }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-app-primary text-white disabled:opacity-40"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

function ListPanel({
  icon: Icon,
  title,
  items,
  empty
}: {
  icon: typeof Flag;
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <SurfaceCard className="p-5">
      <PanelHeader icon={Icon} title={title} />
      <div className="space-y-1.5">
        {items.map((item, index) => (
          <p key={`${item}-${index}`} className="truncate rounded-xl bg-app-bg px-3 py-2 text-xs font-medium text-app-text">
            {item}
          </p>
        ))}
        {items.length === 0 ? <p className="py-2 text-center text-xs text-app-muted">{empty}</p> : null}
      </div>
    </SurfaceCard>
  );
}
