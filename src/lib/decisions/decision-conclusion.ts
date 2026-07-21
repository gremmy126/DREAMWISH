import { chatWithAI } from "../ai/ai.service";
import type { DecisionEmployeeSignal } from "../surveys/survey.types";
import type { Decision, DecisionRecommendation } from "./decision.types";

// Final-conclusion assembly for the AI Chat report panel.
//
// The core conclusion is always 1–2 sentences. Counterpoints are kept as
// "주장 → 예상 결과" pairs so dissent is answered, never hidden. When the AI
// provider fails the deterministic fallback still produces a complete
// conclusion from the simulation ranking and the anonymous employee signal —
// an AI outage never blocks the decision flow.

export type DecisionConclusion = {
  coreConclusion: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
  counterpoints: Array<{ view: string; expectedOutcome: string }>;
  source: "ai" | "deterministic";
};

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
    ? `${top.title}을(를) 권고합니다. 가중 평가 ${top.total}점으로 1위이며${gap ? ` 2위와의 격차는 ${gap}점` : ""}입니다.`
    : `아직 근거가 부족합니다. 딥리서치와 시뮬레이션을 실행한 뒤 결론을 내리는 것을 권고합니다.`;

  const counterpoints: DecisionConclusion["counterpoints"] = [];
  if (runnerUp) {
    counterpoints.push({
      view: `${runnerUp.title}이(가) 낫다는 의견`,
      expectedOutcome: `가중 평가 ${runnerUp.total}점으로 ${gap}점 열세입니다. 핵심 기준 가중치가 크게 바뀌면 재평가가 필요합니다.`
    });
  }
  if (signal?.topConcerns?.length) {
    counterpoints.push({
      view: `조직 우려: ${signal.topConcerns.slice(0, 2).join(", ")}`,
      expectedOutcome: "실행계획에 대응 항목을 포함하지 않으면 실행 단계 지연 위험이 있습니다."
    });
  }
  if (!counterpoints.length) {
    counterpoints.push({
      view: "추진 자체를 보류하자는 의견",
      expectedOutcome: "기회비용이 발생하며, 재검토 일정을 명시하면 위험을 통제할 수 있습니다."
    });
  }

  return {
    coreConclusion,
    rationale:
      `${decision.problem.statement || decision.title}에 대해 ` +
      `${ranking.length}개 대안을 ${decision.criteria.length || 4}개 기준으로 가중 평가했습니다.` +
      `${decision.research?.summary ? ` 딥리서치 요약: ${decision.research.summary.slice(0, 300)}` : ""}` +
      signalNote,
    confidence,
    counterpoints,
    source: "deterministic"
  };
}

export async function concludeDecision(
  decision: Decision,
  signal: DecisionEmployeeSignal | null
): Promise<DecisionConclusion> {
  const fallback = buildDeterministicConclusion(decision, signal);
  try {
    const response = await chatWithAI([
      {
        role: "system",
        content:
          "당신은 의사결정 분석가다. 입력(문제, 시뮬레이션 순위, 익명 조직 신호, 리서치 요약)만 근거로 " +
          '반드시 JSON만 출력한다: {"coreConclusion":string(한두 문장),"rationale":string,' +
          '"confidence":"low|medium|high","counterpoints":[{"view":string,"expectedOutcome":string}]} ' +
          "규칙: 작성자 신원·부서 추측 금지, 소수 의견 삭제 금지, 입력에 없는 사실 생성 금지, " +
          "반대 의견에는 예상 결과를 반드시 붙인다."
      },
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
    ]);
    const start = response.search(/\{/u);
    if (start < 0) return fallback;
    const parsed = JSON.parse(
      response.slice(start).replace(/```/gu, "")
    ) as Partial<DecisionConclusion>;
    if (!parsed.coreConclusion || typeof parsed.coreConclusion !== "string") return fallback;
    return {
      coreConclusion: limitSentences(parsed.coreConclusion, 2).slice(0, 400),
      rationale: typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 2000) : fallback.rationale,
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
            .slice(0, 5)
        : fallback.counterpoints,
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
