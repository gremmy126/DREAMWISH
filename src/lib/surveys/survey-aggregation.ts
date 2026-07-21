import type {
  Survey,
  SurveyAnswer,
  SurveyConfidenceLevel,
  SurveyCriterion,
  SurveyQuestion,
  SurveyResponse
} from "./survey.types";
import { DEFAULT_TARGET_RESPONSE_RATE } from "./survey.types";

// Deterministic aggregation formulas (documented; unit-tested in
// tests/survey-aggregation.test.ts):
//
// 1) Scale normalization:      normalized = ((avg - 1) / 4) * 100
// 2) Negative direction:       normalized = 100 - normalized
// 3) Consensus per question:   consensus_q = (1 - sd / 2) * 100
//    where sd is the population standard deviation of the 1..5 answers and 2
//    is the maximum possible sd on that range. Overall consensus is the
//    unweighted mean of consensus_q across answered scale questions.
// 4) Employee Signal:          weighted mean of the direction-adjusted
//    normalized scores of questions linked to a decision criterion, using the
//    question weights.
// 5) Confidence: sample size and response rate never change the scores; they
//    only set confidence_level:
//      high   response_count >= 10 and rate >= target (default 0.7)
//      medium response_count >= 5  and rate >= target / 2
//      low    otherwise

export type QuestionAggregate = {
  questionId: string;
  type: SurveyQuestion["type"];
  prompt: string;
  answerCount: number;
  optionCounts: Record<string, number> | null;
  average: number | null;
  normalizedScore: number | null;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number> | null;
  consensusScore: number | null;
};

export type SurveyAggregate = {
  eligibleCount: number;
  responseCount: number;
  responseRate: number;
  questionAggregates: QuestionAggregate[];
  criterionScores: Record<SurveyCriterion, number | null>;
  consensusScore: number | null;
  employeeSignalScore: number | null;
  confidenceLevel: SurveyConfidenceLevel;
  riskRanking: Array<{ option: string; count: number }>;
};

export function normalizeScaleScore(average: number): number {
  return ((average - 1) / 4) * 100;
}

export function applyScoreDirection(
  normalized: number,
  direction: "positive" | "negative"
): number {
  return direction === "negative" ? 100 - normalized : normalized;
}

export function computeQuestionConsensus(values: number[]): number | null {
  if (!values.length) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const sd = Math.sqrt(variance);
  return (1 - sd / 2) * 100;
}

export function computeConfidenceLevel(
  responseCount: number,
  responseRate: number,
  targetResponseRate = DEFAULT_TARGET_RESPONSE_RATE
): SurveyConfidenceLevel {
  if (responseCount >= 10 && responseRate >= targetResponseRate) return "high";
  if (responseCount >= 5 && responseRate >= targetResponseRate / 2) return "medium";
  return "low";
}

export function aggregateSurvey(
  survey: Survey,
  responses: SurveyResponse[],
  answers: SurveyAnswer[]
): SurveyAggregate {
  const eligibleCount = survey.targetMemberEmails.length;
  const responseCount = responses.length;
  const responseRate = eligibleCount > 0 ? responseCount / eligibleCount : 0;

  const questionAggregates = survey.questions
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((question) => aggregateQuestion(question, answers));

  const criterionScores: Record<SurveyCriterion, number | null> = {
    support: null,
    impact: null,
    feasibility: null,
    risk: null
  };
  const criterionBuckets = new Map<SurveyCriterion, Array<{ score: number; weight: number }>>();

  for (const question of survey.questions) {
    if (!question.decisionCriterion || question.type !== "scale_1_5") continue;
    const aggregate = questionAggregates.find((item) => item.questionId === question.id);
    if (!aggregate || aggregate.average === null) continue;
    const normalized = applyScoreDirection(
      normalizeScaleScore(aggregate.average),
      question.scoreDirection
    );
    const bucket = criterionBuckets.get(question.decisionCriterion) || [];
    bucket.push({ score: normalized, weight: question.weight > 0 ? question.weight : 1 });
    criterionBuckets.set(question.decisionCriterion, bucket);
  }

  for (const [criterion, bucket] of criterionBuckets) {
    const totalWeight = bucket.reduce((sum, item) => sum + item.weight, 0);
    criterionScores[criterion] =
      totalWeight > 0
        ? round1(bucket.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight)
        : null;
  }

  const consensusValues = questionAggregates
    .map((item) => item.consensusScore)
    .filter((value): value is number => value !== null);
  const consensusScore = consensusValues.length
    ? round1(consensusValues.reduce((sum, value) => sum + value, 0) / consensusValues.length)
    : null;

  const employeeSignalScore = computeEmployeeSignalScore(survey, questionAggregates);

  const riskQuestion = survey.questions.find(
    (question) => question.decisionCriterion === "risk" && question.type === "multi_choice"
  );
  const riskAggregate = riskQuestion
    ? questionAggregates.find((item) => item.questionId === riskQuestion.id)
    : null;
  const riskRanking = riskAggregate?.optionCounts
    ? Object.entries(riskAggregate.optionCounts)
        .map(([option, count]) => ({ option, count }))
        .sort((a, b) => b.count - a.count)
    : [];

  return {
    eligibleCount,
    responseCount,
    responseRate: round3(responseRate),
    questionAggregates,
    criterionScores,
    consensusScore,
    employeeSignalScore,
    confidenceLevel: computeConfidenceLevel(responseCount, responseRate),
    riskRanking
  };
}

export function computeEmployeeSignalScore(
  survey: Survey,
  questionAggregates: QuestionAggregate[]
): number | null {
  const linked: Array<{ score: number; weight: number }> = [];
  for (const question of survey.questions) {
    if (!question.decisionCriterion || question.type !== "scale_1_5") continue;
    const aggregate = questionAggregates.find((item) => item.questionId === question.id);
    if (!aggregate || aggregate.average === null) continue;
    const normalized = applyScoreDirection(
      normalizeScaleScore(aggregate.average),
      question.scoreDirection
    );
    linked.push({ score: normalized, weight: question.weight > 0 ? question.weight : 1 });
  }
  const totalWeight = linked.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return null;
  return round1(linked.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight);
}

function aggregateQuestion(
  question: SurveyQuestion,
  answers: SurveyAnswer[]
): QuestionAggregate {
  const questionAnswers = answers.filter((answer) => answer.questionId === question.id);

  if (question.type === "scale_1_5") {
    const values = questionAnswers
      .map((answer) => answer.numericValue)
      .filter((value): value is number => typeof value === "number" && value >= 1 && value <= 5);
    const average = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
    const distribution: Record<"1" | "2" | "3" | "4" | "5", number> = {
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      "5": 0
    };
    for (const value of values) {
      const key = String(Math.round(value)) as keyof typeof distribution;
      if (distribution[key] !== undefined) distribution[key] += 1;
    }
    return {
      questionId: question.id,
      type: question.type,
      prompt: question.prompt,
      answerCount: values.length,
      optionCounts: null,
      average: average === null ? null : round2(average),
      normalizedScore:
        average === null
          ? null
          : round1(applyScoreDirection(normalizeScaleScore(average), question.scoreDirection)),
      distribution,
      consensusScore: values.length ? round1(computeQuestionConsensus(values) as number) : null
    };
  }

  if (
    question.type === "single_choice" ||
    question.type === "multi_choice" ||
    question.type === "yes_no"
  ) {
    const options = question.type === "yes_no" ? ["예", "아니오"] : question.options;
    const optionCounts: Record<string, number> = {};
    for (const option of options) optionCounts[option] = 0;
    let answered = 0;
    for (const answer of questionAnswers) {
      const selected = Array.isArray(answer.selectedOptions) ? answer.selectedOptions : [];
      if (!selected.length) continue;
      answered += 1;
      for (const option of selected) {
        if (optionCounts[option] === undefined) continue;
        optionCounts[option] += 1;
      }
    }
    return {
      questionId: question.id,
      type: question.type,
      prompt: question.prompt,
      answerCount: answered,
      optionCounts,
      average: null,
      normalizedScore: null,
      distribution: null,
      consensusScore: null
    };
  }

  const textCount = questionAnswers.filter(
    (answer) => answer.redactedText !== null || answer.heldText !== null
  ).length;
  return {
    questionId: question.id,
    type: question.type,
    prompt: question.prompt,
    answerCount: textCount,
    optionCounts: null,
    average: null,
    normalizedScore: null,
    distribution: null,
    consensusScore: null
  };
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}
