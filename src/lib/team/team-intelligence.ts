import { listDecisions } from "../decisions/decision.repository";
import { readOwnerState } from "../db/owner-state-store";
import { SURVEY_STORE } from "../surveys/survey.service";
import { listMeetings, listTeamMembers } from "./team.repository";

// Organization Intelligence — 익명 집계만 사용하는 결정론적 조직 분석.
// 개인 응답·초대 데이터는 절대 사용하지 않는다(응답 수·일 단위 버킷·신호만).
//
// 수식(문서화):
// - 조직 분위기: 최신 신호들의 평균으로 긍정 = mean(support), 우려 = mean(risk),
//   중립 = 100 - 긍정·우려 비중 정규화.
// - 의견 일치도: mean(consensusScore).
// - 충돌 지수: mean(|supportScore - feasibilityScore|) ≥ 25 → 높음, ≥ 12 → 보통.
// - AI 반영률: 신호가 결론(recommendation)에 반영된 결정 / 신호 보유 결정.

export type TeamIntelligence = {
  kpis: {
    memberCount: number;
    activeRate: number | null;
    activeSurveys: number;
    avgResponseRate: number | null;
    aiReflectionRate: number | null;
  };
  pulse: { positive: number; concern: number; neutral: number } | null;
  consensusAvg: number | null;
  topConcern: { label: string; percent: number | null } | null;
  topOpportunity: string | null;
  conflict: { level: "높음" | "보통" | "낮음"; note: string } | null;
  pendingReflections: number;
  participationTrend: Array<{ date: string; count: number }>;
  surveyParticipation: Array<{ title: string; rate: number; answered: number; eligible: number; status: string }>;
  insightChips: string[];
  report: {
    decisionId: string;
    title: string;
    core: string;
    summaryLines: string[];
    opposeTop: Array<{ label: string; percent: number | null }>;
    risks: string[];
    suggestions: string[];
    signalScore: number | null;
    responseRate: number | null;
  } | null;
  activity: Array<{ kind: "survey" | "analysis" | "meeting" | "memory"; label: string; detail: string; at: string }>;
};

export async function getTeamIntelligence(ownerId: string): Promise<TeamIntelligence> {
  const [members, surveyState, decisions, meetings] = await Promise.all([
    listTeamMembers(ownerId),
    readOwnerState(SURVEY_STORE, ownerId),
    listDecisions(ownerId),
    listMeetings(ownerId)
  ]);

  const surveys = surveyState.surveys.filter((survey) => survey.status !== "archived");
  const signals = surveyState.signals;
  const activeSurveys = surveys.filter((survey) => survey.status === "active");

  const surveyParticipation = surveys.slice(0, 6).map((survey) => {
    const answered = surveyState.responses.filter(
      (response) => response.surveyId === survey.id
    ).length;
    const eligible = survey.targetMemberEmails.length;
    return {
      title: survey.title,
      rate: eligible ? Math.round((answered / eligible) * 100) : 0,
      answered,
      eligible,
      status: survey.status
    };
  });

  const rates = surveyParticipation.filter((entry) => entry.eligible > 0).map((entry) => entry.rate);
  const avgResponseRate = rates.length
    ? Math.round(rates.reduce((sum, rate) => sum + rate, 0) / rates.length)
    : null;

  const decisionsWithSignal = decisions.filter((decision) =>
    signals.some((signal) => signal.decisionId === decision.id)
  );
  const reflected = decisionsWithSignal.filter((decision) => decision.recommendation);
  const aiReflectionRate = decisionsWithSignal.length
    ? Math.round((reflected.length / decisionsWithSignal.length) * 100)
    : null;

  const mean = (values: Array<number | null>) => {
    const valid = values.filter((value): value is number => value !== null);
    return valid.length
      ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length)
      : null;
  };
  const support = mean(signals.map((signal) => signal.supportScore));
  const risk = mean(signals.map((signal) => signal.riskScore));
  const consensusAvg = mean(signals.map((signal) => signal.consensusScore));

  let pulse: TeamIntelligence["pulse"] = null;
  if (support !== null || risk !== null) {
    const positiveRaw = support ?? 50;
    const concernRaw = risk ?? 30;
    const total = positiveRaw + concernRaw;
    const positive = Math.round((positiveRaw / Math.max(total, 100)) * 100);
    const concern = Math.round((concernRaw / Math.max(total, 100)) * 100);
    pulse = { positive, concern, neutral: Math.max(0, 100 - positive - concern) };
  }

  const concernCounts = new Map<string, number>();
  const opportunityCounts = new Map<string, number>();
  for (const signal of signals) {
    for (const concern of signal.topConcerns) {
      concernCounts.set(concern, (concernCounts.get(concern) || 0) + 1);
    }
    for (const reason of signal.topSupportReasons) {
      opportunityCounts.set(reason, (opportunityCounts.get(reason) || 0) + 1);
    }
  }
  // 위험 복수선택 집계에서 최다 선택지를 우려로 사용(비율 = 선택 수 / 응답 수).
  let topConcern: TeamIntelligence["topConcern"] = null;
  const latestReport = buildLatestReport();
  if (latestReport?.opposeTop.length) {
    topConcern = latestReport.opposeTop[0];
  } else if (concernCounts.size) {
    const [label] = [...concernCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    topConcern = { label, percent: null };
  }
  const topOpportunity = opportunityCounts.size
    ? [...opportunityCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    : null;

  const gaps = signals
    .filter((signal) => signal.supportScore !== null && signal.feasibilityScore !== null)
    .map((signal) => Math.abs((signal.supportScore as number) - (signal.feasibilityScore as number)));
  const gapAvg = gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : null;
  const conflict: TeamIntelligence["conflict"] =
    gapAvg === null
      ? null
      : gapAvg >= 25
        ? { level: "높음", note: "지지와 실행 가능성 평가의 격차가 큽니다. 실행 조건을 논의하세요." }
        : gapAvg >= 12
          ? { level: "보통", note: "지지 대비 실행 가능성 우려가 존재합니다." }
          : { level: "낮음", note: "지지와 실행 가능성 평가가 대체로 일치합니다." };

  const pendingReflections = decisionsWithSignal.filter(
    (decision) => !decision.recommendation
  ).length;

  const trendMap = new Map<string, number>();
  for (const response of surveyState.responses) {
    trendMap.set(response.submittedAtBucket, (trendMap.get(response.submittedAtBucket) || 0) + 1);
  }
  const participationTrend = [...trendMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([date, count]) => ({ date, count }));

  const insightChips: string[] = [];
  if (topConcern) insightChips.push(`조직은 '${topConcern.label}'을(를) 가장 우려합니다`);
  if (topOpportunity) insightChips.push(`'${topOpportunity}'이(가) 반복 지지되고 있어요`);
  if (consensusAvg !== null) insightChips.push(`평균 의견 일치도 ${consensusAvg}점`);
  if (conflict) insightChips.push(`의견 충돌 지수 ${conflict.level}`);
  if (!insightChips.length) {
    insightChips.push("설문 결과가 공개되면 AI가 조직 인사이트를 생성합니다");
  }

  function buildLatestReport(): TeamIntelligence["report"] {
    const latestSignal = [...signals].sort((a, b) => b.calculatedAt.localeCompare(a.calculatedAt))[0];
    if (!latestSignal?.decisionId) return null;
    const decision = decisions.find((candidate) => candidate.id === latestSignal.decisionId);
    if (!decision) return null;

    const survey = surveys.find((candidate) => candidate.id === latestSignal.surveyId);
    const responses = survey
      ? surveyState.responses.filter((response) => response.surveyId === survey.id)
      : [];
    const responseCount = responses.length || latestSignal.responseCount;
    const riskQuestion = survey?.questions.find(
      (question) => question.decisionCriterion === "risk" && question.type === "multi_choice"
    );
    const optionCounts = new Map<string, number>();
    if (riskQuestion) {
      const responseIds = new Set(responses.map((response) => response.id));
      for (const answer of surveyState.answers) {
        if (answer.questionId !== riskQuestion.id || !responseIds.has(answer.responseId)) continue;
        for (const option of answer.selectedOptions || []) {
          optionCounts.set(option, (optionCounts.get(option) || 0) + 1);
        }
      }
    }
    const opposeTop = [...optionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, count]) => ({
        label,
        percent: responseCount ? Math.round((count / responseCount) * 100) : null
      }));

    const summaryLines = [
      `대상 ${latestSignal.eligibleCount}명 중 ${latestSignal.responseCount}명이 익명으로 응답했습니다 (응답률 ${Math.round(latestSignal.responseRate * 100)}%).`,
      latestSignal.employeeSignalScore !== null
        ? `Employee Signal ${latestSignal.employeeSignalScore}점 · 지지 ${latestSignal.supportScore ?? "—"} · 실행 가능성 ${latestSignal.feasibilityScore ?? "—"}.`
        : "점수 집계가 아직 부족합니다.",
      decision.recommendation
        ? "조직 의견이 최종 결론에 반영되었습니다."
        : "AI Chat에서 결론을 생성하면 이 신호가 자동 반영됩니다."
    ];

    return {
      decisionId: decision.id,
      title: decision.title,
      core:
        decision.recommendation?.summary ||
        (latestSignal.supportScore !== null
          ? `조직의 지지 점수는 ${latestSignal.supportScore}점입니다. 결론 생성 시 자동 반영됩니다.`
          : "결론이 생성되면 여기에 핵심 결과가 표시됩니다."),
      summaryLines,
      opposeTop,
      risks: latestSignal.topConcerns.slice(0, 5),
      suggestions: (decision.recommendation?.counterpoints || [])
        .slice(0, 3)
        .map((line) => line.split(" → ")[1] || line),
      signalScore: latestSignal.employeeSignalScore,
      responseRate: Math.round(latestSignal.responseRate * 100)
    };
  }

  const activity: TeamIntelligence["activity"] = [];
  for (const survey of surveys.slice(0, 5)) {
    activity.push({
      kind: "survey",
      label:
        survey.status === "active"
          ? "익명 설문이 진행 중입니다"
          : survey.status === "closed"
            ? "설문이 종료되었습니다"
            : "설문 초안이 저장되었습니다",
      detail: survey.title,
      at: survey.updatedAt
    });
  }
  for (const decision of decisions.filter((entry) => entry.recommendation).slice(0, 3)) {
    activity.push({
      kind: "analysis",
      label: "AI 분석이 완료되었습니다",
      detail: decision.title,
      at: decision.updatedAt
    });
  }
  for (const meeting of meetings.slice(0, 3)) {
    activity.push({
      kind: "meeting",
      label: meeting.summary ? "회의 요약이 생성되었습니다" : "회의가 기록되었습니다",
      detail: meeting.title,
      at: meeting.updatedAt
    });
  }
  activity.sort((a, b) => b.at.localeCompare(a.at));

  return {
    kpis: {
      memberCount: members.length,
      activeRate: avgResponseRate,
      activeSurveys: activeSurveys.length,
      avgResponseRate,
      aiReflectionRate
    },
    pulse,
    consensusAvg,
    topConcern,
    topOpportunity,
    conflict,
    pendingReflections,
    participationTrend,
    surveyParticipation,
    insightChips,
    report: latestReport,
    activity: activity.slice(0, 8)
  };
}

// 회의 요약(결정론) — AI 없이도 항상 완성된다.
export function summarizeMeetingNotes(notes: string): {
  summary: string;
  actionItems: string[];
  conclusion: string;
} {
  const lines = notes
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const sentences = notes
    .split(/(?<=[.!?다요])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 3);
  const actionItems = lines
    .filter((line) => /^[-*•]|하기로|해야|담당|까지|TODO|액션/iu.test(line))
    .map((line) => line.replace(/^[-*•]\s*/u, ""))
    .slice(0, 8);
  return {
    summary: sentences.slice(0, 3).join(" ") || notes.slice(0, 200),
    actionItems,
    conclusion: sentences[sentences.length - 1] || "결론이 기록되지 않았습니다."
  };
}
