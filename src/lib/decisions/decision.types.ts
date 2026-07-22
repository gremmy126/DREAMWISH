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
  // 결정 분석 대화는 결정에 저장되고, 연결된 자유 채팅 세션에도 미러링되어
  // AI Chat 대화 목록에서 함께 볼 수 있다.
  conversation: DecisionChatMessage[];
  // 대화 목록(자유 채팅 세션 리스트)에 함께 표시되는 연결 세션.
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
