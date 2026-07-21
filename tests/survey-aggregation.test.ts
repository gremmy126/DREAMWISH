import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  aggregateSurvey,
  applyScoreDirection,
  computeConfidenceLevel,
  computeQuestionConsensus,
  normalizeScaleScore
} from "../src/lib/surveys/survey-aggregation";
import type {
  Survey,
  SurveyAnswer,
  SurveyQuestion,
  SurveyResponse
} from "../src/lib/surveys/survey.types";

function buildSurvey(questions: SurveyQuestion[], targets = 10): Survey {
  return {
    id: "survey-1",
    organizationId: "org-1",
    decisionId: "decision-1",
    title: "테스트 설문",
    description: "",
    status: "active",
    anonymityMode: "verified_anonymous",
    minimumResultCount: 5,
    employeeSignalWeight: 0.15,
    targetMemberEmails: Array.from({ length: targets }, (_, i) => `member${i}@ex.com`),
    estimatedMinutes: 5,
    opensAt: null,
    closesAt: null,
    createdBy: "org-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    questions
  };
}

function scaleQuestion(
  id: string,
  criterion: "support" | "impact" | "feasibility" | "risk",
  direction: "positive" | "negative",
  weight = 1
): SurveyQuestion {
  return {
    id,
    type: "scale_1_5",
    prompt: id,
    description: "",
    options: [],
    required: true,
    orderIndex: 0,
    decisionCriterion: criterion,
    scoreDirection: direction,
    weight
  };
}

function makeAnswers(questionId: string, values: number[]): {
  responses: SurveyResponse[];
  answers: SurveyAnswer[];
} {
  const responses: SurveyResponse[] = [];
  const answers: SurveyAnswer[] = [];
  for (const value of values) {
    const responseId = randomUUID();
    responses.push({
      id: responseId,
      surveyId: "survey-1",
      submittedAtBucket: "2026-07-21",
      createdAtBucket: "2026-07-21",
      redactionStatus: "clean"
    });
    answers.push({
      id: randomUUID(),
      responseId,
      questionId,
      selectedOptions: null,
      numericValue: value,
      redactedText: null,
      heldText: null
    });
  }
  return { responses, answers };
}

test("scale normalization follows ((avg - 1) / 4) * 100", () => {
  assert.equal(normalizeScaleScore(1), 0);
  assert.equal(normalizeScaleScore(3), 50);
  assert.equal(normalizeScaleScore(5), 100);
  assert.ok(Math.abs(normalizeScaleScore(4.2) - 80) < 1e-9);
});

test("negative score direction inverts the normalized score", () => {
  assert.equal(applyScoreDirection(80, "negative"), 20);
  assert.equal(applyScoreDirection(80, "positive"), 80);
  assert.equal(applyScoreDirection(0, "negative"), 100);
});

test("consensus is (1 - sd/2) * 100: unanimity is 100, maximal split is 0", () => {
  assert.equal(computeQuestionConsensus([4, 4, 4, 4]), 100);
  assert.equal(computeQuestionConsensus([1, 5, 1, 5]), 0);
  const mixed = computeQuestionConsensus([1, 2, 3, 4, 5]) as number;
  assert.ok(mixed > 0 && mixed < 100);
  assert.equal(computeQuestionConsensus([]), null);
});

test("confidence reflects response rate and sample size without touching scores", () => {
  assert.equal(computeConfidenceLevel(12, 0.8), "high");
  assert.equal(computeConfidenceLevel(6, 0.5), "medium");
  assert.equal(computeConfidenceLevel(3, 0.9), "low");
  assert.equal(computeConfidenceLevel(20, 0.2), "low");
});

test("employee signal is the weighted mean of criterion-linked questions", () => {
  const support = scaleQuestion("q-support", "support", "positive", 2);
  const risk = scaleQuestion("q-risk", "risk", "negative", 1);
  const survey = buildSurvey([support, risk], 10);

  const supportData = makeAnswers("q-support", [5, 5, 5, 5, 5]); // avg 5 -> 100
  const riskData = makeAnswers("q-risk", [5, 5, 5, 5, 5]); // avg 5 -> 100 -> negative -> 0
  // Merge risk answers into the same responses so counts stay at 5.
  const answers = [
    ...supportData.answers,
    ...riskData.answers.map((answer, index) => ({
      ...answer,
      responseId: supportData.responses[index].id
    }))
  ];

  const aggregate = aggregateSurvey(survey, supportData.responses, answers);
  // (100 * 2 + 0 * 1) / 3 = 66.7
  assert.equal(aggregate.employeeSignalScore, 66.7);
  assert.equal(aggregate.criterionScores.support, 100);
  assert.equal(aggregate.criterionScores.risk, 0);
  assert.equal(aggregate.responseCount, 5);
  assert.equal(aggregate.eligibleCount, 10);
  assert.equal(aggregate.responseRate, 0.5);
  assert.equal(aggregate.confidenceLevel, "medium");
});

test("scale distributions and risk ranking aggregate correctly", () => {
  const support = scaleQuestion("q-support", "support", "positive");
  const riskChoice: SurveyQuestion = {
    id: "q-risk-choice",
    type: "multi_choice",
    prompt: "가장 큰 위험",
    description: "",
    options: ["예산", "일정", "인력"],
    required: true,
    orderIndex: 1,
    decisionCriterion: "risk",
    scoreDirection: "negative",
    weight: 1
  };
  const survey = buildSurvey([support, riskChoice], 5);
  const supportData = makeAnswers("q-support", [2, 4, 4, 5, 5]);
  const answers = [
    ...supportData.answers,
    ...supportData.responses.map((response, index) => ({
      id: randomUUID(),
      responseId: response.id,
      questionId: "q-risk-choice",
      selectedOptions: index < 3 ? ["예산"] : ["일정", "인력"],
      numericValue: null,
      redactedText: null,
      heldText: null
    }))
  ];
  const aggregate = aggregateSurvey(survey, supportData.responses, answers);
  const supportAggregate = aggregate.questionAggregates.find(
    (item) => item.questionId === "q-support"
  );
  assert.deepEqual(supportAggregate?.distribution, { "1": 0, "2": 1, "3": 0, "4": 2, "5": 2 });
  assert.equal(supportAggregate?.average, 4);
  assert.equal(supportAggregate?.normalizedScore, 75);
  assert.deepEqual(aggregate.riskRanking[0], { option: "예산", count: 3 });
});
