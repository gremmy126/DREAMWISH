"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Lightbulb,
  MessageSquareText,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  UserPlus,
  UsersRound,
  Wand2
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/Common/EmptyState";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { MySurveys } from "@/components/Surveys/MySurveys";
import { SurveyManager } from "@/components/Surveys/SurveyManager";
import { DecisionPicker } from "@/components/decisions/DecisionPicker";
import { useDecisions } from "@/components/decisions/useDecisions";
import type { TeamIntelligence } from "@/src/lib/team/team-intelligence";
import type {
  DecisionComment,
  TeamMeeting,
  TeamMember,
  TeamRole
} from "@/src/lib/team/team.repository";
import type { Survey } from "@/src/lib/surveys/survey.types";

type WorkspaceTab = "구성원" | "익명 설문" | "내 설문";

const ROLE_LABELS: Record<TeamRole, { label: string; className: string }> = {
  organization_owner: { label: "Organization Owner", className: "bg-app-hover text-app-primary" },
  organization_admin: { label: "Admin", className: "bg-[#eef6ff] text-[#2f7bea]" },
  member: { label: "Member", className: "bg-app-soft text-app-muted" }
};

const AVATAR_COLORS = ["#6d5df6", "#8b7cff", "#c7bfff", "#5646e0", "#a79bff"];

type SurveyWithStats = Survey & {
  stats?: { eligibleCount: number; responseCount: number; responseRate: number; remainingDays: number | null };
};

// Team — AI Organizational Intelligence Hub.
// 레퍼런스: 사용자 제공 Team 디자인 이미지. 직원 명단이 아니라 조직의 집단지성을
// AI가 Decision에 연결하는 공간이다. 모든 지표는 익명 집계만 사용한다.
export function TeamView() {
  const [intelligence, setIntelligence] = useState<TeamIntelligence | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [surveys, setSurveys] = useState<SurveyWithStats[]>([]);
  const [meetings, setMeetings] = useState<TeamMeeting[]>([]);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("익명 설문");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("member");
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingNotes, setMeetingNotes] = useState("");
  const [meetingDecisionId, setMeetingDecisionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { decisions } = useDecisions();
  const [surveyDecisionId, setSurveyDecisionId] = useState<string | null>(null);
  const [chatDecisionId, setChatDecisionId] = useState<string | null>(null);
  const [comments, setComments] = useState<DecisionComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  const reload = useCallback(async () => {
    try {
      const [intelligenceRes, membersRes, surveysRes, meetingsRes] = await Promise.all([
        fetch("/api/team/intelligence", { cache: "no-store" }),
        fetch("/api/team/members", { cache: "no-store" }),
        fetch("/api/surveys", { cache: "no-store" }),
        fetch("/api/team/meetings", { cache: "no-store" })
      ]);
      if (intelligenceRes.ok) {
        const body = (await intelligenceRes.json()) as { intelligence: TeamIntelligence };
        setIntelligence(body.intelligence);
      }
      if (membersRes.ok) {
        setMembers(((await membersRes.json()) as { members: TeamMember[] }).members || []);
      }
      if (surveysRes.ok) {
        setSurveys(((await surveysRes.json()) as { surveys: SurveyWithStats[] }).surveys || []);
      }
      if (meetingsRes.ok) {
        setMeetings(((await meetingsRes.json()) as { meetings: TeamMeeting[] }).meetings || []);
      }
    } catch {
      setNotice("팀 데이터를 불러오지 못했습니다. 잠시 후 다시 시도하세요.");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!surveyDecisionId && decisions.length) setSurveyDecisionId(decisions[0].id);
    if (!chatDecisionId && decisions.length) setChatDecisionId(decisions[0].id);
  }, [decisions, surveyDecisionId, chatDecisionId]);

  useEffect(() => {
    if (!chatDecisionId) return;
    void fetch(`/api/team/comments?decisionId=${encodeURIComponent(chatDecisionId)}`, {
      cache: "no-store"
    })
      .then(async (response) => (response.ok ? response.json() : { comments: [] }))
      .then((body: { comments: DecisionComment[] }) => setComments(body.comments || []))
      .catch(() => undefined);
  }, [chatDecisionId]);

  function goToSurveyStudio(withAiHint = false) {
    setWorkspaceTab("익명 설문");
    if (withAiHint) {
      setNotice("설문을 만들거나 선택한 뒤 'AI 초안 생성'을 누르면 결정 컨텍스트로 문항이 자동 생성됩니다.");
    }
    window.setTimeout(() => workspaceRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
  }

  async function invite() {
    if (!inviteEmail.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/team/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, name: inviteName, role: inviteRole })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "구성원을 추가하지 못했습니다.");
      setInviteEmail("");
      setInviteName("");
      setInviteOpen(false);
      await reload();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "구성원을 추가하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function createMeeting() {
    if (!meetingTitle.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/team/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: meetingTitle,
          notes: meetingNotes,
          decisionId: meetingDecisionId
        })
      });
      if (!response.ok) throw new Error("회의를 저장하지 못했습니다.");
      setMeetingOpen(false);
      setMeetingTitle("");
      setMeetingNotes("");
      await reload();
      setNotice("회의가 기록되었습니다. 'AI 요약'으로 요약·액션 아이템을 만들 수 있어요.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "회의를 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function summarizeMeeting(meetingId: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/team/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "summarize", meetingId })
      });
      if (!response.ok) throw new Error("AI 요약을 생성하지 못했습니다.");
      await reload();
      setNotice("회의 요약이 생성되었고 Memory 저장 후보로 등록되었습니다.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "AI 요약을 생성하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function submitComment() {
    if (!chatDecisionId || !commentText.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/team/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId: chatDecisionId, text: commentText })
      });
      const body = (await response.json().catch(() => ({}))) as { comment?: DecisionComment };
      if (!response.ok || !body.comment) throw new Error("댓글을 저장하지 못했습니다.");
      setComments((previous) => [...previous, body.comment as DecisionComment]);
      setCommentText("");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "댓글을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleResolve(comment: DecisionComment) {
    await fetch("/api/team/comments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentId: comment.id, resolved: !comment.resolved })
    }).catch(() => undefined);
    setComments((previous) =>
      previous.map((entry) =>
        entry.id === comment.id ? { ...entry, resolved: !entry.resolved } : entry
      )
    );
  }

  const kpis = intelligence?.kpis;

  return (
    <div className="space-y-5 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-extrabold text-app-text sm:text-2xl">Team</h1>
            <span className="rounded-xl bg-app-hover px-2.5 py-1 text-[10px] font-extrabold text-app-primary">
              AI Intelligence Hub
            </span>
          </div>
          <p className="mt-1 text-xs text-app-muted">
            조직의 의견을 수집하고 AI가 의사결정에 반영하도록 도와드립니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => goToSurveyStudio(false)}
            className="flex h-10 items-center gap-1.5 rounded-2xl bg-app-primary px-4 text-xs font-bold text-white shadow-soft transition hover:opacity-90"
          >
            <Plus size={14} />새 설문 만들기
          </button>
          <button
            type="button"
            onClick={() => goToSurveyStudio(true)}
            className="flex h-10 items-center gap-1.5 rounded-2xl border border-app-border bg-white px-3.5 text-xs font-bold text-app-primary transition hover:bg-app-hover"
          >
            <Wand2 size={14} />
            AI 설문 생성
          </button>
          <button
            type="button"
            onClick={() => setMeetingOpen((open) => !open)}
            className="flex h-10 items-center gap-1.5 rounded-2xl border border-app-border bg-white px-3.5 text-xs font-semibold text-app-text transition hover:bg-app-hover hover:text-app-primary"
          >
            <CalendarPlus size={14} />새 회의
          </button>
          <button
            type="button"
            onClick={() => setInviteOpen((open) => !open)}
            className="flex h-10 items-center gap-1.5 rounded-2xl border border-app-border bg-white px-3.5 text-xs font-semibold text-app-text transition hover:bg-app-hover hover:text-app-primary"
          >
            <UserPlus size={14} />
            팀원 초대
          </button>
        </div>
      </div>

      <p className="flex items-center gap-2 rounded-2xl border border-[#e4defc] bg-[#fbfaff] px-4 py-2.5 text-[11px] font-semibold text-app-primary">
        <ShieldCheck size={13} />
        응답 내용은 익명입니다. 관리자는 개인 응답을 확인할 수 없습니다.
      </p>

      {notice ? (
        <p className="rounded-2xl border border-app-border bg-app-hover px-4 py-2.5 text-xs font-semibold text-app-primary">
          {notice}
        </p>
      ) : null}

      {inviteOpen ? (
        <SurfaceCard className="flex flex-wrap items-center gap-2 p-4">
          <input
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="이메일 (필수)"
            className="h-10 min-w-[220px] flex-1 rounded-2xl border border-app-border bg-white px-3 text-sm text-app-text outline-none transition focus:border-app-primary"
          />
          <input
            value={inviteName}
            onChange={(event) => setInviteName(event.target.value)}
            placeholder="이름"
            className="h-10 w-32 rounded-2xl border border-app-border bg-white px-3 text-sm text-app-text outline-none transition focus:border-app-primary"
          />
          <select
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value as TeamRole)}
            className="h-10 rounded-2xl border border-app-border bg-white px-3 text-xs font-semibold text-app-text"
          >
            <option value="member">Member</option>
            <option value="organization_admin">Admin</option>
            <option value="organization_owner">Organization Owner</option>
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => void invite()}
            className="h-10 rounded-2xl bg-app-primary px-4 text-xs font-bold text-white shadow-soft transition hover:opacity-90 disabled:opacity-50"
          >
            추가
          </button>
        </SurfaceCard>
      ) : null}

      {meetingOpen ? (
        <SurfaceCard className="space-y-2.5 p-4">
          <div className="flex flex-wrap gap-2">
            <input
              value={meetingTitle}
              onChange={(event) => setMeetingTitle(event.target.value)}
              placeholder="회의 제목 (예: 제품 전략 회의)"
              className="h-10 min-w-[240px] flex-1 rounded-2xl border border-app-border bg-white px-3 text-sm text-app-text outline-none transition focus:border-app-primary"
            />
            <select
              value={meetingDecisionId || ""}
              onChange={(event) => setMeetingDecisionId(event.target.value || null)}
              className="h-10 rounded-2xl border border-app-border bg-white px-3 text-xs font-semibold text-app-muted"
            >
              <option value="">연결할 결정 없음</option>
              {decisions.map((decision) => (
                <option key={decision.id} value={decision.id}>
                  {decision.title.slice(0, 40)}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={meetingNotes}
            onChange={(event) => setMeetingNotes(event.target.value)}
            rows={4}
            placeholder="회의 노트를 입력하세요. '-'로 시작하는 줄은 액션 아이템으로 인식됩니다."
            className="w-full rounded-2xl border border-app-border bg-white p-3 text-xs leading-5 text-app-text outline-none transition focus:border-app-primary"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMeetingOpen(false)}
              className="h-9 rounded-xl border border-app-border px-3 text-xs font-semibold text-app-muted"
            >
              취소
            </button>
            <button
              type="button"
              disabled={busy || !meetingTitle.trim()}
              onClick={() => void createMeeting()}
              className="h-9 rounded-xl bg-app-primary px-4 text-xs font-bold text-white shadow-soft transition hover:opacity-90 disabled:opacity-50"
            >
              회의 기록
            </button>
          </div>
        </SurfaceCard>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard icon={<UsersRound size={15} />} label="전체 팀원" value={kpis ? `${kpis.memberCount}명` : "—"} sub="구성원" />
        <KpiCard icon={<Activity size={15} />} label="활성 참여율" value={formatPercent(kpis?.activeRate)} sub="지난 30일" accent />
        <KpiCard icon={<ClipboardList size={15} />} label="진행 중 설문" value={kpis ? `${kpis.activeSurveys}건` : "—"} sub="이번 주" />
        <KpiCard icon={<Gauge size={15} />} label="평균 응답률" value={formatPercent(kpis?.avgResponseRate)} sub="전체 설문" />
        <KpiCard icon={<Bot size={15} />} label="AI 반영률" value={formatPercent(kpis?.aiReflectionRate)} sub="신호→결론 반영" accent />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <SurfaceCard className="p-4">
              <p className="mb-3 text-sm font-extrabold text-app-text">진행 중 설문</p>
              {surveys.length ? (
                <div className="space-y-2.5">
                  {surveys.slice(0, 5).map((survey) => (
                    <button
                      key={survey.id}
                      type="button"
                      onClick={() => goToSurveyStudio(false)}
                      className="w-full rounded-2xl border border-app-border bg-white p-3 text-left transition hover:border-app-primary/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-xs font-bold text-app-text">
                          {survey.title}
                        </p>
                        <span
                          className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                            survey.status === "active"
                              ? "bg-[#eefdf3] text-[#16a34a]"
                              : survey.status === "closed"
                                ? "bg-app-soft text-app-muted"
                                : "bg-[#fff3ec] text-[#ea7c2f]"
                          }`}
                        >
                          {survey.status === "active" ? "진행 중" : survey.status === "closed" ? "종료" : "초안"}
                        </span>
                      </div>
                      {survey.stats && survey.stats.eligibleCount > 0 ? (
                        <>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-app-primary to-[#8b7cff]"
                              style={{ width: `${Math.round(survey.stats.responseRate * 100)}%` }}
                            />
                          </div>
                          <p className="mt-1 text-[10px] font-semibold text-app-muted">
                            응답률 {Math.round(survey.stats.responseRate * 100)}% (
                            {survey.stats.responseCount}/{survey.stats.eligibleCount})
                            {survey.stats.remainingDays !== null
                              ? ` · ${survey.stats.remainingDays}일 남음`
                              : ""}
                          </p>
                        </>
                      ) : (
                        <p className="mt-1.5 text-[10px] text-app-muted">대상 미지정 · 수정하기</p>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={ClipboardList}
                  title="아직 설문이 없습니다"
                  description="새 설문 만들기 또는 AI 설문 생성으로 조직 의견 수집을 시작하세요."
                  compact
                />
              )}
            </SurfaceCard>

            <SurfaceCard className="p-4">
              <p className="mb-3 text-sm font-extrabold text-app-text">
                조직 인사이트 <span className="text-[10px] font-bold text-app-muted">(AI 분석)</span>
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <InsightTile title="조직 분위기">
                  {intelligence?.pulse ? (
                    <div className="flex items-center gap-3">
                      <Donut
                        segments={[
                          { value: intelligence.pulse.positive, color: "#6d5df6" },
                          { value: intelligence.pulse.concern, color: "#f59e0b" },
                          { value: intelligence.pulse.neutral, color: "#e2e8f0" }
                        ]}
                      />
                      <ul className="space-y-0.5 text-[10.5px] font-semibold text-app-muted">
                        <li><Dot color="#6d5df6" /> 긍정적 {intelligence.pulse.positive}%</li>
                        <li><Dot color="#f59e0b" /> 우려 {intelligence.pulse.concern}%</li>
                        <li><Dot color="#e2e8f0" /> 중립 {intelligence.pulse.neutral}%</li>
                      </ul>
                    </div>
                  ) : (
                    <Placeholder />
                  )}
                </InsightTile>
                <InsightTile title="의견 일치도">
                  {intelligence?.consensusAvg !== null && intelligence ? (
                    <div className="flex items-center gap-3">
                      <Donut
                        segments={[
                          { value: intelligence.consensusAvg ?? 0, color: "#6d5df6" },
                          { value: 100 - (intelligence.consensusAvg ?? 0), color: "#eef0f6" }
                        ]}
                        label={`${intelligence.consensusAvg}%`}
                      />
                      <p className="text-[10.5px] font-semibold text-app-muted">평균 일치도</p>
                    </div>
                  ) : (
                    <Placeholder />
                  )}
                </InsightTile>
                <InsightTile title="가장 큰 우려" icon={<AlertTriangle size={12} className="text-[#ef4444]" />}>
                  {intelligence?.topConcern ? (
                    <p className="text-xs font-bold text-app-text">
                      {intelligence.topConcern.label}
                      {intelligence.topConcern.percent !== null ? (
                        <span className="ml-1.5 text-[10px] font-bold text-[#ef4444]">
                          응답 중 {intelligence.topConcern.percent}%
                        </span>
                      ) : null}
                    </p>
                  ) : (
                    <Placeholder />
                  )}
                </InsightTile>
                <InsightTile title="주요 기회" icon={<TrendingUp size={12} className="text-[#16a34a]" />}>
                  {intelligence?.topOpportunity ? (
                    <p className="text-xs font-bold text-app-text">{intelligence.topOpportunity}</p>
                  ) : (
                    <Placeholder />
                  )}
                </InsightTile>
                <InsightTile title="의견 충돌 지수" icon={<UsersRound size={12} className="text-app-primary" />}>
                  {intelligence?.conflict ? (
                    <>
                      <p className="text-sm font-extrabold text-app-text">{intelligence.conflict.level}</p>
                      <p className="mt-0.5 text-[10px] leading-4 text-app-muted">
                        {intelligence.conflict.note}
                      </p>
                    </>
                  ) : (
                    <Placeholder />
                  )}
                </InsightTile>
                <InsightTile title="AI 반영 제안" icon={<Bot size={12} className="text-app-primary" />}>
                  <p className="text-sm font-extrabold text-app-text">
                    {intelligence ? `${intelligence.pendingReflections}건` : "—"}
                  </p>
                  <p className="mt-0.5 text-[10px] text-app-muted">의사결정 반영 대기 중</p>
                </InsightTile>
              </div>
            </SurfaceCard>
          </div>

          <SurfaceCard className="p-4">
            <p className="mb-3 text-sm font-extrabold text-app-text">팀 참여 현황</p>
            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <p className="text-[10.5px] font-bold text-app-muted">참여 추이 (응답 수)</p>
                {intelligence?.participationTrend.length ? (
                  <TrendChart points={intelligence.participationTrend} />
                ) : (
                  <p className="mt-3 text-[11px] text-app-muted">응답이 쌓이면 추이가 표시됩니다.</p>
                )}
              </div>
              <div>
                <p className="text-[10.5px] font-bold text-app-muted">설문별 참여율 (익명 집계)</p>
                <div className="mt-2.5 space-y-2">
                  {(intelligence?.surveyParticipation || []).slice(0, 5).map((entry) => (
                    <div key={entry.title} className="text-[10.5px]">
                      <div className="flex justify-between font-semibold text-app-muted">
                        <span className="min-w-0 truncate pr-2">{entry.title}</span>
                        <span className="text-app-text">{entry.rate}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-app-primary/80"
                          style={{ width: `${entry.rate}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {!intelligence?.surveyParticipation.length ? (
                    <p className="text-[11px] text-app-muted">게시된 설문이 없습니다.</p>
                  ) : null}
                </div>
              </div>
              <div className="rounded-2xl bg-app-soft/60 p-4">
                <p className="text-[10.5px] font-bold text-app-muted">기여자 보호 안내</p>
                <p className="mt-1.5 text-[11px] leading-5 text-app-text">
                  익명성 보호를 위해 개인별 응답 여부·기여 순위는 표시하지 않습니다. 모든
                  지표는 집계 수치만 사용합니다.
                </p>
              </div>
            </div>
          </SurfaceCard>

          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-extrabold text-app-text">
              <Lightbulb size={13} className="text-app-primary" />
              AI 기반 인사이트 요약
            </span>
            {(intelligence?.insightChips || []).map((chip, index) => (
              <span
                key={index}
                className="rounded-xl border border-app-border bg-white px-3 py-1.5 text-[10.5px] font-semibold text-app-muted shadow-soft"
              >
                {chip}
              </span>
            ))}
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <SurfaceCard className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-extrabold text-app-text">회의</p>
                <button
                  type="button"
                  onClick={() => setMeetingOpen(true)}
                  className="text-[11px] font-bold text-app-primary transition hover:opacity-80"
                >
                  + 새 회의
                </button>
              </div>
              {meetings.length ? (
                <div className="space-y-2.5">
                  {meetings.slice(0, 4).map((meeting) => (
                    <div key={meeting.id} className="rounded-2xl border border-app-border bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-xs font-bold text-app-text">
                          {meeting.title}
                        </p>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void summarizeMeeting(meeting.id)}
                          className="flex h-7 shrink-0 items-center gap-1 rounded-lg bg-app-hover px-2 text-[10px] font-bold text-app-primary transition hover:opacity-80 disabled:opacity-50"
                        >
                          <Sparkles size={10} />
                          {meeting.summary ? "AI 요약 갱신" : "AI 요약"}
                        </button>
                      </div>
                      {meeting.summary ? (
                        <>
                          <p className="mt-1.5 text-[11px] leading-4 text-app-muted">{meeting.summary}</p>
                          {meeting.actionItems.length ? (
                            <ul className="mt-1.5 space-y-0.5">
                              {meeting.actionItems.slice(0, 3).map((item, index) => (
                                <li key={index} className="flex items-start gap-1 text-[10.5px] text-app-text">
                                  <CheckCircle2 size={10} className="mt-0.5 shrink-0 text-[#16a34a]" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </>
                      ) : (
                        <p className="mt-1 text-[10.5px] text-app-muted">
                          {new Date(meeting.date).toLocaleDateString("ko-KR")} · AI 요약 대기
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-app-muted">
                  회의를 기록하면 AI가 요약·액션 아이템·결론을 만들고 Memory 후보로 연결합니다.
                </p>
              )}
            </SurfaceCard>

            <SurfaceCard className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-extrabold text-app-text">
                  <MessageSquareText size={14} className="text-app-primary" />
                  Decision Chat
                </p>
                <select
                  value={chatDecisionId || ""}
                  onChange={(event) => setChatDecisionId(event.target.value || null)}
                  className="h-8 max-w-[190px] rounded-xl border border-app-border bg-white px-2 text-[11px] font-semibold text-app-muted"
                >
                  {decisions.map((decision) => (
                    <option key={decision.id} value={decision.id}>
                      {decision.title.slice(0, 32)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="max-h-52 space-y-2 overflow-y-auto app-scrollbar">
                {comments.length ? (
                  comments.map((comment) => (
                    <div
                      key={comment.id}
                      className={`rounded-2xl border p-2.5 ${
                        comment.resolved
                          ? "border-app-border bg-app-soft/50 opacity-70"
                          : "border-app-border bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10.5px] font-bold text-app-primary">{comment.author}</p>
                        <button
                          type="button"
                          onClick={() => void toggleResolve(comment)}
                          className="text-[9.5px] font-bold text-app-muted transition hover:text-app-primary"
                        >
                          {comment.resolved ? "다시 열기" : "Resolve"}
                        </button>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-4 text-app-text">{comment.text}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-app-muted">
                    결정에 대한 협업 코멘트입니다. 설문과 달리 실명으로 기록됩니다.
                  </p>
                )}
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <input
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void submitComment();
                  }}
                  placeholder="의견을 남기세요…"
                  className="h-9 min-w-0 flex-1 rounded-xl border border-app-border bg-white px-3 text-[11px] text-app-text outline-none transition focus:border-app-primary"
                />
                <button
                  type="button"
                  disabled={busy || !commentText.trim()}
                  onClick={() => void submitComment()}
                  className="h-9 rounded-xl bg-app-primary px-3 text-[11px] font-bold text-white shadow-soft transition hover:opacity-90 disabled:opacity-40"
                >
                  등록
                </button>
              </div>
            </SurfaceCard>
          </div>

          <div ref={workspaceRef}>
            <SurfaceCard className="p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {(["익명 설문", "구성원", "내 설문"] as WorkspaceTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setWorkspaceTab(tab)}
                    className={`h-9 rounded-xl px-4 text-xs font-bold transition ${
                      workspaceTab === tab
                        ? "bg-app-primary text-white shadow-soft"
                        : "border border-app-border bg-white text-app-muted hover:bg-app-hover hover:text-app-primary"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {workspaceTab === "익명 설문" ? (
                decisions.length ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <DecisionPicker
                        decisions={decisions}
                        value={surveyDecisionId}
                        onChange={setSurveyDecisionId}
                        label="설문을 연결할 결정 프로젝트"
                      />
                      <p className="text-[11px] text-app-muted">
                        결과 공개 시 Employee Signal이 AI 최종 결론에 자동 반영됩니다
                      </p>
                    </div>
                    {surveyDecisionId ? (
                      <SurveyManager
                        decisionId={surveyDecisionId}
                        defaultTargetEmails={members.map((member) => member.email)}
                      />
                    ) : null}
                  </div>
                ) : (
                  <EmptyState
                    icon={ClipboardList}
                    title="연결할 결정이 없습니다"
                    description="AI Chat에서 결정 분석을 시작하면 설문을 그 결정에 연결할 수 있습니다."
                  />
                )
              ) : null}

              {workspaceTab === "구성원" ? (
                members.length ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {members.map((member, index) => (
                      <div key={member.id} className="rounded-2xl border border-app-border bg-white p-3.5">
                        <div className="flex items-start gap-3">
                          <span
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white"
                            style={{ backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length] }}
                          >
                            {(member.name || member.email).slice(0, 2).toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-app-text">{member.name}</p>
                            <p className="truncate text-[11px] text-app-muted">{member.email}</p>
                            <div className="mt-1.5 flex items-center gap-2">
                              <span
                                className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${ROLE_LABELS[member.role].className}`}
                              >
                                {ROLE_LABELS[member.role].label}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  void fetch(
                                    `/api/team/members?memberId=${encodeURIComponent(member.id)}`,
                                    { method: "DELETE" }
                                  ).then(() => reload())
                                }
                                className="ml-auto text-app-muted transition hover:text-red-500"
                                aria-label="구성원 삭제"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={UsersRound}
                    title="구성원을 초대하세요"
                    description="구성원을 추가하면 익명 설문 대상으로 지정되고, 조직 의견이 AI 결론에 반영됩니다."
                  />
                )
              ) : null}

              {workspaceTab === "내 설문" ? <MySurveys /> : null}
            </SurfaceCard>
          </div>
        </div>

        <div className="space-y-4">
          <SurfaceCard className="p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-extrabold text-app-text">
                <Sparkles size={14} className="text-app-primary" />
                AI 팀 분석 리포트
              </p>
            </div>
            {intelligence?.report ? (
              <div className="space-y-3">
                <p className="text-[11px] font-bold text-app-muted">{intelligence.report.title}</p>
                <div className="rounded-2xl border border-[#e4defc] bg-gradient-to-br from-[#f5f3ff] to-white p-3.5">
                  <p className="text-[10px] font-extrabold text-app-primary">핵심 결과</p>
                  <p className="mt-1 text-xs font-bold leading-5 text-app-text">
                    {intelligence.report.core}
                  </p>
                </div>
                <div>
                  <p className="text-[10.5px] font-extrabold text-app-text">조직 요약</p>
                  <ul className="mt-1 space-y-0.5">
                    {intelligence.report.summaryLines.map((line, index) => (
                      <li key={index} className="text-[11px] leading-5 text-app-muted">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
                {intelligence.report.opposeTop.length ? (
                  <div className="rounded-2xl border border-[#f3d9db] bg-[#fdf3f4] p-3.5">
                    <p className="text-[10px] font-extrabold text-[#c2434e]">반대 의견 TOP {intelligence.report.opposeTop.length}</p>
                    <ol className="mt-1.5 space-y-1">
                      {intelligence.report.opposeTop.map((entry, index) => (
                        <li key={entry.label} className="flex items-center justify-between gap-2 text-[11px] text-[#8f4a51]">
                          <span className="min-w-0 truncate">
                            {index + 1}. {entry.label}
                          </span>
                          {entry.percent !== null ? (
                            <b className="shrink-0">응답 비율 {entry.percent}%</b>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
                {intelligence.report.risks.length ? (
                  <div className="rounded-2xl border border-[#f5e5bd] bg-[#fffaf0] p-3.5">
                    <p className="text-[10px] font-extrabold text-[#b45309]">주요 리스크</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {intelligence.report.risks.map((risk) => (
                        <span key={risk} className="rounded-lg bg-white px-2 py-0.5 text-[10px] font-bold text-[#b45309]">
                          {risk}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {intelligence.report.suggestions.length ? (
                  <div className="rounded-2xl border border-[#bbe7c8] bg-[#f0fdf4] p-3.5">
                    <p className="text-[10px] font-extrabold text-[#16a34a]">실행 제안</p>
                    <ul className="mt-1.5 space-y-1">
                      {intelligence.report.suggestions.map((suggestion, index) => (
                        <li key={index} className="flex items-start gap-1.5 text-[11px] leading-4 text-app-text">
                          <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-[#16a34a]" />
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-[11px] leading-5 text-app-muted">
                설문 결과가 공개되고 AI Chat에서 결론이 생성되면 조직 신호 기반 리포트가
                자동으로 작성됩니다.
              </p>
            )}
          </SurfaceCard>

          <SurfaceCard className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-extrabold text-app-text">
                <BarChart3 size={14} className="text-app-primary" />
                최근 팀 활동
              </p>
            </div>
            {intelligence?.activity.length ? (
              <ul className="space-y-2.5">
                {intelligence.activity.map((entry, index) => (
                  <li key={index} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-app-hover text-app-primary">
                      {entry.kind === "survey" ? (
                        <ClipboardList size={12} />
                      ) : entry.kind === "meeting" ? (
                        <CalendarPlus size={12} />
                      ) : (
                        <Bot size={12} />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-app-text">{entry.label}</p>
                      <p className="truncate text-[10.5px] text-app-muted">
                        {entry.detail} · {relativeTime(entry.at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-app-muted">아직 활동이 없습니다.</p>
            )}
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function KpiCard({
  icon,
  label,
  value,
  sub,
  accent = false
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-app-border bg-white p-3.5 shadow-soft">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-app-hover text-app-primary">
          {icon}
        </span>
        <p className="text-[10.5px] font-bold text-app-muted">{label}</p>
      </div>
      <p className={`mt-2 text-xl font-extrabold ${accent ? "text-app-primary" : "text-app-text"}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[10px] font-semibold text-app-muted">{sub}</p>
    </div>
  );
}

function InsightTile({
  title,
  icon,
  children
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-app-border bg-white p-3.5">
      <p className="flex items-center gap-1.5 text-[10.5px] font-extrabold text-app-muted">
        {icon}
        {title}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Placeholder() {
  return <p className="text-[11px] text-app-muted">설문 집계가 공개되면 표시됩니다.</p>;
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
      style={{ backgroundColor: color }}
    />
  );
}

function Donut({
  segments,
  label
}: {
  segments: Array<{ value: number; color: string }>;
  label?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  let offset = 25;
  return (
    <svg width="64" height="64" viewBox="0 0 42 42" aria-hidden="true">
      <circle cx="21" cy="21" r="15.9" fill="none" stroke="#f1f5f9" strokeWidth="6" />
      {segments.map((segment, index) => {
        const percent = (segment.value / total) * 100;
        const circle = (
          <circle
            key={index}
            cx="21"
            cy="21"
            r="15.9"
            fill="none"
            stroke={segment.color}
            strokeWidth="6"
            strokeDasharray={`${percent} ${100 - percent}`}
            strokeDashoffset={offset}
            strokeLinecap="butt"
          />
        );
        offset -= percent;
        return circle;
      })}
      {label ? (
        <text x="21" y="24" textAnchor="middle" fontSize="9" fontWeight="800" fill="#111827">
          {label}
        </text>
      ) : null}
    </svg>
  );
}

function TrendChart({ points }: { points: Array<{ date: string; count: number }> }) {
  const max = Math.max(...points.map((point) => point.count), 1);
  const coords = points.map((point, index) => {
    const x = points.length > 1 ? (index / (points.length - 1)) * 100 : 50;
    const y = 36 - (point.count / max) * 30;
    return `${x},${y}`;
  });
  return (
    <svg viewBox="0 0 100 40" className="mt-2 h-24 w-full" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={`0,40 ${coords.join(" ")} 100,40`}
        fill="rgba(109,93,246,0.12)"
        stroke="none"
      />
      <polyline points={coords.join(" ")} fill="none" stroke="#6d5df6" strokeWidth="1.6" />
      {coords.map((coord, index) => {
        const [x, y] = coord.split(",").map(Number);
        return <circle key={index} cx={x} cy={y} r="1.4" fill="#6d5df6" />;
      })}
    </svg>
  );
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value}%`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return "";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}
