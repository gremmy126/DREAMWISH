import assert from "node:assert/strict";
import {
  buildDefaultAlternatives,
  computeAlternativeTotals,
  simulateDecision
} from "../src/lib/decisions/decision-simulation";
import { buildDeterministicConclusion } from "../src/lib/decisions/decision-conclusion";
import type { Decision } from "../src/lib/decisions/decision.types";
import type { DecisionEmployeeSignal } from "../src/lib/surveys/survey.types";

function buildDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: "decision-1",
    title: "신제품 A 국내 출시 여부",
    objective: "3분기 내 출시 여부 결정",
    status: "analyzing",
    problem: {
      statement: "신제품 A를 출시할지 결정",
      goals: [],
      constraints: ["예산 5,000만 원"],
      budget: "5,000만 원",
      deadline: "3분기",
      riskTolerance: "medium",
      successCriteria: ["12개월 손익분기"],
      reversible: true
    },
    criteria: [
      { id: "support", label: "지지도", weight: 0.3, direction: "positive" },
      { id: "impact", label: "기대 효과", weight: 0.3, direction: "positive" },
      { id: "feasibility", label: "실행 가능성", weight: 0.25, direction: "positive" },
      { id: "risk", label: "위험", weight: 0.15, direction: "negative" }
    ],
    alternatives: [],
    scenarios: [],
    recommendation: null,
    finalDecision: null,
    executionPlan: [],
    retrospective: null,
    research: null,
    simulationResult: null,
    conversation: [],
    employeeSignalWeight: 0.15,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

function buildSignal(overrides: Partial<DecisionEmployeeSignal> = {}): DecisionEmployeeSignal {
  return {
    id: "signal-1",
    decisionId: "decision-1",
    surveyId: "survey-1",
    eligibleCount: 10,
    responseCount: 8,
    responseRate: 0.8,
    supportScore: 70,
    impactScore: 65,
    feasibilityScore: 60,
    riskScore: 45,
    consensusScore: 72,
    employeeSignalScore: 65,
    confidenceLevel: "high",
    topSupportReasons: [],
    topConcerns: ["인력 부족"],
    minorityViews: [],
    generatedSummary: null,
    calculatedAt: new Date().toISOString(),
    ...overrides
  };
}

test("simulation generates three canonical alternatives when none exist", () => {
  const decision = buildDecision();
  const alternatives = buildDefaultAlternatives(decision, null);
  assert.equal(alternatives.length, 3);
  assert.deepEqual(
    alternatives.map((alternative) => alternative.title),
    ["전면 추진", "단계적·제한 추진", "보류·추가 검토"]
  );
  for (const alternative of alternatives) {
    for (const value of Object.values(alternative.scores)) {
      assert.ok(value >= 5 && value <= 95);
    }
  }
});

test("weighted totals invert negative criteria and rank deterministically", () => {
  const decision = buildDecision();
  const totals = computeAlternativeTotals(decision, [
    { id: "a", title: "안전", summary: "", scores: { support: 80, impact: 60, feasibility: 80, risk: 20 } },
    { id: "b", title: "공격", summary: "", scores: { support: 80, impact: 60, feasibility: 80, risk: 90 } }
  ]);
  // Identical except risk: lower risk must win because risk is negative-direction.
  assert.equal(totals[0].id, "a");
  assert.ok(totals[0].total > totals[1].total);
});

test("scenario probabilities always sum to 100 and shift with the employee signal", () => {
  const decision = buildDecision();
  const neutral = simulateDecision(decision, null).result;
  assert.equal(
    neutral.scenarios.reduce((sum, scenario) => sum + scenario.probability, 0),
    100
  );

  const positive = simulateDecision(decision, buildSignal({ employeeSignalScore: 90 })).result;
  const negative = simulateDecision(decision, buildSignal({ employeeSignalScore: 10 })).result;
  const optimisticOf = (result: typeof neutral) =>
    result.scenarios.find((scenario) => scenario.kind === "optimistic")?.probability || 0;
  assert.ok(optimisticOf(positive) > optimisticOf(neutral));
  assert.ok(optimisticOf(negative) < optimisticOf(neutral));
  assert.equal(
    positive.scenarios.reduce((sum, scenario) => sum + scenario.probability, 0),
    100
  );
});

test("the deterministic conclusion completes without AI and answers counterpoints", () => {
  const decision = buildDecision();
  const { alternatives, result } = simulateDecision(decision, buildSignal());
  const withSimulation = buildDecision({ alternatives, simulationResult: result });

  const conclusion = buildDeterministicConclusion(withSimulation, buildSignal());
  assert.equal(conclusion.source, "deterministic");
  assert.ok(conclusion.coreConclusion.length > 0);
  // Core conclusion stays within 1-2 sentences.
  const sentences = conclusion.coreConclusion.split(/(?<=다\.)\s+/u).filter(Boolean);
  assert.ok(sentences.length <= 2, conclusion.coreConclusion);
  assert.ok(conclusion.counterpoints.length >= 1);
  for (const counterpoint of conclusion.counterpoints) {
    assert.ok(counterpoint.view.length > 0);
    assert.ok(counterpoint.expectedOutcome.length > 0);
  }
});

test("a conclusion without simulation asks for more evidence instead of guessing", () => {
  const conclusion = buildDeterministicConclusion(buildDecision(), null);
  assert.match(conclusion.coreConclusion, /근거가 부족/u);
  assert.equal(conclusion.confidence, "low");
});
