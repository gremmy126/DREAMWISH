import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assembleDecisionBrief,
  detectSignalConflict
} from "../src/lib/decisions/decision-brief";
import {
  createDecision,
  getDecision,
  listDecisions,
  updateDecision
} from "../src/lib/decisions/decision.repository";
import {
  DEFAULT_EMPLOYEE_SIGNAL_WEIGHT,
  MAX_EMPLOYEE_SIGNAL_WEIGHT,
  clampEmployeeSignalWeight,
  type Decision
} from "../src/lib/decisions/decision.types";
import type { DecisionEmployeeSignal } from "../src/lib/surveys/survey.types";

const OWNER = "owner-org-1";

function buildSignal(overrides: Partial<DecisionEmployeeSignal> = {}): DecisionEmployeeSignal {
  return {
    id: "signal-1",
    decisionId: "decision-1",
    surveyId: "survey-1",
    eligibleCount: 20,
    responseCount: 14,
    responseRate: 0.7,
    supportScore: 72,
    impactScore: 65,
    feasibilityScore: 58,
    riskScore: 40,
    consensusScore: 75,
    employeeSignalScore: 63,
    confidenceLevel: "high",
    topSupportReasons: ["시장 기회가 명확함"],
    topConcerns: ["인력 부족"],
    minorityViews: ["출시 연기가 낫다"],
    generatedSummary: "전반적으로 지지하지만 실행 여력을 우려함",
    calculatedAt: new Date().toISOString(),
    ...overrides
  };
}

async function withTempDataDir(run: () => Promise<void>) {
  const previous = process.env.DATA_DIR;
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dreamwish-decision-"));
  process.env.DATA_DIR = dataDir;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

test("employee signal weight defaults to 0.15 and is capped at 0.30", () => {
  assert.equal(DEFAULT_EMPLOYEE_SIGNAL_WEIGHT, 0.15);
  assert.equal(MAX_EMPLOYEE_SIGNAL_WEIGHT, 0.3);
  assert.equal(clampEmployeeSignalWeight(undefined), 0.15);
  assert.equal(clampEmployeeSignalWeight(0.2), 0.2);
  assert.equal(clampEmployeeSignalWeight(0.9), 0.3);
  assert.equal(clampEmployeeSignalWeight(-1), 0);
});

test("decision CRUD keeps the weight capped and supports the full lifecycle", async () => {
  await withTempDataDir(async () => {
    const decision = await createDecision(OWNER, { title: "신제품 출시" });
    assert.equal(decision.employeeSignalWeight, 0.15);

    const updated = await updateDecision(OWNER, decision.id, {
      employeeSignalWeight: 0.5,
      status: "deciding"
    });
    assert.equal(updated?.employeeSignalWeight, 0.3);
    assert.equal(updated?.status, "deciding");

    // Tenant isolation: another owner sees nothing.
    assert.equal(await getDecision("other-org", decision.id), null);
    assert.equal((await listDecisions("other-org")).length, 0);
  });
});

test("the decision brief includes the employee voice section", () => {
  const decision: Decision = {
    id: "decision-1",
    title: "신제품 출시",
    objective: "3분기 출시 결정",
    status: "deciding",
    problem: {
      statement: "출시 여부",
      goals: [],
      constraints: [],
      budget: "",
      deadline: "",
      riskTolerance: "medium",
      successCriteria: [],
      reversible: true
    },
    criteria: [],
    alternatives: [],
    scenarios: [],
    recommendation: {
      summary: "제한 출시를 권고",
      rationale: "리스크 대비 학습 효과가 큼",
      confidence: "medium",
      assumptions: ["시장 반응 가정"],
      counterpoints: ["경쟁사 선점 위험"],
      updatedAt: new Date().toISOString()
    },
    finalDecision: null,
    executionPlan: [],
    retrospective: null,
    research: null,
    simulationResult: null,
    conversation: [],
    employeeSignalWeight: 0.15,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const brief = assembleDecisionBrief(decision, buildSignal(), ["장비 부족"]);
  assert.ok(brief.employeeVoice);
  assert.equal(brief.employeeVoice?.responseCount, 14);
  assert.equal(brief.employeeVoice?.employeeSignalScore, 63);
  assert.deepEqual(brief.employeeVoice?.topConcerns, ["인력 부족"]);
  assert.deepEqual(brief.employeeVoice?.minorityViews, ["출시 연기가 낫다"]);
  assert.deepEqual(brief.employeeVoice?.executionBlockers, ["장비 부족"]);
  assert.equal(brief.employeeVoice?.aiInterpretation, "전반적으로 지지하지만 실행 여력을 우려함");
  assert.equal(brief.employeeSignalWeight, 0.15);
  // Signal alone never decides: the recommendation stays whatever the human
  // review produced, and the brief keeps counterpoints visible.
  assert.equal(brief.recommendation?.summary, "제한 출시를 권고");
  assert.deepEqual(brief.counterpoints, ["경쟁사 선점 위험"]);

  const noSignalBrief = assembleDecisionBrief(decision, null);
  assert.equal(noSignalBrief.employeeVoice, null);

  // Conflicts between external analysis and employee opinion are surfaced.
  const conflict = detectSignalConflict(decision, buildSignal({ supportScore: 20 }));
  assert.ok(conflict && conflict.includes("충돌"));
  assert.equal(detectSignalConflict(decision, buildSignal({ supportScore: 80 })), null);
});
