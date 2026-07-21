import type { DecisionEmployeeSignal } from "../surveys/survey.types";
import type {
  Decision,
  DecisionAlternative,
  DecisionSimulationResult
} from "./decision.types";

// Deterministic decision simulation (documented; unit-tested in
// tests/decision-flow.test.ts). No AI call is required, so the pipeline keeps
// working when providers are unavailable.
//
// 1) Alternatives: if the decision has none, three canonical alternatives are
//    generated — 전면 추진 / 단계적·제한 추진 / 보류 — with criterion scores
//    derived from the decision's risk tolerance and, when present, the
//    anonymous employee signal (support/feasibility/risk).
// 2) Weighted totals: per alternative, score = Σ(adjusted criterion score ×
//    criterion weight) / Σ(weight), where negative-direction criteria are
//    inverted (100 - score).
// 3) Scenarios: 낙관/기준/보수 probabilities start at 30/50/20 and shift up to
//    ±10 points with the employee signal score ((signal - 50) / 5 points moved
//    between 낙관 and 보수, clamped).

export function buildDefaultAlternatives(
  decision: Decision,
  signal: DecisionEmployeeSignal | null
): DecisionAlternative[] {
  const support = signal?.supportScore ?? 55;
  const feasibility = signal?.feasibilityScore ?? 55;
  const risk = signal?.riskScore ?? 50;
  const riskAppetite =
    decision.problem.riskTolerance === "high"
      ? 15
      : decision.problem.riskTolerance === "low"
        ? -15
        : 0;

  const clamp = (value: number) => Math.max(5, Math.min(95, Math.round(value)));

  return [
    {
      id: "alt-full",
      title: "전면 추진",
      summary: "목표를 즉시 전체 범위로 실행합니다.",
      scores: {
        support: clamp(support + riskAppetite),
        impact: clamp(75 + riskAppetite / 2),
        feasibility: clamp(feasibility - 10 + riskAppetite),
        risk: clamp(risk + 20 - riskAppetite)
      }
    },
    {
      id: "alt-staged",
      title: "단계적·제한 추진",
      summary: "범위를 제한해 검증한 뒤 확대합니다.",
      scores: {
        support: clamp(support + 5),
        impact: clamp(62),
        feasibility: clamp(feasibility + 10),
        risk: clamp(risk - 10)
      }
    },
    {
      id: "alt-hold",
      title: "보류·추가 검토",
      summary: "결정을 미루고 데이터를 더 수집합니다.",
      scores: {
        support: clamp(100 - support),
        impact: clamp(30),
        feasibility: clamp(85),
        risk: clamp(risk - 25)
      }
    }
  ];
}

export function computeAlternativeTotals(
  decision: Decision,
  alternatives: DecisionAlternative[]
): Array<{ id: string; title: string; total: number }> {
  const criteria = decision.criteria.length
    ? decision.criteria
    : [
        { id: "support", label: "지지도", weight: 0.3, direction: "positive" as const },
        { id: "impact", label: "기대 효과", weight: 0.3, direction: "positive" as const },
        { id: "feasibility", label: "실행 가능성", weight: 0.25, direction: "positive" as const },
        { id: "risk", label: "위험", weight: 0.15, direction: "negative" as const }
      ];
  const totalWeight = criteria.reduce((sum, criterion) => sum + criterion.weight, 0) || 1;

  return alternatives
    .map((alternative) => {
      let total = 0;
      for (const criterion of criteria) {
        const raw = alternative.scores[criterion.id] ?? 50;
        const adjusted = criterion.direction === "negative" ? 100 - raw : raw;
        total += adjusted * criterion.weight;
      }
      return {
        id: alternative.id,
        title: alternative.title,
        total: Math.round((total / totalWeight) * 10) / 10
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function simulateDecision(
  decision: Decision,
  signal: DecisionEmployeeSignal | null
): { alternatives: DecisionAlternative[]; result: DecisionSimulationResult } {
  const alternatives = decision.alternatives.length
    ? decision.alternatives
    : buildDefaultAlternatives(decision, signal);
  const ranking = computeAlternativeTotals(decision, alternatives);
  const gap =
    ranking.length >= 2
      ? Math.round((ranking[0].total - ranking[1].total) * 10) / 10
      : ranking.length === 1
        ? ranking[0].total
        : 0;

  const signalShift = signal?.employeeSignalScore != null
    ? Math.max(-10, Math.min(10, Math.round((signal.employeeSignalScore - 50) / 5)))
    : 0;
  const optimistic = 30 + signalShift;
  const pessimistic = 20 - signalShift;
  const base = 100 - optimistic - pessimistic;

  const top = ranking[0];
  const result: DecisionSimulationResult = {
    scenarios: [
      {
        kind: "base",
        label: "기준 시나리오",
        probability: base,
        expectedOutcome: top
          ? `${top.title} 기준 가중 점수 ${top.total}점으로 계획 범위 내 성과`
          : "계획 범위 내 성과"
      },
      {
        kind: "optimistic",
        label: "낙관 시나리오",
        probability: optimistic,
        expectedOutcome: "핵심 가정이 유리하게 실현되어 목표 초과 달성"
      },
      {
        kind: "pessimistic",
        label: "보수 시나리오",
        probability: pessimistic,
        expectedOutcome: "위험 요인이 현실화되어 축소·중단 조건 검토 필요"
      }
    ],
    ranking,
    gap,
    sensitivityNote:
      gap < 10
        ? "1·2위 격차가 10점 미만입니다. 기준 가중치 변화에 민감하므로 가정을 재검토하세요."
        : "1위 대안이 가중치 변화에 비교적 안정적입니다.",
    computedAt: new Date().toISOString()
  };

  return { alternatives, result };
}
