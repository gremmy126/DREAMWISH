import type { DecisionEmployeeSignal } from "../surveys/survey.types";
import type { Decision } from "./decision.types";

// Decision Brief assembly. The employee-signal section is advisory: the final
// recommendation is never auto-decided from survey scores alone, and the
// signal weight is capped by clampEmployeeSignalWeight (default 0.15, max
// 0.30). Conflicts between external analysis and employee opinion are
// surfaced, never hidden.

export type EmployeeVoiceSection = {
  surveyId: string;
  eligibleCount: number;
  responseCount: number;
  responseRate: number;
  employeeSignalScore: number | null;
  supportScore: number | null;
  impactScore: number | null;
  feasibilityScore: number | null;
  riskScore: number | null;
  consensusScore: number | null;
  confidenceLevel: "low" | "medium" | "high";
  topSupportReasons: string[];
  topConcerns: string[];
  minorityViews: string[];
  executionBlockers: string[];
  aiInterpretation: string | null;
  conflictWithRecommendation: string | null;
};

export type DecisionBrief = {
  decisionId: string;
  title: string;
  problemStatement: string;
  objective: string;
  recommendation: Decision["recommendation"];
  alternatives: Array<{ id: string; title: string; summary: string }>;
  keyAssumptions: string[];
  counterpoints: string[];
  scenarios: Decision["scenarios"];
  employeeSignalWeight: number;
  employeeVoice: EmployeeVoiceSection | null;
  finalDecision: Decision["finalDecision"];
  executionPlan: Decision["executionPlan"];
  generatedAt: string;
};

export function detectSignalConflict(
  decision: Decision,
  signal: DecisionEmployeeSignal
): string | null {
  if (!decision.recommendation) return null;
  const support = signal.supportScore;
  const confidence = decision.recommendation.confidence;
  if (support !== null && support < 40 && confidence !== "low") {
    return (
      `외부 분석 권고(신뢰수준: ${confidence})와 조직 의견이 충돌합니다. ` +
      `직원 지지 점수가 ${support}점으로 낮아 실행 리스크를 재검토해야 합니다.`
    );
  }
  if (
    signal.employeeSignalScore !== null &&
    signal.employeeSignalScore < 35 &&
    confidence === "high"
  ) {
    return (
      "외부 근거 신뢰수준은 높지만 Employee Signal이 " +
      `${signal.employeeSignalScore}점으로 낮습니다. 충돌 원인을 확인하세요.`
    );
  }
  return null;
}

export function buildEmployeeVoiceSection(
  decision: Decision,
  signal: DecisionEmployeeSignal | null,
  executionBlockers: string[] = []
): EmployeeVoiceSection | null {
  if (!signal) return null;
  return {
    surveyId: signal.surveyId,
    eligibleCount: signal.eligibleCount,
    responseCount: signal.responseCount,
    responseRate: signal.responseRate,
    employeeSignalScore: signal.employeeSignalScore,
    supportScore: signal.supportScore,
    impactScore: signal.impactScore,
    feasibilityScore: signal.feasibilityScore,
    riskScore: signal.riskScore,
    consensusScore: signal.consensusScore,
    confidenceLevel: signal.confidenceLevel,
    topSupportReasons: signal.topSupportReasons,
    topConcerns: signal.topConcerns,
    minorityViews: signal.minorityViews,
    executionBlockers,
    aiInterpretation: signal.generatedSummary,
    conflictWithRecommendation: detectSignalConflict(decision, signal)
  };
}

export function assembleDecisionBrief(
  decision: Decision,
  signal: DecisionEmployeeSignal | null,
  executionBlockers: string[] = []
): DecisionBrief {
  return {
    decisionId: decision.id,
    title: decision.title,
    problemStatement: decision.problem.statement,
    objective: decision.objective,
    recommendation: decision.recommendation,
    alternatives: decision.alternatives.map((alternative) => ({
      id: alternative.id,
      title: alternative.title,
      summary: alternative.summary
    })),
    keyAssumptions: decision.recommendation?.assumptions || [],
    counterpoints: decision.recommendation?.counterpoints || [],
    scenarios: decision.scenarios,
    employeeSignalWeight: decision.employeeSignalWeight,
    employeeVoice: buildEmployeeVoiceSection(decision, signal, executionBlockers),
    finalDecision: decision.finalDecision,
    executionPlan: decision.executionPlan,
    generatedAt: new Date().toISOString()
  };
}
