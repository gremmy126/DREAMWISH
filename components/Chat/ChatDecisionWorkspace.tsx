"use client";

import {
  Check,
  Lightbulb,
  Loader2,
  MessageCircle,
  Plus,
  Rocket,
  Send,
  Settings2,
  Sparkles,
  Target,
  UsersRound
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ChatView } from "@/components/Chat/ChatView";
import { AnalysisReportPanel } from "@/components/Chat/AnalysisReportPanel";
import type { Decision } from "@/src/lib/decisions/decision.types";
import type { DecisionConclusion } from "@/src/lib/decisions/decision-conclusion";
import type { DecisionEmployeeSignal } from "@/src/lib/surveys/survey.types";

type ChatMessage = {
  id: string;
  role: "ai" | "user";
  text: string;
  hint?: string;
  quickReplies?: string[];
};

type FlowPhase =
  | "idle"
  | "interview"
  | "research-config"
  | "researching"
  | "simulating"
  | "concluding"
  | "done";

type StepState = "pending" | "active" | "done" | "skipped";

const EXAMPLES = [
  {
    icon: Rocket,
    title: "신규 사업 검토",
    question: "잠재력 있는 신규 서비스 시장 진출 가능성을 검토하고 싶어요."
  },
  {
    icon: Target,
    title: "마케팅 전략 수립",
    question: "MZ세대를 타깃으로 한 브랜드 마케팅 전략을 결정하고 싶어요."
  },
  {
    icon: Lightbulb,
    title: "제품 아이디어 검증",
    question: "AI 기반 개인 맞춤형 학습 서비스의 시장성을 검증하고 싶어요."
  },
  {
    icon: UsersRound,
    title: "조직 혁신",
    question: "협업과 데이터 기반의 조직 혁신 방안을 결정하고 싶어요."
  }
];

const INTERVIEW: Array<{
  prompt: string;
  hint?: string;
  quickReplies?: string[];
  apply: (answer: string, decision: Decision) => Partial<Decision>;
}> = [
  {
    prompt: "이 결정으로 달성하려는 가장 중요한 목표는 무엇인가요?",
    hint: "예산·기한이 있다면 함께 알려주세요. 답할수록 결론이 정확해집니다.",
    apply: (answer) => ({ objective: answer })
  },
  {
    prompt: "반드시 지켜야 하는 제약조건이나 내부 상황이 있나요?",
    hint: "쉼표로 구분해 여러 개를 적어도 됩니다. 없으면 '없음'이라고 답하세요.",
    apply: (answer, decision) => ({
      problem: {
        ...decision.problem,
        constraints:
          answer.trim() === "없음"
            ? []
            : answer.split(/[,\n·]+/u).map((item) => item.trim()).filter(Boolean)
      }
    })
  },
  {
    prompt: "위험은 어느 정도 감수할 수 있나요?",
    quickReplies: ["낮음 — 안정 우선", "중간", "높음 — 공격적"],
    apply: (answer, decision) => ({
      problem: {
        ...decision.problem,
        riskTolerance: answer.includes("낮") ? "low" : answer.includes("높") ? "high" : "medium"
      }
    })
  },
  {
    prompt: "성공은 무엇으로 판단하나요?",
    hint: "핵심 지표나 판단 기준을 알려주세요. 예: 12개월 내 손익분기.",
    apply: (answer, decision) => ({
      problem: {
        ...decision.problem,
        successCriteria: answer.split(/[,\n·]+/u).map((item) => item.trim()).filter(Boolean)
      }
    })
  }
];

let messageSeq = 0;
function nextId() {
  messageSeq += 1;
  return `m-${Date.now()}-${messageSeq}`;
}

// AI Chat — 의사결정 파트너. 좌측은 AI 인터뷰 대화, 우측은 실시간 분석 보고서.
// 디자인 기준: docs/design/ai-chat-design.svg + 사용자 제공 레퍼런스.
export function ChatDecisionWorkspace() {
  const [mode, setMode] = useState<"decision" | "free">("decision");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<FlowPhase>("idle");
  const [interviewIndex, setInterviewIndex] = useState(0);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [conclusion, setConclusion] = useState<DecisionConclusion | null>(null);
  const [signal, setSignal] = useState<DecisionEmployeeSignal | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [researchMode, setResearchMode] = useState<"standard" | "deep">("standard");
  const [researchMinutes, setResearchMinutes] = useState(10);
  const [includeLocalDocs, setIncludeLocalDocs] = useState(true);
  const [researchProgress, setResearchProgress] = useState<{ percent: number; step: string } | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, phase, researchProgress]);

  const loadHistory = async () => {
    try {
      const response = await fetch("/api/decisions", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { decisions: Decision[] };
      setHistory(
        (body.decisions || []).map((entry) => ({
          id: entry.id,
          title: entry.title,
          status: entry.status
        }))
      );
    } catch {
      // History is best-effort.
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  // 결정 분석 대화는 자유 채팅 세션이 아니라 결정에 저장된다.
  useEffect(() => {
    if (!decision || !messages.length) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const decisionId = decision.id;
    const payload = messages.map((message) => ({
      role: message.role,
      text: message.text,
      at: new Date().toISOString()
    }));
    saveTimer.current = window.setTimeout(() => {
      void fetch(`/api/decisions/${decisionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation: payload })
      }).catch(() => undefined);
    }, 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, decision?.id]);

  async function openHistoryDecision(decisionId: string) {
    try {
      const response = await fetch(`/api/decisions/${decisionId}`, { cache: "no-store" });
      if (!response.ok) throw new Error("분석 기록을 불러오지 못했습니다.");
      const body = (await response.json()) as { decision: Decision };
      const loaded = body.decision;
      setDecision(loaded);
      setConclusion(null);
      setMessages(
        (loaded.conversation || []).map((message) => ({
          id: nextId(),
          role: message.role,
          text: message.text
        }))
      );
      setPhase(loaded.recommendation ? "done" : loaded.objective ? "research-config" : "interview");
      setInterviewIndex(loaded.objective ? INTERVIEW.length - 1 : 0);
      setResearchProgress(null);
      try {
        const briefResponse = await fetch(`/api/decisions/${decisionId}/brief`, {
          cache: "no-store"
        });
        if (briefResponse.ok) {
          const briefBody = (await briefResponse.json()) as {
            brief?: { employeeVoice?: unknown };
          };
          setSignal((briefBody.brief?.employeeVoice as DecisionEmployeeSignal | null) || null);
        }
      } catch {
        setSignal(null);
      }
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "분석 기록을 불러오지 못했습니다.");
    }
  }

  useEffect(() => () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
  }, []);

  function pushAi(text: string, extra: Partial<ChatMessage> = {}) {
    setMessages((previous) => [...previous, { id: nextId(), role: "ai", text, ...extra }]);
  }

  function pushUser(text: string) {
    setMessages((previous) => [...previous, { id: nextId(), role: "user", text }]);
  }

  function resetConversation() {
    if (pollRef.current) window.clearInterval(pollRef.current);
    setMessages([]);
    setPhase("idle");
    setInterviewIndex(0);
    setDecision(null);
    setConclusion(null);
    setSignal(null);
    setResearchProgress(null);
    setNotice(null);
    setInput("");
  }

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      ...init
    });
    const body = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(body?.error || "요청을 처리하지 못했습니다.");
    return body;
  }

  async function startDecision(question: string) {
    setBusy(true);
    setNotice(null);
    pushUser(question);
    try {
      const created = await api<{ decision: Decision }>("/api/decisions", {
        method: "POST",
        body: JSON.stringify({
          title: question.slice(0, 120),
          objective: "",
          problem: { statement: question }
        })
      });
      setDecision(created.decision);
      setPhase("interview");
      setInterviewIndex(0);
      void loadHistory();
      pushAi("좋아요, 질문 의도를 파악했습니다. 정확한 결론을 위해 몇 가지만 여쭤볼게요.", {});
      const first = INTERVIEW[0];
      pushAi(first.prompt, { hint: first.hint, quickReplies: first.quickReplies });
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "결정을 시작하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function answerInterview(answer: string) {
    if (!decision) return;
    setBusy(true);
    pushUser(answer);
    try {
      const question = INTERVIEW[interviewIndex];
      const patched = await api<{ decision: Decision }>(`/api/decisions/${decision.id}`, {
        method: "PATCH",
        body: JSON.stringify(question.apply(answer, decision))
      });
      setDecision(patched.decision);

      const nextIndex = interviewIndex + 1;
      if (nextIndex < INTERVIEW.length) {
        setInterviewIndex(nextIndex);
        const next = INTERVIEW[nextIndex];
        pushAi(next.prompt, { hint: next.hint, quickReplies: next.quickReplies });
      } else {
        setPhase("research-config");
        pushAi(
          "필요 정보를 모두 수집했습니다. 딥리서치를 실행하면 외부 근거를 조사한 뒤 시뮬레이션과 최종 결론까지 이어집니다.",
          {}
        );
      }
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "답변을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function runResearch() {
    if (!decision) return;
    setBusy(true);
    setPhase("researching");
    setResearchProgress({ percent: 3, step: "조사 준비 중" });
    try {
      const query =
        `${decision.title}. 목표: ${decision.objective || "-"}. ` +
        `제약: ${decision.problem.constraints.join(", ") || "-"}. ` +
        `성공 기준: ${decision.problem.successCriteria.join(", ") || "-"}`;
      const started = await api<{
        ok: boolean;
        data: { job: { id: string }; session?: { id: string } };
      }>(
        "/api/ai/deep-research",
        {
          method: "POST",
          body: JSON.stringify({
            query,
            settings: {
              mode: researchMode === "deep" ? "deep" : "standard",
              maxDurationMs: researchMinutes * 60_000,
              includeLocalDocs,
              resultLanguage: "ko",
              reportLength: "short"
            }
          })
        }
      );
      const jobId = started.data.job.id;
      // 결정 분석의 딥리서치가 자유 채팅 대화 목록에 남지 않도록 세션을 보관 처리한다.
      if (started.data.session?.id) {
        void fetch(`/api/ai/sessions/${started.data.session.id}`, { method: "DELETE" }).catch(
          () => undefined
        );
      }
      await api(`/api/decisions/${decision.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          research: {
            jobId,
            status: "running",
            summary: "",
            findings: "",
            sourceCount: 0,
            updatedAt: new Date().toISOString()
          }
        })
      });

      pollRef.current = window.setInterval(async () => {
        try {
          const polled = await api<{
            ok: boolean;
            data: {
              job: {
                status: string;
                progress: number;
                currentStep: string;
                report: string | null;
                reportSections: { summary: string; findings: string } | null;
                sources: unknown[];
              };
            };
          }>(`/api/ai/deep-research/${jobId}`);
          const job = polled.data.job;
          setResearchProgress({
            percent: Math.max(5, Math.round(job.progress || 0)),
            step: job.currentStep || job.status
          });
          if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
            if (pollRef.current) window.clearInterval(pollRef.current);
            const completed = job.status === "completed";
            const summary =
              job.reportSections?.summary || (job.report ? job.report.slice(0, 800) : "");
            const patched = await api<{ decision: Decision }>(`/api/decisions/${decision.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                research: {
                  jobId,
                  status: completed ? "completed" : "failed",
                  summary,
                  findings: job.reportSections?.findings || "",
                  sourceCount: Array.isArray(job.sources) ? job.sources.length : 0,
                  updatedAt: new Date().toISOString()
                }
              })
            });
            setDecision(patched.decision);
            setResearchProgress(null);
            pushAi(
              completed
                ? `딥리서치를 완료했습니다. 출처 ${Array.isArray(job.sources) ? job.sources.length : 0}건을 교차 확인했어요. 이어서 시뮬레이션을 실행합니다.`
                : "딥리서치를 완료하지 못했습니다. 내부 데이터 기반으로 시뮬레이션을 계속 진행합니다."
            );
            await runSimulationAndConclude(patched.decision);
          }
        } catch {
          // Polling errors are transient; the next tick retries.
        }
      }, 4000);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "딥리서치를 시작하지 못했습니다.");
      setResearchProgress(null);
      pushAi("딥리서치를 시작하지 못했습니다(AI 공급자 미구성일 수 있어요). 시뮬레이션으로 계속 진행합니다.");
      await skipResearchAndContinue();
    } finally {
      setBusy(false);
    }
  }

  async function skipResearchAndContinue() {
    if (!decision) return;
    const patched = await api<{ decision: Decision }>(`/api/decisions/${decision.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        research: {
          jobId: null,
          status: "skipped",
          summary: "",
          findings: "",
          sourceCount: 0,
          updatedAt: new Date().toISOString()
        }
      })
    }).catch(() => ({ decision }));
    setDecision(patched.decision);
    await runSimulationAndConclude(patched.decision);
  }

  async function runSimulationAndConclude(current: Decision) {
    setPhase("simulating");
    try {
      const simulated = await api<{ decision: Decision }>(
        `/api/decisions/${current.id}/simulate`,
        { method: "POST" }
      );
      setDecision(simulated.decision);
      pushAi("시뮬레이션을 완료했습니다. 조직 의견을 확인하고 종합 결론을 작성합니다.");

      setPhase("concluding");
      const concluded = await api<{
        decision: Decision;
        conclusion: DecisionConclusion;
        signal: DecisionEmployeeSignal | null;
      }>(`/api/decisions/${current.id}/conclude`, { method: "POST" });
      setDecision(concluded.decision);
      setConclusion(concluded.conclusion);
      setSignal(concluded.signal);
      setPhase("done");
      pushAi(`핵심 결론: ${concluded.conclusion.coreConclusion}`, {
        hint: "상세 근거·반대 의견·시나리오는 우측 보고서에서 확인하고, 검토 후 승인하세요."
      });
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "분석을 완료하지 못했습니다.");
      setPhase("done");
    }
  }

  async function approve() {
    if (!decision?.recommendation) return;
    setApproving(true);
    try {
      const patched = await api<{ decision: Decision }>(`/api/decisions/${decision.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "approved",
          finalDecision: {
            choice: decision.recommendation.summary,
            notes: "AI Chat 보고서 검토 후 승인",
            decidedAt: new Date().toISOString()
          }
        })
      });
      setDecision(patched.decision);
      pushAi("최종 결정이 승인되었습니다. 결정 기록은 Memory에 축적됩니다.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "승인하지 못했습니다.");
    } finally {
      setApproving(false);
    }
  }

  function submitInput() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    if (phase === "idle") void startDecision(text);
    else if (phase === "interview") void answerInterview(text);
    else pushUser(text);
  }

  const steps: Array<{ label: string; detail: string; state: StepState }> = [
    {
      label: "질문 의도 파악",
      detail: decision ? decision.title : "결정 질문 분석",
      state: decision ? "done" : phase === "idle" ? "pending" : "active"
    },
    {
      label: "필요 정보 수집",
      detail: "목표·제약·위험 허용·성공 기준",
      state:
        phase === "interview"
          ? "active"
          : decision && phase !== "idle"
            ? "done"
            : "pending"
    },
    {
      label: "딥리서치 진행",
      detail:
        decision?.research?.status === "completed"
          ? `출처 ${decision.research.sourceCount}건 교차 확인`
          : decision?.research?.status === "skipped"
            ? "건너뜀"
            : "신뢰할 수 있는 출처 심층 분석",
      state:
        phase === "researching"
          ? "active"
          : decision?.research?.status === "completed"
            ? "done"
            : decision?.research?.status === "skipped" || decision?.research?.status === "failed"
              ? "skipped"
              : "pending"
    },
    {
      label: "시뮬레이션 실행",
      detail: "시나리오 확률·대안 가중 평가",
      state:
        phase === "simulating"
          ? "active"
          : decision?.simulationResult
            ? "done"
            : "pending"
    },
    {
      label: "조직 의견 수렴",
      detail: signal
        ? `Employee Signal ${signal.employeeSignalScore ?? "—"}점 반영`
        : "Team 익명 설문 결과 반영",
      state: phase === "done" ? (signal ? "done" : "skipped") : phase === "concluding" ? "active" : "pending"
    },
    {
      label: "종합 분석 및 결론 도출",
      detail: "핵심 결론 · 반대 의견 고려",
      state: phase === "done" && decision?.recommendation ? "done" : phase === "concluding" ? "active" : "pending"
    }
  ];

  return (
    <div className="pt-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-app-hover text-app-primary">
            <Sparkles size={18} />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-app-text">AI와 함께하는 의사결정 파트너</h1>
            <p className="text-xs text-app-muted">질문하고, 분석하고, 실행 가능한 결론을 얻어보세요.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mode === "decision" && history.length ? (
            <select
              value={decision?.id || ""}
              onChange={(event) => {
                if (event.target.value) void openHistoryDecision(event.target.value);
              }}
              className="h-10 max-w-[220px] rounded-2xl border border-app-border bg-white px-3 text-xs font-semibold text-app-muted"
              aria-label="분석 기록"
            >
              <option value="">분석 기록 열기…</option>
              {history.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title.slice(0, 40)}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            onClick={() => setMode(mode === "decision" ? "free" : "decision")}
            className="flex h-10 items-center gap-1.5 rounded-2xl border border-app-border bg-white px-4 text-xs font-semibold text-app-muted transition hover:bg-app-hover hover:text-app-primary"
          >
            <MessageCircle size={14} />
            {mode === "decision" ? "자유 대화" : "결정 분석으로"}
          </button>
          <button
            type="button"
            onClick={resetConversation}
            className="flex h-10 items-center gap-1.5 rounded-2xl border border-app-border bg-white px-4 text-xs font-semibold text-app-text transition hover:bg-app-hover hover:text-app-primary"
          >
            <Plus size={14} />새 대화
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
              className="flex h-10 items-center gap-1.5 rounded-2xl bg-app-primary px-4 text-xs font-bold text-white shadow-soft transition hover:opacity-90"
            >
              <Settings2 size={14} />
              딥리서치 설정
            </button>
            {settingsOpen ? (
              <div className="absolute right-0 top-12 z-30 w-72 rounded-app border border-app-border bg-white p-4 shadow-app">
                <p className="text-xs font-bold text-app-text">딥리서치 설정</p>
                <label className="mt-3 block text-[11px] font-semibold text-app-muted">
                  조사 깊이
                  <select
                    value={researchMode}
                    onChange={(event) => setResearchMode(event.target.value as "standard" | "deep")}
                    className="mt-1 h-9 w-full rounded-xl border border-app-border bg-white px-2 text-xs text-app-text"
                  >
                    <option value="standard">일반</option>
                    <option value="deep">심층</option>
                  </select>
                </label>
                <label className="mt-3 block text-[11px] font-semibold text-app-muted">
                  시간 예산 — {researchMinutes}분
                  <input
                    type="range"
                    min={5}
                    max={60}
                    step={5}
                    value={researchMinutes}
                    onChange={(event) => setResearchMinutes(Number(event.target.value))}
                    className="mt-2 w-full accent-[var(--primary)]"
                  />
                </label>
                <label className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-app-muted">
                  <input
                    type="checkbox"
                    checked={includeLocalDocs}
                    onChange={(event) => setIncludeLocalDocs(event.target.checked)}
                  />
                  내부 문서 포함
                </label>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {mode === "free" ? (
        <ChatView />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="flex h-[calc(100dvh-220px)] min-h-[480px] flex-col rounded-app border border-app-border bg-white shadow-soft">
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 app-scrollbar">
              <AiBubble>
                <p className="text-sm font-bold text-app-text">
                  안녕하세요! 저는 여러분의 AI 전략 분석 파트너입니다.
                </p>
                <p className="mt-1 text-xs leading-5 text-app-muted">
                  무엇에 대해 함께 탐색하고 인사이트를 찾아드릴까요? 예시 질문을 선택하거나, 직접
                  입력해보세요.
                </p>
              </AiBubble>

              {phase === "idle" ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {EXAMPLES.map((example) => {
                    const Icon = example.icon;
                    return (
                      <button
                        key={example.title}
                        type="button"
                        onClick={() => void startDecision(example.question)}
                        className="rounded-app border border-app-border bg-white p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-app-primary/50"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-app-hover text-app-primary">
                          <Icon size={16} />
                        </div>
                        <p className="mt-2.5 text-xs font-bold text-app-text">{example.title}</p>
                        <p className="mt-1 text-[11px] leading-4 text-app-muted">{example.question}</p>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {messages.map((message) =>
                message.role === "ai" ? (
                  <AiBubble key={message.id}>
                    <p className="text-sm font-semibold leading-6 text-app-text">{message.text}</p>
                    {message.hint ? (
                      <p className="mt-1 text-[11px] leading-4 text-app-muted">{message.hint}</p>
                    ) : null}
                    {message.quickReplies && phase === "interview" ? (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {message.quickReplies.map((reply) => (
                          <button
                            key={reply}
                            type="button"
                            disabled={busy}
                            onClick={() => void answerInterview(reply)}
                            className="rounded-xl border border-app-border bg-white px-3 py-1.5 text-[11px] font-semibold text-app-muted transition hover:border-app-primary hover:text-app-primary"
                          >
                            {reply}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </AiBubble>
                ) : (
                  <div key={message.id} className="flex justify-end">
                    <div className="max-w-[75%] rounded-2xl rounded-br-md bg-app-primary px-4 py-3 text-sm font-medium leading-6 text-white shadow-soft">
                      {message.text}
                    </div>
                  </div>
                )
              )}

              {decision && phase !== "idle" ? (
                <AiBubble>
                  <p className="text-xs font-bold text-app-text">AI 분석을 진행합니다…</p>
                  <ul className="mt-2.5 space-y-2">
                    {steps.map((step, index) => (
                      <li key={step.label} className="flex items-start gap-2.5">
                        <StepIcon state={step.state} />
                        <div className="min-w-0">
                          <p
                            className={`text-[12px] font-bold ${
                              step.state === "pending" ? "text-app-muted" : "text-app-text"
                            }`}
                          >
                            {index + 1}. {step.label}
                            {step.state === "skipped" ? (
                              <span className="ml-1.5 text-[10px] font-semibold text-app-muted">
                                (건너뜀)
                              </span>
                            ) : null}
                          </p>
                          <p className="text-[10.5px] text-app-muted">{step.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {researchProgress ? (
                    <div className="mt-3">
                      <p className="text-[10.5px] font-semibold text-app-muted">
                        {researchProgress.step} — {researchProgress.percent}%
                      </p>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-app-primary transition-all"
                          style={{ width: `${researchProgress.percent}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                </AiBubble>
              ) : null}

              {phase === "research-config" ? (
                <AiBubble>
                  <p className="text-xs font-bold text-app-text">딥리서치 설정</p>
                  <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl bg-app-hover/60 p-2.5">
                      <p className="text-[10px] font-bold text-app-text">조사 깊이</p>
                      <p className="text-[10.5px] text-app-muted">
                        {researchMode === "deep" ? "심층" : "일반"} · 최대 {researchMinutes}분
                      </p>
                    </div>
                    <div className="rounded-xl bg-app-hover/60 p-2.5">
                      <p className="text-[10px] font-bold text-app-text">출처</p>
                      <p className="text-[10.5px] text-app-muted">
                        웹{includeLocalDocs ? " + 내부 문서" : ""}
                      </p>
                    </div>
                    <div className="rounded-xl bg-app-hover/60 p-2.5">
                      <p className="text-[10px] font-bold text-app-text">시뮬레이션</p>
                      <p className="text-[10.5px] text-app-muted">자동 실행</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runResearch()}
                      className="h-9 rounded-xl bg-app-primary px-4 text-xs font-bold text-white shadow-soft transition hover:opacity-90 disabled:opacity-50"
                    >
                      딥리서치 + 시뮬레이션 실행
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void skipResearchAndContinue()}
                      className="h-9 rounded-xl border border-app-border bg-white px-4 text-xs font-semibold text-app-muted transition hover:bg-app-hover"
                    >
                      건너뛰고 시뮬레이션만
                    </button>
                  </div>
                </AiBubble>
              ) : null}

              {notice ? (
                <p className="text-center text-[11px] font-semibold text-red-500">{notice}</p>
              ) : null}
            </div>

            <div className="border-t border-app-border p-4">
              <div className="flex items-center gap-2 rounded-2xl border border-app-border bg-white px-3 py-2 shadow-soft">
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.nativeEvent.isComposing) submitInput();
                  }}
                  placeholder={
                    phase === "interview" ? "답변을 입력하세요…" : "무엇이든 물어보세요…"
                  }
                  className="h-9 min-w-0 flex-1 bg-transparent text-sm text-app-text outline-none placeholder:text-slate-400"
                />
                <button
                  type="button"
                  disabled={busy || !input.trim()}
                  onClick={submitInput}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-app-primary text-white shadow-soft transition hover:opacity-90 disabled:opacity-40"
                  aria-label="보내기"
                >
                  <Send size={15} />
                </button>
              </div>
            </div>
          </div>

          <div className="h-[calc(100dvh-220px)] min-h-[480px]">
            <AnalysisReportPanel
              decision={decision}
              conclusion={conclusion}
              signal={signal}
              onApprove={() => void approve()}
              approving={approving}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function AiBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-app-primary text-white shadow-soft">
        <Sparkles size={15} />
      </div>
      <div className="min-w-0 max-w-[85%] rounded-2xl rounded-tl-md border border-app-border bg-white p-4 shadow-soft">
        {children}
      </div>
    </div>
  );
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-app-primary text-white">
        <Check size={11} strokeWidth={3} />
      </span>
    );
  }
  if (state === "active") {
    return <Loader2 size={17} className="mt-0.5 shrink-0 animate-spin text-app-primary" />;
  }
  if (state === "skipped") {
    return <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-app-border bg-app-hover" />;
  }
  return <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-app-border" />;
}
