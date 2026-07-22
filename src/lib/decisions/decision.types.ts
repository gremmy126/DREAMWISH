export type DecisionStatus =
  | "draft"
  | "analyzing"
  | "deciding"
  | "approved"
  | "executing"
  | "reviewed";

export type DecisionCriterionId = "support" | "impact" | "feasibility" | "risk";

export type DecisionCriterion = {
  id: string;
  label: string;
  weight: number;
  direction: "positive" | "negative";
};

export type DecisionProblem = {
  statement: string;
  goals: string[];
  constraints: string[];
  budget: string;
  deadline: string;
  riskTolerance: "low" | "medium" | "high";
  successCriteria: string[];
  reversible: boolean;
};

export type DecisionAlternative = {
  id: string;
  title: string;
  summary: string;
  scores: Record<string, number>;
};

export type DecisionScenarioKind = "optimistic" | "base" | "pessimistic";

export type DecisionScenario = {
  kind: DecisionScenarioKind;
  summary: string;
  assumptions: string[];
  expectedOutcome: string;
};

export type DecisionRecommendation = {
  summary: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
  assumptions: string[];
  counterpoints: string[];
  /** 이 조건이 깨지면 결론도 바뀐다 — 조건부 권고의 핵심. */
  switchCondition?: string;
  /** 오늘 바로 실행할 수 있는 첫 행동. */
  firstAction?: string;
  updatedAt: string;
};

export type DecisionFinal = {
  choice: string;
  notes: string;
  decidedAt: string;
};

export type ExecutionPlanItem = {
  id: string;
  title: string;
  assignee: string;
  dueDate: string | null;
  status: "todo" | "in_progress" | "done";
};

export type DecisionRetrospective = {
  outcome: string;
  lessons: string[];
  reviewedAt: string;
};

export type DecisionChatMessage = {
  role: "ai" | "user";
  text: string;
  at: string;
};

export type DecisionResearchSource = {
  title: string;
  url: string;
  domain: string;
};

export type DecisionResearch = {
  jobId: string | null;
  status: "idle" | "running" | "completed" | "failed" | "skipped";
  summary: string;
  findings: string;
  sourceCount: number;
  // 출처 확인 UI에서 바로 열람할 수 있도록 제목/URL을 함께 보관한다.
  sources?: DecisionResearchSource[];
  updatedAt: string;
};

export type DecisionScenarioOutcome = {
  kind: DecisionScenarioKind;
  label: string;
  probability: number;
  expectedOutcome: string;
};

export type DecisionSimulationResult = {
  scenarios: DecisionScenarioOutcome[];
  ranking: Array<{ id: string; title: string; total: number }>;
  gap: number;
  sensitivityNote: string;
  computedAt: string;
};

export type Decision = {
  id: string;
  title: string;
  objective: string;
  status: DecisionStatus;
  problem: DecisionProblem;
  criteria: DecisionCriterion[];
  alternatives: DecisionAlternative[];
  scenarios: DecisionScenario[];
  recommendation: DecisionRecommendation | null;
  finalDecision: DecisionFinal | null;
  executionPlan: ExecutionPlanItem[];
  retrospective: DecisionRetrospective | null;
  research: DecisionResearch | null;
  simulationResult: DecisionSimulationResult | null;
  // 결정 분석 대화는 결정 기록에만 저장된다(자유 채팅과 분리).
  conversation: DecisionChatMessage[];
  // 과거 미러링 방식에서 연결했던 자유 채팅 세션 ID. 새 결정에는 더 이상
  // 세션을 만들거나 연결하지 않으며, 기존 데이터 호환을 위해서만 남긴다.
  chatSessionId?: string | null;
  // Share of the final recommendation attributable to the anonymous employee
  // survey signal. Default 0.15; the product never allows more than 0.30.
  employeeSignalWeight: number;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_EMPLOYEE_SIGNAL_WEIGHT = 0.15;
export const MAX_EMPLOYEE_SIGNAL_WEIGHT = 0.3;

export function clampEmployeeSignalWeight(value: unknown): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_EMPLOYEE_SIGNAL_WEIGHT;
  return Math.min(MAX_EMPLOYEE_SIGNAL_WEIGHT, Math.max(0, parsed));
}
