"use client";

import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileBarChart,
  Loader2,
  ShieldAlert,
  Users
} from "lucide-react";
import { useState } from "react";
import type {
  Decision,
  DecisionResearchSource
} from "@/src/lib/decisions/decision.types";
import type { DecisionEmployeeSignal } from "@/src/lib/surveys/survey.types";
import type { DecisionConclusion } from "@/src/lib/decisions/decision-conclusion";
import { stripMarkdownEmphasis } from "@/src/lib/deep-research/research-report";

type AnalysisReportPanelProps = {
  decision: Decision | null;
  conclusion: DecisionConclusion | null;
  signal: DecisionEmployeeSignal | null;
  onApprove: () => void;
  approving: boolean;
};

const CONFIDENCE_LABELS: Record<string, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음"
};

// 우측 "AI 분석 보고서" 패널 — docs/design/ai-chat-design.svg 레이아웃.
export function AnalysisReportPanel({
  decision,
  conclusion,
  signal,
  onApprove,
  approving
}: AnalysisReportPanelProps) {
  const research = decision?.research || null;
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [fetchedSources, setFetchedSources] = useState<DecisionResearchSource[] | null>(null);
  const sources = research?.sources?.length ? research.sources : fetchedSources || [];
  const summaryFailed = Boolean(
    research?.summary && research.summary.includes("AI 요약 생성에 실패")
  );
  const simulation = decision?.simulationResult || null;
  const recommendation = decision?.recommendation || null;
  const core = conclusion?.coreConclusion || recommendation?.summary || null;
  const counterpoints =
    conclusion?.counterpoints ||
    (recommendation?.counterpoints || []).map((line) => {
      const [view, expectedOutcome] = line.split(" → ");
      return { view: view || line, expectedOutcome: expectedOutcome || "" };
    });

  // 출처 확인 — 결정에 저장된 출처를 우선 사용하고, 이전 분석처럼 저장돼
  // 있지 않으면 리서치 작업에서 직접 불러온다.
  async function toggleSources() {
    if (sourcesOpen) {
      setSourcesOpen(false);
      return;
    }
    setSourcesOpen(true);
    if (research?.sources?.length || fetchedSources || !research?.jobId) return;
    setSourcesLoading(true);
    try {
      const response = await fetch(`/api/ai/deep-research/${research.jobId}`, {
        cache: "no-store"
      });
      const body = (await response.json().catch(() => ({}))) as {
        data?: { job?: { sources?: Array<{ title?: string; url?: string; domain?: string }> } };
      };
      const jobSources = body.data?.job?.sources || [];
      setFetchedSources(
        jobSources
          .filter((source) => source.url)
          .map((source) => ({
            title: source.title || source.domain || source.url || "출처",
            url: source.url || "",
            domain: source.domain || ""
          }))
      );
    } catch {
      setFetchedSources([]);
    } finally {
      setSourcesLoading(false);
    }
  }

  function downloadReport() {
    if (!decision) return;
    const lines: string[] = [
      `# AI 분석 보고서 — ${decision.title}`,
      "",
      `## 핵심 결과`,
      core || "(결론 대기)",
      ""
    ];
    if (research?.summary) {
      lines.push("## 딥리서치 요약", research.summary, "");
      if (research.findings) lines.push("## 주요 발견", research.findings, "");
      lines.push(`출처 ${research.sourceCount}건`, "");
      if (sources.length) {
        lines.push("### 출처 목록");
        sources.forEach((source, index) => {
          lines.push(`${index + 1}. ${source.title} — ${source.url}`);
        });
        lines.push("");
      }
    }
    if (simulation) {
      lines.push("## 시나리오 분석 결과");
      for (const scenario of simulation.scenarios) {
        lines.push(`- ${scenario.label}: 확률 ${scenario.probability}% — ${scenario.expectedOutcome}`);
      }
      lines.push("", "## 대안 순위");
      simulation.ranking.forEach((entry, index) => {
        lines.push(`${index + 1}. ${entry.title} — ${entry.total}점`);
      });
      lines.push("", simulation.sensitivityNote, "");
    }
    if (signal) {
      lines.push(
        "## 조직 의견",
        `Employee Signal ${signal.employeeSignalScore ?? "—"}점 · 응답률 ${Math.round(signal.responseRate * 100)}% · 신뢰 ${CONFIDENCE_LABELS[signal.confidenceLevel]}`,
        ...(signal.topConcerns.length ? [`주요 우려: ${signal.topConcerns.join(", ")}`] : []),
        ...(signal.minorityViews.length ? [`소수 의견: ${signal.minorityViews.join(" / ")}`] : []),
        ""
      );
    }
    if (counterpoints.length) {
      lines.push("## 반대 의견 고려 결과");
      for (const item of counterpoints) {
        lines.push(`- ${item.view} → ${item.expectedOutcome}`);
      }
      lines.push("");
    }
    if (recommendation) {
      lines.push("## 최종 결론", recommendation.summary, "", recommendation.rationale, "");
      if (recommendation.switchCondition) {
        lines.push(`결론이 바뀌는 조건: ${recommendation.switchCondition}`);
      }
      if (recommendation.firstAction) {
        lines.push(`오늘의 첫 행동: ${recommendation.firstAction}`);
      }
      lines.push("");
    }
    if (decision.finalDecision) {
      lines.push("## 사람의 최종 승인", decision.finalDecision.choice, decision.finalDecision.decidedAt);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `decision-report-${decision.id.slice(0, 8)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-app border border-app-border bg-app-card shadow-soft">
      <div className="flex items-center justify-between gap-3 border-b border-app-border px-5 py-4">
        <p className="flex items-center gap-2 text-sm font-bold text-app-text">
          <FileBarChart size={16} className="text-app-primary" />
          AI 분석 보고서
        </p>
        <button
          type="button"
          disabled={!decision}
          onClick={downloadReport}
          className="flex h-8 items-center gap-1.5 rounded-xl border border-app-border bg-app-card px-3 text-[11px] font-semibold text-app-muted transition hover:bg-app-hover hover:text-app-primary disabled:opacity-40"
        >
          <Download size={12} />
          보고서 다운로드
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 app-scrollbar">
        {!decision ? (
          <p className="rounded-2xl bg-app-hover/60 p-4 text-xs leading-5 text-app-muted">
            질문을 입력하면 분석이 시작되고, 이 패널에 보고서가 실시간으로 작성됩니다.
          </p>
        ) : (
          <>
            <section>
              <SectionLabel index={1} title="핵심 결과 요약" isNew={Boolean(core)} />
              <div className="mt-2 rounded-2xl border border-[#e4defc] bg-gradient-to-br from-[#f5f3ff] to-[#ede9fe] p-4">
                <p className="text-[11px] font-bold text-app-primary">핵심 결과</p>
                <p className="mt-1.5 text-sm font-bold leading-6 text-app-text">
                  {core || "분석이 완료되면 1~2문장의 핵심 결론이 여기에 표시됩니다."}
                </p>
                {conclusion || recommendation ? (
                  <span className="mt-2 inline-block rounded-lg bg-app-card px-2 py-0.5 text-[10px] font-bold text-app-primary">
                    신뢰수준 {CONFIDENCE_LABELS[conclusion?.confidence || recommendation?.confidence || "medium"]}
                  </span>
                ) : null}
              </div>
            </section>

            <section>
              <SectionLabel index={2} title="딥리서치 · 시장 전망" />
              <div className="mt-2 rounded-2xl border border-app-border bg-app-card p-4">
                {research?.status === "completed" && research.summary ? (
                  <>
                    {summaryFailed ? (
                      <div className="mb-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                        <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-600" />
                        <p className="text-[11px] leading-4 text-amber-800">
                          AI 요약 생성이 실패해 수집된 근거를 원문 그대로 정리했습니다. 아래
                          출처를 직접 확인하거나, 딥리서치를 다시 실행하면 요약이 재생성됩니다.
                        </p>
                      </div>
                    ) : null}
                    <p className="whitespace-pre-line text-xs leading-5 text-app-text">
                      {stripMarkdownEmphasis(research.summary)}
                    </p>
                    {research.findings ? (
                      <p className="mt-2 whitespace-pre-line text-[11px] leading-5 text-app-muted">
                        {stripMarkdownEmphasis(research.findings)}
                      </p>
                    ) : null}
                  </>
                ) : research?.status === "running" ? (
                  <p className="text-xs text-app-muted">딥리서치 진행 중…</p>
                ) : research?.status === "failed" ? (
                  <p className="text-xs text-app-muted">
                    딥리서치를 완료하지 못했습니다. 통계·시뮬레이션 분석은 계속 제공됩니다.
                  </p>
                ) : (
                  <p className="text-xs text-app-muted">
                    딥리서치를 실행하면 시장·경쟁·근거 요약이 여기에 표시됩니다.
                  </p>
                )}
                {research?.status === "completed" && research.sourceCount > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void toggleSources()}
                      className="mt-2 flex items-center gap-1 text-[10.5px] font-semibold text-app-primary transition hover:underline"
                    >
                      출처 {research.sourceCount}건 확인
                      {sourcesOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>
                    {sourcesOpen ? (
                      <div className="mt-2 space-y-1.5 rounded-xl bg-app-hover/50 p-2.5">
                        {sourcesLoading ? (
                          <p className="flex items-center gap-1.5 text-[10.5px] text-app-muted">
                            <Loader2 size={11} className="animate-spin" />
                            출처를 불러오는 중…
                          </p>
                        ) : sources.length ? (
                          sources.map((source, index) => (
                            <div key={`${source.url}-${index}`} className="min-w-0 text-[10.5px] leading-4">
                              {source.url.startsWith("http") ? (
                                <a
                                  href={source.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-start gap-1 text-app-text transition hover:text-app-primary"
                                >
                                  <ExternalLink size={10} className="mt-0.5 shrink-0" />
                                  <span className="min-w-0">
                                    <span className="font-semibold [overflow-wrap:anywhere]">
                                      {index + 1}. {source.title}
                                    </span>
                                    {source.domain ? (
                                      <span className="ml-1 text-app-muted">({source.domain})</span>
                                    ) : null}
                                  </span>
                                </a>
                              ) : (
                                <p className="font-semibold text-app-text">
                                  {index + 1}. {source.title}
                                  <span className="ml-1 font-normal text-app-muted">(내부 데이터)</span>
                                </p>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="text-[10.5px] text-app-muted">
                            저장된 출처 정보를 찾지 못했습니다. 새 분석에서는 출처가 자동
                            저장됩니다.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </section>

            <section>
              <SectionLabel index={3} title="시나리오 분석 결과" icon={BarChart3} />
              <div className="mt-2 overflow-hidden rounded-2xl border border-app-border">
                {simulation ? (
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-app-hover/50 text-left text-app-muted">
                        <th className="px-3 py-2 font-semibold">시나리오</th>
                        <th className="px-3 py-2 font-semibold">확률</th>
                        <th className="px-3 py-2 font-semibold">예상 결과</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simulation.scenarios.map((scenario) => (
                        <tr
                          key={scenario.kind}
                          className={scenario.kind === "base" ? "bg-[#f5f3ff] font-semibold" : ""}
                        >
                          <td className="border-t border-app-border px-3 py-2 text-app-text">
                            {scenario.label}
                          </td>
                          <td className="border-t border-app-border px-3 py-2 text-app-primary">
                            {scenario.probability}%
                          </td>
                          <td className="border-t border-app-border px-3 py-2 text-app-muted">
                            {scenario.expectedOutcome}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="p-4 text-xs text-app-muted">시뮬레이션 실행 후 표시됩니다.</p>
                )}
              </div>
              {simulation?.ranking.length ? (
                <div className="mt-2 space-y-1.5 rounded-2xl border border-app-border bg-app-card p-3">
                  {simulation.ranking.map((entry, index) => (
                    <div key={entry.id} className="flex items-center gap-2 text-[11px]">
                      <span
                        className={`w-24 shrink-0 truncate font-bold ${index === 0 ? "text-app-primary" : "text-app-muted"}`}
                      >
                        {index + 1}위 {entry.title}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${index === 0 ? "bg-app-primary" : "bg-[#c7bfff]"}`}
                          style={{ width: `${entry.total}%` }}
                        />
                      </div>
                      <span className="w-10 text-right font-semibold text-app-text">{entry.total}</span>
                    </div>
                  ))}
                  <p className="pt-1 text-[10.5px] text-app-muted">{simulation.sensitivityNote}</p>
                </div>
              ) : null}
            </section>

            <section>
              <SectionLabel index={4} title="조직 의견 요약" icon={Users} />
              <div className="mt-2 rounded-2xl border border-app-border bg-app-card p-4">
                {signal ? (
                  <>
                    <p className="text-[11px] font-bold text-app-primary">
                      Employee Signal {signal.employeeSignalScore ?? "—"}점 · 응답률{" "}
                      {Math.round(signal.responseRate * 100)}% · 신뢰{" "}
                      {CONFIDENCE_LABELS[signal.confidenceLevel]}
                    </p>
                    <div className="mt-2 space-y-1.5">
                      <SignalBar label="지지" value={signal.supportScore} />
                      <SignalBar label="기대 효과" value={signal.impactScore} />
                      <SignalBar label="실행 가능성" value={signal.feasibilityScore} />
                      <SignalBar label="위험 우려" value={signal.riskScore} />
                    </div>
                    {signal.topConcerns.length ? (
                      <p className="mt-2 text-[10.5px] text-app-muted">
                        주요 우려: {signal.topConcerns.join(", ")}
                      </p>
                    ) : null}
                    {signal.minorityViews.length ? (
                      <p className="mt-1 text-[10.5px] text-app-muted">
                        소수 의견 {signal.minorityViews.length}건 보존됨
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs leading-5 text-app-muted">
                    아직 집계된 설문이 없습니다. Team 페이지에서 익명 설문을 게시하면 결과가
                    자동으로 반영됩니다. (가중치 {Math.round((decision.employeeSignalWeight || 0.15) * 100)}%)
                  </p>
                )}
              </div>
            </section>

            {recommendation ? (
              <section>
                <div className="rounded-2xl border border-[#bbe7c8] bg-[#f0fdf4] p-4">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#16a34a]">
                    <CheckCircle2 size={13} />
                    최종 결론
                  </p>
                  <p className="mt-1.5 whitespace-pre-line text-xs font-semibold leading-5 text-app-text">
                    {stripMarkdownEmphasis(recommendation.summary)}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-[11px] leading-5 text-app-muted">
                    {stripMarkdownEmphasis(recommendation.rationale)}
                  </p>
                  {recommendation.switchCondition ? (
                    <p className="mt-2 border-t border-[#bbe7c8] pt-2 text-[11px] leading-5 text-[#3f6212]">
                      <b>결론이 바뀌는 조건</b> — {recommendation.switchCondition}
                    </p>
                  ) : null}
                  {recommendation.firstAction ? (
                    <p className="mt-1 text-[11px] leading-5 text-[#3f6212]">
                      <b>오늘의 첫 행동</b> — {recommendation.firstAction}
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}

            {counterpoints.length ? (
              <section>
                <div className="rounded-2xl border border-[#f3d9db] bg-[#fdf3f4] p-4">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#c2434e]">
                    <ShieldAlert size={13} />
                    반대 의견 고려 결과
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {counterpoints.map((item, index) => (
                      <li key={index} className="text-[11px] leading-5 text-[#8f4a51]">
                        <b>{item.view}</b>
                        {item.expectedOutcome ? ` → ${item.expectedOutcome}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            ) : null}

            {recommendation ? (
              <section className="rounded-2xl border border-app-border bg-app-card p-4">
                {decision.finalDecision ? (
                  <p className="flex items-start gap-2 text-xs leading-5 text-app-text">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-app-primary" />
                    <span>
                      <b>승인 완료</b> — {decision.finalDecision.choice}
                      <span className="block text-[10.5px] text-app-muted">
                        {new Date(decision.finalDecision.decidedAt).toLocaleString("ko-KR")}
                      </span>
                    </span>
                  </p>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] leading-4 text-app-muted">
                      <AlertTriangle size={12} className="mr-1 inline text-app-primary" />
                      최종 결정은 항상 사람이 승인합니다
                    </p>
                    <button
                      type="button"
                      disabled={approving}
                      onClick={onApprove}
                      className="h-9 shrink-0 rounded-xl bg-app-primary px-4 text-xs font-bold text-white shadow-soft transition hover:opacity-90 disabled:opacity-50"
                    >
                      {approving ? "승인 중" : "승인하기"}
                    </button>
                  </div>
                )}
              </section>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}

function SectionLabel({
  index,
  title,
  icon: Icon,
  isNew = false
}: {
  index: number;
  title: string;
  icon?: typeof BarChart3;
  isNew?: boolean;
}) {
  return (
    <p className="flex items-center gap-2 text-xs font-bold text-app-text">
      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-app-hover text-[10px] font-extrabold text-app-primary">
        {index}
      </span>
      {Icon ? <Icon size={13} className="text-app-primary" /> : null}
      {title}
      {isNew ? (
        <span className="rounded-md bg-app-primary px-1.5 py-0.5 text-[9px] font-extrabold text-white">
          NEW
        </span>
      ) : null}
    </p>
  );
}

function SignalBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center gap-2 text-[10.5px] text-app-muted">
      <span className="w-16 shrink-0">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-app-primary/80"
          style={{ width: `${value ?? 0}%` }}
        />
      </div>
      <span className="w-8 text-right font-semibold text-app-text">{value ?? "—"}</span>
    </div>
  );
}
