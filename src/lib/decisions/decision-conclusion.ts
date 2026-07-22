import { chatWithAI } from "../ai/ai.service";
import { stripMarkdownEmphasis } from "../deep-research/research-report";
import type { DecisionEmployeeSignal } from "../surveys/survey.types";
import type { Decision, DecisionRecommendation } from "./decision.types";

// Final-conclusion assembly for the AI Chat report panel.
//
// 결론은 계산기가 아니라 사람의 조언처럼 읽혀야 한다: 명확한 권고 + 사람이
// 실제로 고민하는 이유(후회·회복 가능성·감당 범위) + 결론이 바뀌는 조건 +
// 오늘의 첫 행동. 반대 의견은 "주장 → 예상 결과"로 답하고 숨기지 않는다.
// AI 공급자가 실패해도 deterministic fallback이 완전한 결론을 만들어
// 결정 흐름이 멈추지 않는다.

export type DecisionConclusion = {
  coreConclusion: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
  counterpoints: Array<{ view: string; expectedOutcome: string }>;
  /** 이 조건이 깨지면 결론을 다시 검토해야 한다. */
  switchCondition: string;
  /** 결정 직후 오늘 실행할 수 있는 가장 작은 행동. */
  firstAction: string;
  source: "ai" | "deterministic";
};

const CONCLUSION_SYSTEM_PROMPT =
  "당신은 오랜 경험을 가진 의사결정 조언자다. 입력(문제, 시뮬레이션 순위, 익명 조직 신호, 리서치 요약)만 근거로 " +
  '반드시 JSON만 출력한다: {"coreConclusion":string,"rationale":string,"confidence":"low|medium|high",' +
  '"counterpoints":[{"view":string,"expectedOutcome":string}],"switchCondition":string,"firstAction":string}\n' +
  "말하기 규칙 (사람다운 조언):\n" +
  "- coreConclusion: 2~3문장. 어느 안을 권하는지 숨기지 말고 먼저 말하되, '영구 선택'이 아니라 " +
  "'기간·조건을 둔 검증'의 형태로 권고한다 (예: 앞으로 8주 동안 조건부로 A안을 검증하는 것을 권합니다).\n" +
  "- rationale: 점수 나열이 아니라 이유를 설명한다. 이 선택이 사용자가 바라는 방향에 왜 더 가까운지, " +
  "다른 안을 골랐을 때 남을 후회, 실패했을 때 되돌릴 수 있는지(회복 가능성), 결정하지 않을 때의 비용을 " +
  "자연스러운 문단으로 쓴다. 점수는 근거를 뒷받침할 때만 짧게 언급한다.\n" +
  "- switchCondition: 결론이 뒤집히는 구체적 조건 한 문장 (예: 3개월 안에 유료 전환이 확인되지 않으면 결론을 바꿔야 합니다).\n" +
  "- firstAction: 오늘 바로 할 수 있는 가장 작은 첫 행동 한 문장.\n" +
  "금지: 마크다운 기호(**, ##, 목록 기호), 퍼센트 확신(87% 등), '종합적으로 고려하면', '각각 장단점이 있습니다', " +
  "'상황에 따라 다릅니다', '최종 결정은 본인의 몫입니다' 같은 회피 표현, 입력에 없는 사실 생성, " +
  "작성자 신원·부서 추측, 소수 의견 삭제. 사용자의 마음을 단정하지 말고 가능성으로만 표현한다 " +
  "(예: ~라는 마음도 섞여 있을 수 있습니다). 반대 의견에는 예상 결과를 반드시 붙인다.";

export function buildDeterministicConclusion(
  decision: Decision,
  signal: DecisionEmployeeSignal | null
): DecisionConclusion {
  const ranking = decision.simulationResult?.ranking || [];
  const top = ranking[0];
  const runnerUp = ranking[1];
  const gap = decision.simulationResult?.gap ?? 0;

  const confidence: DecisionConclusion["confidence"] =
    top && gap >= 10 && (signal ? signal.confidenceLevel !== "low" : true)
      ? "high"
      : top && gap >= 5
        ? "medium"
        : "low";

  const signalNote = signal?.employeeSignalScore != null
    ? ` 조직 Employee Signal은 ${signal.employeeSignalScore}점(응답률 ${Math.round(signal.responseRate * 100)}%)입니다.`
    : "";

  const coreConclusion = top
    ? `지금 상황이라면 ${top.title} 쪽이 더 맞다고 판단됩니다. 다만 영구적인 선택이 아니라, 기간을 정해 두고 검증하면서 진행하는 것을 권합니다.`
    : `아직 결론을 내리기에는 근거가 부족합니다. 딥리서치와 시뮬레이션을 먼저 실행한 뒤 다시 판단하는 것을 권합니다.`;

  const counterpoints: DecisionConclusion["counterpoints"] = [];
  if (runnerUp) {
    counterpoints.push({
      view: `${runnerUp.title}이(가) 낫다는 의견`,
      expectedOutcome: `가중 평가에서 ${gap}점 차이로 뒤졌지만, 핵심 기준의 중요도가 크게 바뀌면 다시 평가해야 합니다.`
    });
  }
  if (signal?.topConcerns?.length) {
    counterpoints.push({
      view: `조직 우려: ${signal.topConcerns.slice(0, 2).join(", ")}`,
      expectedOutcome: "실행계획에 대응 항목을 포함하지 않으면 실행 단계가 지연될 위험이 있습니다."
    });
  }
  if (!counterpoints.length) {
    counterpoints.push({
      view: "추진 자체를 보류하자는 의견",
      expectedOutcome: "결정을 미루는 동안 기회비용이 쌓입니다. 재검토 날짜를 정해 두면 위험을 통제할 수 있습니다."
    });
  }

  return {
    coreConclusion,
    rationale:
      `${decision.problem.statement || decision.title}에 대해 ` +
      `${ranking.length}개 대안을 ${decision.criteria.length || 4}개 기준으로 비교했습니다.` +
      `${top ? ` ${top.title}이(가) 앞선 이유는 점수 자체보다, 실패했을 때 되돌릴 여지가 있으면서 원하는 방향에 더 가깝기 때문입니다.` : ""}` +
      `${decision.research?.summary ? ` 리서치 요약: ${stripMarkdownEmphasis(decision.research.summary).slice(0, 300)}` : ""}` +
      signalNote,
    confidence,
    counterpoints,
    switchCondition: top
      ? "정해 둔 검증 기간 안에 핵심 지표가 개선되지 않으면 결론을 다시 검토해야 합니다."
      : "딥리서치와 시뮬레이션 결과가 준비되면 결론을 다시 검토해야 합니다.",
    firstAction: top
      ? `${top.title}의 첫 단계를 오늘 실행 계획에 한 줄로 적고, 검증 기간과 판단 기준을 정해 보세요.`
      : "딥리서치를 실행해 근거부터 모아 보세요.",
    source: "deterministic"
  };
}

export async function concludeDecision(
  decision: Decision,
  signal: DecisionEmployeeSignal | null
): Promise<DecisionConclusion> {
  const fallback = buildDeterministicConclusion(decision, signal);
  try {
    const response = await chatWithAI(
      [
        { role: "system", content: CONCLUSION_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            title: decision.title,
            problem: decision.problem,
            simulation: decision.simulationResult,
            researchSummary: decision.research?.summary || null,
            employeeSignal: signal
              ? {
                  employeeSignalScore: signal.employeeSignalScore,
                  supportScore: signal.supportScore,
                  feasibilityScore: signal.feasibilityScore,
                  riskScore: signal.riskScore,
                  responseRate: signal.responseRate,
                  confidenceLevel: signal.confidenceLevel,
                  topConcerns: signal.topConcerns,
                  minorityViews: signal.minorityViews
                }
              : null,
            employeeSignalWeight: decision.employeeSignalWeight
          })
        }
      ],
      undefined,
      // 결론이 중간에 잘리지 않도록 출력 여유와 시간을 넉넉히 준다.
      { timeoutMs: 90_000, maxTokens: 2_500, temperature: 0.5 }
    );
    const start = response.search(/\{/u);
    if (start < 0) return fallback;
    const parsed = JSON.parse(
      response.slice(start).replace(/```/gu, "")
    ) as Partial<DecisionConclusion>;
    if (!parsed.coreConclusion || typeof parsed.coreConclusion !== "string") return fallback;
    return {
      coreConclusion: stripMarkdownEmphasis(
        limitSentences(parsed.coreConclusion, 3)
      ).slice(0, 700),
      rationale:
        typeof parsed.rationale === "string"
          ? stripMarkdownEmphasis(parsed.rationale).slice(0, 2400)
          : fallback.rationale,
      confidence:
        parsed.confidence === "low" || parsed.confidence === "medium" || parsed.confidence === "high"
          ? parsed.confidence
          : fallback.confidence,
      counterpoints: Array.isArray(parsed.counterpoints) && parsed.counterpoints.length
        ? parsed.counterpoints
            .filter(
              (item): item is { view: string; expectedOutcome: string } =>
                Boolean(item) && typeof item.view === "string" && typeof item.expectedOutcome === "string"
            )
            .map((item) => ({
              view: stripMarkdownEmphasis(item.view),
              expectedOutcome: stripMarkdownEmphasis(item.expectedOutcome)
            }))
            .slice(0, 5)
        : fallback.counterpoints,
      switchCondition:
        typeof parsed.switchCondition === "string" && parsed.switchCondition.trim()
          ? stripMarkdownEmphasis(parsed.switchCondition).slice(0, 300)
          : fallback.switchCondition,
      firstAction:
        typeof parsed.firstAction === "string" && parsed.firstAction.trim()
          ? stripMarkdownEmphasis(parsed.firstAction).slice(0, 300)
          : fallback.firstAction,
      source: "ai"
    };
  } catch {
    return fallback;
  }
}

export function conclusionToRecommendation(
  conclusion: DecisionConclusion
): DecisionRecommendation {
  return {
    summary: conclusion.coreConclusion,
    rationale: conclusion.rationale,
    confidence: conclusion.confidence,
    assumptions: [],
    counterpoints: conclusion.counterpoints.map(
      (item) => `${item.view} → ${item.expectedOutcome}`
    ),
    switchCondition: conclusion.switchCondition,
    firstAction: conclusion.firstAction,
    updatedAt: new Date().toISOString()
  };
}

function limitSentences(text: string, count: number): string {
  const sentences = text
    .split(/(?<=[.!?다요])\s+/u)
    .filter(Boolean)
    .slice(0, count);
  return sentences.join(" ").trim() || text.trim();
}
