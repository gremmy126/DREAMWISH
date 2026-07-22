import { chatWithAI } from "../ai/ai.service";
import type { AIMessage } from "../ai/ai-provider";
import { stripMarkdownEmphasis } from "../deep-research/research-report";
import type { DecisionEmployeeSignal } from "../surveys/survey.types";
import { clampText } from "./decision-conclusion";
import type { Decision } from "./decision.types";

// Follow-up discussion for a decision that has already been analysed. The old
// UI told users to "continue in 자유 대화" after one pass; instead we keep
// analysing here, grounded in the same problem, research, simulation, signal
// and conclusion so answers stay consistent with the report on the right.

export type DecisionDiscussionMessage = { role: "ai" | "user"; text: string };

const DISCUSSION_SYSTEM_PROMPT =
  "당신은 이 결정 분석을 함께 수행한 AI 전략 파트너다. 아래 [분석 맥락]에 담긴 문제 정의, 딥리서치 요약, " +
  "시뮬레이션 순위·민감도, 조직 신호, 최종 결론과 반대 의견만을 근거로 사용자의 후속 질문에 계속 답한다.\n" +
  "규칙:\n" +
  "- 이미 분석한 내용을 근거로 구체적으로 답한다. 절대 '자유 대화에서 이어가라'거나 '새 대화를 시작하라'고 넘기지 않는다.\n" +
  "- 질문이 결론의 재검토를 요구하면, 어떤 근거·지표가 바뀌면 결론이 뒤집히는지 조건을 들어 다시 따져 본다.\n" +
  "- 맥락에 없는 사실은 지어내지 말고, 근거가 부족하면 무엇을 더 조사하거나 어떤 시뮬레이션 가정을 바꿔 보면 되는지 제안한다.\n" +
  "- 표면적 요약에 그치지 말고 2차 효과, 회복 가능성, 기회비용, 최악 시나리오까지 한 단계 더 파고들어 생각한다.\n" +
  "- 마크다운 강조 기호(**, ##, 목록 기호) 없이 자연스러운 한국어 평문으로, 핵심 → 근거 → 다음 행동 순서로 간결하게 답한다.";

export function buildDecisionContextSummary(
  decision: Decision,
  signal: DecisionEmployeeSignal | null
): string {
  const lines: string[] = [];
  lines.push(`문제: ${decision.problem?.statement || decision.title}`);
  if (decision.objective) lines.push(`목표: ${decision.objective}`);
  if (decision.problem?.budget) lines.push(`예산: ${decision.problem.budget}`);
  if (decision.problem?.deadline) lines.push(`기한: ${decision.problem.deadline}`);
  if (decision.problem?.constraints?.length) {
    lines.push(`제약: ${decision.problem.constraints.join(", ")}`);
  }
  if (decision.problem?.successCriteria?.length) {
    lines.push(`성공 기준: ${decision.problem.successCriteria.join(", ")}`);
  }
  lines.push(
    `위험 허용도: ${
      decision.problem?.riskTolerance === "low"
        ? "낮음"
        : decision.problem?.riskTolerance === "high"
          ? "높음"
          : "중간"
    }`
  );

  if (decision.research?.summary) {
    lines.push(`딥리서치 요약: ${clampText(stripMarkdownEmphasis(decision.research.summary), 900)}`);
    if (decision.research.sourceCount) {
      lines.push(`딥리서치 출처: ${decision.research.sourceCount}건 교차 확인`);
    }
  }

  const simulation = decision.simulationResult;
  if (simulation?.ranking?.length) {
    lines.push(
      `시뮬레이션 순위: ${simulation.ranking
        .map((entry, index) => `${index + 1}위 ${entry.title}(${entry.total}점)`)
        .join(", ")} · 1·2위 격차 ${simulation.gap}점`
    );
    if (simulation.sensitivityNote) lines.push(`민감도: ${simulation.sensitivityNote}`);
    if (simulation.scenarios?.length) {
      lines.push(
        `시나리오: ${simulation.scenarios
          .map((scenario) => `${scenario.label} ${scenario.probability}%`)
          .join(", ")}`
      );
    }
  }

  if (signal) {
    lines.push(
      `조직 신호: Employee Signal ${signal.employeeSignalScore ?? "—"}점, 응답률 ${Math.round(
        signal.responseRate * 100
      )}%, 신뢰 ${signal.confidenceLevel}`
    );
    if (signal.topConcerns?.length) lines.push(`주요 우려: ${signal.topConcerns.join(", ")}`);
    if (signal.minorityViews?.length) lines.push(`소수 의견: ${signal.minorityViews.join(" / ")}`);
  }

  const recommendation = decision.recommendation;
  if (recommendation) {
    lines.push(`최종 결론: ${stripMarkdownEmphasis(recommendation.summary)}`);
    if (recommendation.rationale) {
      lines.push(`결론 근거: ${clampText(stripMarkdownEmphasis(recommendation.rationale), 900)}`);
    }
    if (recommendation.switchCondition) {
      lines.push(`결론이 바뀌는 조건: ${recommendation.switchCondition}`);
    }
    if (recommendation.counterpoints?.length) {
      lines.push(`반대 의견: ${recommendation.counterpoints.join(" / ")}`);
    }
  }

  return lines.join("\n");
}

export function buildDecisionDiscussionMessages(
  decision: Decision,
  signal: DecisionEmployeeSignal | null,
  question: string,
  history: DecisionDiscussionMessage[]
): AIMessage[] {
  const recent = history
    .filter((message) => message.text.trim())
    .slice(-8)
    .map<AIMessage>((message) => ({
      role: message.role === "ai" ? "assistant" : "user",
      content: message.text.slice(0, 1_500)
    }));
  return [
    {
      role: "system",
      content: `${DISCUSSION_SYSTEM_PROMPT}\n\n[분석 맥락]\n${buildDecisionContextSummary(decision, signal)}`
    },
    ...recent,
    { role: "user", content: question.slice(0, 2_000) }
  ];
}

/** Deterministic answer used when the AI provider is unavailable — still grounded, never a hand-off. */
export function buildDeterministicDiscussionAnswer(decision: Decision): string {
  const recommendation = decision.recommendation;
  if (!recommendation) {
    return "아직 최종 결론이 준비되지 않았습니다. 딥리서치와 시뮬레이션을 먼저 실행하면 그 결과를 근거로 이어서 답해 드릴게요.";
  }
  const parts = [
    `현재 결론은 "${stripMarkdownEmphasis(recommendation.summary)}"입니다.`,
    recommendation.switchCondition
      ? `이 결론은 "${recommendation.switchCondition}"는 조건에서 다시 검토해야 합니다.`
      : "",
    "질문하신 내용을 더 정확히 따져 보려면, 어떤 지표나 가정을 바꿔서 볼지 알려 주시면 그 관점으로 다시 분석해 드리겠습니다."
  ];
  return parts.filter(Boolean).join(" ");
}

export async function discussDecision(
  decision: Decision,
  signal: DecisionEmployeeSignal | null,
  question: string,
  history: DecisionDiscussionMessage[]
): Promise<string> {
  const trimmed = question.trim();
  if (!trimmed) return "무엇이 궁금한지 한 줄로 적어 주시면 이어서 분석해 드리겠습니다.";
  try {
    const answer = await chatWithAI(
      buildDecisionDiscussionMessages(decision, signal, trimmed, history),
      undefined,
      { timeoutMs: 60_000, maxTokens: 1_400, temperature: 0.5 }
    );
    const clean = stripMarkdownEmphasis(answer).trim();
    return clean || buildDeterministicDiscussionAnswer(decision);
  } catch {
    return buildDeterministicDiscussionAnswer(decision);
  }
}
