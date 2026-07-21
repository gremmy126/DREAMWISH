import { randomUUID } from "node:crypto";
import { chatWithAI } from "../ai/ai.service";
import type { Decision } from "../decisions/decision.types";
import type { SurveyAggregate } from "./survey-aggregation";
import type { SurveyAiSummary, SurveyQuestion } from "./survey.types";

// AI survey drafting and result summarization. Both stay strictly on the
// existing provider stack (chatWithAI). Every AI failure degrades gracefully:
// drafts fall back to the deterministic default question set, and a failed
// summary never blocks statistics.

const DEFAULT_RISK_OPTIONS = [
  "예산 초과",
  "일정 지연",
  "인력·역량 부족",
  "고객 반응 불확실",
  "기술적 난이도",
  "내부 운영 부담"
];

export function buildDefaultDraftQuestions(decision?: Decision | null): SurveyQuestion[] {
  const riskOptions = [...DEFAULT_RISK_OPTIONS];
  const constraints = decision?.problem.constraints || [];
  for (const constraint of constraints.slice(0, 3)) {
    const option = `제약 관련: ${constraint}`.slice(0, 100);
    if (!riskOptions.includes(option)) riskOptions.push(option);
  }

  const build = (
    partial: Omit<SurveyQuestion, "id" | "description" | "options" | "required" | "weight"> &
      Partial<Pick<SurveyQuestion, "description" | "options" | "required" | "weight">>
  ): SurveyQuestion => ({
    id: randomUUID(),
    description: "",
    options: [],
    required: true,
    weight: 1,
    ...partial
  });

  return [
    build({
      type: "scale_1_5",
      prompt: "이 결정에 얼마나 동의합니까?",
      orderIndex: 0,
      decisionCriterion: "support",
      scoreDirection: "positive"
    }),
    build({
      type: "scale_1_5",
      prompt: "기대되는 사업 효과는 어느 정도입니까?",
      orderIndex: 1,
      decisionCriterion: "impact",
      scoreDirection: "positive"
    }),
    build({
      type: "scale_1_5",
      prompt: "현재 조직이 실행할 가능성은 어느 정도입니까?",
      orderIndex: 2,
      decisionCriterion: "feasibility",
      scoreDirection: "positive"
    }),
    build({
      type: "multi_choice",
      prompt: "가장 큰 위험은 무엇입니까?",
      orderIndex: 3,
      decisionCriterion: "risk",
      scoreDirection: "negative",
      options: riskOptions.slice(0, 10)
    }),
    build({
      type: "open_text",
      prompt: "경영진이 놓친 문제나 더 나은 대안이 있습니까?",
      orderIndex: 4,
      decisionCriterion: null,
      scoreDirection: "positive",
      required: false
    })
  ];
}

// Drafts survey questions from the decision context. Never publishes: the
// caller stores the result as a draft that an administrator reviews first.
export async function generateSurveyDraft(
  decision: Decision | null
): Promise<{ questions: SurveyQuestion[]; source: "ai" | "default" }> {
  const fallback = buildDefaultDraftQuestions(decision);
  if (!decision) return { questions: fallback, source: "default" };

  try {
    const response = await chatWithAI([
      {
        role: "system",
        content:
          "당신은 조직 의사결정 설문 설계 도우미다. 반드시 JSON 배열만 출력한다. " +
          '각 원소는 {"type":"scale_1_5|single_choice|multi_choice|yes_no|open_text","prompt":string,"options":string[],"decisionCriterion":"support|impact|feasibility|risk|null","scoreDirection":"positive|negative"} 형식이다. ' +
          "기본 5문항(동의 1~5점, 기대 효과 1~5점, 실행 가능성 1~5점, 최대 위험 복수선택, 개선 의견 주관식)을 유지하되 결정 맥락에 맞게 문구와 위험 선택지만 다듬어라. " +
          "개인을 식별하는 질문(이름, 부서, 직급, 연락처)은 절대 만들지 마라."
      },
      {
        role: "user",
        content: JSON.stringify({
          title: decision.title,
          objective: decision.objective,
          constraints: decision.problem.constraints,
          successCriteria: decision.problem.successCriteria
        })
      }
    ]);
    const parsed = extractJson(response);
    if (!Array.isArray(parsed) || !parsed.length) return { questions: fallback, source: "default" };

    const questions: SurveyQuestion[] = [];
    parsed.slice(0, 8).forEach((item, index) => {
      const record = item as Record<string, unknown>;
      const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
      const type = record.type;
      if (!prompt) return;
      if (
        type !== "scale_1_5" &&
        type !== "single_choice" &&
        type !== "multi_choice" &&
        type !== "yes_no" &&
        type !== "open_text"
      ) {
        return;
      }
      questions.push({
        id: randomUUID(),
        type,
        prompt: prompt.slice(0, 500),
        description: "",
        options: Array.isArray(record.options)
          ? record.options.map((option) => String(option).slice(0, 200)).slice(0, 10)
          : [],
        required: type !== "open_text",
        orderIndex: index,
        decisionCriterion:
          record.decisionCriterion === "support" ||
          record.decisionCriterion === "impact" ||
          record.decisionCriterion === "feasibility" ||
          record.decisionCriterion === "risk"
            ? record.decisionCriterion
            : null,
        scoreDirection: record.scoreDirection === "negative" ? "negative" : "positive",
        weight: 1
      });
    });

    const valid = questions.filter(
      (question) =>
        question.type === "scale_1_5" ||
        question.type === "open_text" ||
        question.type === "yes_no" ||
        question.options.length >= 2
    );
    return valid.length >= 3
      ? { questions: valid, source: "ai" }
      : { questions: fallback, source: "default" };
  } catch {
    return { questions: fallback, source: "default" };
  }
}

// Summarizes anonymized aggregates + de-identified open answers. Receives no
// invite data, no user data, and no raw timestamps. Returns null on failure so
// statistics keep rendering.
export async function generateSurveySummary(
  aggregate: SurveyAggregate,
  openAnswers: Array<{ questionId: string; text: string }>
): Promise<SurveyAiSummary | null> {
  try {
    const response = await chatWithAI([
      {
        role: "system",
        content:
          "당신은 익명 조직 설문 분석가다. 입력은 익명 집계와 비식별 주관식 답변뿐이다. " +
          "다음을 절대 하지 마라: 작성자 신원·직급·부서 추측, 특정 직원과 의견 연결, 소수 의견 삭제, " +
          "표본이 적은 결과를 전체 조직 의견으로 단정, 주관식에 없는 사실 생성. " +
          '반드시 JSON 객체만 출력한다: {"summary":string,"top_support_reasons":string[],"top_concerns":string[],"minority_views":string[],"alternative_suggestions":string[],"execution_blockers":string[],"questions_for_management":string[],"confidence_note":string}'
      },
      {
        role: "user",
        content: JSON.stringify({
          eligibleCount: aggregate.eligibleCount,
          responseCount: aggregate.responseCount,
          responseRate: aggregate.responseRate,
          criterionScores: aggregate.criterionScores,
          consensusScore: aggregate.consensusScore,
          employeeSignalScore: aggregate.employeeSignalScore,
          confidenceLevel: aggregate.confidenceLevel,
          riskRanking: aggregate.riskRanking,
          openAnswers: openAnswers.map((answer) => answer.text).slice(0, 200)
        })
      }
    ]);
    const parsed = extractJson(response) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    if (typeof parsed.summary !== "string" || !parsed.summary.trim()) return null;
    return {
      summary: parsed.summary.slice(0, 4000),
      top_support_reasons: toStringList(parsed.top_support_reasons),
      top_concerns: toStringList(parsed.top_concerns),
      minority_views: toStringList(parsed.minority_views),
      alternative_suggestions: toStringList(parsed.alternative_suggestions),
      execution_blockers: toStringList(parsed.execution_blockers),
      questions_for_management: toStringList(parsed.questions_for_management),
      confidence_note: typeof parsed.confidence_note === "string" ? parsed.confidence_note.slice(0, 1000) : ""
    };
  } catch {
    return null;
  }
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 500))
    .filter(Boolean)
    .slice(0, 10);
}

function extractJson(content: string): unknown {
  const text = String(content || "").trim();
  const withoutFence = text.replace(/^```(?:json)?\s*/u, "").replace(/```\s*$/u, "");
  const start = withoutFence.search(/[[{]/u);
  if (start < 0) return null;
  try {
    return JSON.parse(withoutFence.slice(start));
  } catch {
    return null;
  }
}
