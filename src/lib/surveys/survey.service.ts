import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  listOwnerStates,
  mutateOwnerState,
  readOwnerState,
  type OwnerStateStore
} from "../db/owner-state-store";
import { aggregateSurvey, type SurveyAggregate } from "./survey-aggregation";
import { redactOpenText } from "./survey-redaction";
import {
  DEFAULT_MINIMUM_RESULT_COUNT,
  DEFAULT_SURVEY_SIGNAL_WEIGHT,
  MAX_SURVEY_SIGNAL_WEIGHT,
  isSurveyQuestionType,
  type DecisionEmployeeSignal,
  type Survey,
  type SurveyAnswer,
  type SurveyInvitePrivate,
  type SurveyQuestion,
  type SurveyResponse,
  type SurveyStatus
} from "./survey.types";

export type SurveyState = {
  surveys: Survey[];
  // Server-private: never serialize into API responses.
  invites: SurveyInvitePrivate[];
  responses: SurveyResponse[];
  answers: SurveyAnswer[];
  signals: DecisionEmployeeSignal[];
};

export const SURVEY_STORE: OwnerStateStore<SurveyState> = {
  namespace: "survey-state",
  fileName: "surveys.json",
  fallback: () => ({ surveys: [], invites: [], responses: [], answers: [], signals: [] })
};

export type SurveyErrorCode =
  | "SURVEY_NOT_FOUND"
  | "SURVEY_NOT_OPEN"
  | "SURVEY_CLOSED"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "TOKEN_USED"
  | "NOT_ELIGIBLE"
  | "ALREADY_RESPONDED"
  | "VALIDATION"
  | "FORBIDDEN";

export class SurveyError extends Error {
  readonly code: SurveyErrorCode;
  readonly status: number;

  constructor(code: SurveyErrorCode, message: string, status = 400) {
    super(message);
    this.name = "SurveyError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Survey lifecycle (owner/admin side)
// ---------------------------------------------------------------------------

export type SurveyDraftInput = {
  title?: string;
  description?: string;
  decisionId?: string | null;
  targetMemberEmails?: string[];
  minimumResultCount?: number;
  employeeSignalWeight?: number;
  estimatedMinutes?: number;
  opensAt?: string | null;
  closesAt?: string | null;
  questions?: Array<Partial<SurveyQuestion>>;
};

export async function listSurveys(ownerId: string): Promise<Survey[]> {
  const state = await readOwnerState(SURVEY_STORE, ownerId);
  return state.surveys
    .filter((survey) => survey.status !== "archived")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getSurvey(ownerId: string, surveyId: string): Promise<Survey | null> {
  const state = await readOwnerState(SURVEY_STORE, ownerId);
  return state.surveys.find((survey) => survey.id === surveyId) || null;
}

export async function createSurvey(
  ownerId: string,
  createdBy: string,
  input: SurveyDraftInput
): Promise<Survey> {
  const title = input.title?.trim();
  if (!title) throw new SurveyError("VALIDATION", "설문 제목을 입력하세요.");
  const now = new Date().toISOString();
  const survey: Survey = {
    id: randomUUID(),
    organizationId: ownerId,
    decisionId: input.decisionId || null,
    title: title.slice(0, 200),
    description: input.description?.trim().slice(0, 2000) || "",
    status: "draft",
    anonymityMode: "verified_anonymous",
    minimumResultCount: sanitizeMinimumCount(input.minimumResultCount),
    employeeSignalWeight: sanitizeSignalWeight(input.employeeSignalWeight),
    targetMemberEmails: sanitizeEmails(input.targetMemberEmails || []),
    estimatedMinutes: sanitizeEstimatedMinutes(input.estimatedMinutes, input.questions?.length || 0),
    opensAt: sanitizeDate(input.opensAt),
    closesAt: sanitizeDate(input.closesAt),
    createdBy,
    createdAt: now,
    updatedAt: now,
    questions: sanitizeQuestions(input.questions || [])
  };
  await mutateOwnerState(SURVEY_STORE, ownerId, (state) => {
    state.surveys.unshift(survey);
  });
  return survey;
}

export async function updateSurveyDraft(
  ownerId: string,
  surveyId: string,
  input: SurveyDraftInput
): Promise<Survey> {
  return mutateOwnerState(SURVEY_STORE, ownerId, (state) => {
    const survey = requireSurvey(state, surveyId);
    if (survey.status !== "draft") {
      throw new SurveyError("VALIDATION", "게시된 설문은 문항을 수정할 수 없습니다.");
    }
    if (typeof input.title === "string" && input.title.trim()) {
      survey.title = input.title.trim().slice(0, 200);
    }
    if (typeof input.description === "string") {
      survey.description = input.description.trim().slice(0, 2000);
    }
    if (input.decisionId !== undefined) survey.decisionId = input.decisionId || null;
    if (input.targetMemberEmails) {
      survey.targetMemberEmails = sanitizeEmails(input.targetMemberEmails);
    }
    if (input.minimumResultCount !== undefined) {
      survey.minimumResultCount = sanitizeMinimumCount(input.minimumResultCount);
    }
    if (input.employeeSignalWeight !== undefined) {
      survey.employeeSignalWeight = sanitizeSignalWeight(input.employeeSignalWeight);
    }
    if (input.estimatedMinutes !== undefined) {
      survey.estimatedMinutes = sanitizeEstimatedMinutes(
        input.estimatedMinutes,
        survey.questions.length
      );
    }
    if (input.opensAt !== undefined) survey.opensAt = sanitizeDate(input.opensAt);
    if (input.closesAt !== undefined) survey.closesAt = sanitizeDate(input.closesAt);
    if (input.questions) {
      survey.questions = sanitizeQuestions(input.questions);
      survey.estimatedMinutes = sanitizeEstimatedMinutes(
        survey.estimatedMinutes,
        survey.questions.length
      );
    }
    survey.updatedAt = new Date().toISOString();
    return structuredClone(survey);
  });
}

export async function publishSurvey(ownerId: string, surveyId: string): Promise<Survey> {
  return mutateOwnerState(SURVEY_STORE, ownerId, (state) => {
    const survey = requireSurvey(state, surveyId);
    if (survey.status !== "draft") {
      throw new SurveyError("VALIDATION", "초안 상태의 설문만 게시할 수 있습니다.");
    }
    if (!survey.questions.length) {
      throw new SurveyError("VALIDATION", "문항이 없는 설문은 게시할 수 없습니다.");
    }
    if (!survey.targetMemberEmails.length) {
      throw new SurveyError("VALIDATION", "대상 구성원 이메일을 1명 이상 지정하세요.");
    }
    survey.status = "active";
    if (!survey.opensAt) survey.opensAt = new Date().toISOString();
    survey.updatedAt = new Date().toISOString();
    return structuredClone(survey);
  });
}

export async function closeSurvey(ownerId: string, surveyId: string): Promise<Survey> {
  return mutateOwnerState(SURVEY_STORE, ownerId, (state) => {
    const survey = requireSurvey(state, surveyId);
    if (survey.status !== "active") {
      throw new SurveyError("VALIDATION", "진행 중인 설문만 종료할 수 있습니다.");
    }
    survey.status = "closed";
    survey.closesAt = survey.closesAt && survey.closesAt < new Date().toISOString()
      ? survey.closesAt
      : new Date().toISOString();
    survey.updatedAt = new Date().toISOString();
    return structuredClone(survey);
  });
}

export async function archiveSurvey(ownerId: string, surveyId: string): Promise<void> {
  await mutateOwnerState(SURVEY_STORE, ownerId, (state) => {
    const survey = requireSurvey(state, surveyId);
    if (survey.status === "active") {
      throw new SurveyError("VALIDATION", "진행 중인 설문은 먼저 종료하세요.");
    }
    survey.status = "archived";
    survey.updatedAt = new Date().toISOString();
  });
}

// ---------------------------------------------------------------------------
// Admin stats — aggregate only; never exposes who responded.
// ---------------------------------------------------------------------------

export type SurveyAdminStats = {
  eligibleCount: number;
  responseCount: number;
  responseRate: number;
  remainingDays: number | null;
};

export async function getSurveyAdminStats(
  ownerId: string,
  surveyId: string
): Promise<SurveyAdminStats> {
  const state = await readOwnerState(SURVEY_STORE, ownerId);
  const survey = requireSurvey(state, surveyId);
  const responseCount = state.responses.filter((response) => response.surveyId === surveyId).length;
  const eligibleCount = survey.targetMemberEmails.length;
  return {
    eligibleCount,
    responseCount,
    responseRate: eligibleCount > 0 ? Math.round((responseCount / eligibleCount) * 1000) / 1000 : 0,
    remainingDays: survey.closesAt
      ? Math.max(0, Math.ceil((Date.parse(survey.closesAt) - Date.now()) / 86_400_000))
      : null
  };
}

// ---------------------------------------------------------------------------
// Member side: my surveys, token issuance, anonymous submission
// ---------------------------------------------------------------------------

export type MemberSurveyListItem = {
  organizationId: string;
  surveyId: string;
  title: string;
  description: string;
  status: SurveyStatus;
  closesAt: string | null;
  estimatedMinutes: number;
  questionCount: number;
  myState: "pending" | "completed" | "closed";
};

export async function listSurveysForMember(
  memberEmail: string
): Promise<MemberSurveyListItem[]> {
  const email = normalizeEmail(memberEmail);
  if (!email) return [];
  const states = await listOwnerStates(SURVEY_STORE);
  const items: MemberSurveyListItem[] = [];
  for (const { ownerId, state } of states) {
    for (const survey of state.surveys) {
      if (survey.status !== "active" && survey.status !== "closed") continue;
      if (!survey.targetMemberEmails.includes(email)) continue;
      const memberKey = computeMemberKey(survey.id, email);
      const invite = state.invites.find(
        (candidate) => candidate.surveyId === survey.id && candidate.memberKey === memberKey
      );
      const completed = Boolean(invite?.redeemedAt);
      items.push({
        organizationId: ownerId,
        surveyId: survey.id,
        title: survey.title,
        description: survey.description,
        status: survey.status,
        closesAt: survey.closesAt,
        estimatedMinutes: survey.estimatedMinutes,
        questionCount: survey.questions.length,
        myState: completed ? "completed" : survey.status === "closed" ? "closed" : "pending"
      });
    }
  }
  return items.sort((a, b) => (a.closesAt || "9999").localeCompare(b.closesAt || "9999"));
}

export type MemberSurveyView = {
  organizationId: string;
  surveyId: string;
  title: string;
  description: string;
  status: SurveyStatus;
  closesAt: string | null;
  estimatedMinutes: number;
  questions: Array<Pick<SurveyQuestion, "id" | "type" | "prompt" | "description" | "options" | "required" | "orderIndex">>;
};

export async function getSurveyForMember(
  organizationId: string,
  surveyId: string,
  memberEmail: string
): Promise<MemberSurveyView> {
  const email = normalizeEmail(memberEmail);
  const state = await readOwnerState(SURVEY_STORE, organizationId);
  const survey = requireSurvey(state, surveyId);
  if (!email || !survey.targetMemberEmails.includes(email)) {
    throw new SurveyError("NOT_ELIGIBLE", "이 설문의 대상이 아닙니다.", 403);
  }
  return {
    organizationId,
    surveyId: survey.id,
    title: survey.title,
    description: survey.description,
    status: survey.status,
    closesAt: survey.closesAt,
    estimatedMinutes: survey.estimatedMinutes,
    questions: survey.questions
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((question) => ({
        id: question.id,
        type: question.type,
        prompt: question.prompt,
        description: question.description,
        options: question.type === "yes_no" ? ["예", "아니오"] : question.options,
        required: question.required,
        orderIndex: question.orderIndex
      }))
  };
}

const TOKEN_TTL_MS = 7 * 86_400_000;

// Issues (or rotates) the caller's anonymous response token after verifying
// eligibility. Only the SHA-256 hash is stored; the raw token is returned to
// the member exactly once and is never logged.
export async function issueMemberToken(
  organizationId: string,
  surveyId: string,
  memberEmail: string
): Promise<{ token: string; expiresAt: string }> {
  const email = normalizeEmail(memberEmail);
  if (!email) throw new SurveyError("NOT_ELIGIBLE", "이 설문의 대상이 아닙니다.", 403);

  return mutateOwnerState(SURVEY_STORE, organizationId, (state) => {
    const survey = requireSurvey(state, surveyId);
    assertSurveyOpen(survey);
    if (!survey.targetMemberEmails.includes(email)) {
      throw new SurveyError("NOT_ELIGIBLE", "이 설문의 대상이 아닙니다.", 403);
    }
    const memberKey = computeMemberKey(surveyId, email);
    const existing = state.invites.find(
      (invite) => invite.surveyId === surveyId && invite.memberKey === memberKey
    );
    if (existing?.redeemedAt) {
      throw new SurveyError("ALREADY_RESPONDED", "이미 이 설문에 응답했습니다.", 409);
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashSurveyToken(token);
    const expiresAt = computeTokenExpiry(survey);

    if (existing) {
      existing.tokenHash = tokenHash;
      existing.expiresAt = expiresAt;
    } else {
      state.invites.push({
        id: randomUUID(),
        surveyId,
        memberKey,
        tokenHash,
        expiresAt,
        redeemedAt: null,
        createdAt: new Date().toISOString()
      });
    }
    return { token, expiresAt };
  });
}

export type SurveyAnswerInput = {
  questionId: string;
  selectedOptions?: string[];
  numericValue?: number;
  text?: string;
};

// Anonymous submission. Runs as ONE transaction (file-store mutex or the
// Postgres advisory-locked transaction inside mutateOwnerState):
//   1 token hash lookup → 2 expiry check → 3 redeemed check → 4 survey active
//   check → 5 store anonymous response → 6 store answers → 7 mark invite
//   redeemed → 8 commit. Any thrown error aborts the whole mutation, so a
//   failed save never consumes the token.
// The stored response carries day-bucket timestamps only and no identifiers.
export async function submitSurveyResponse(
  organizationId: string,
  surveyId: string,
  token: string,
  answersInput: SurveyAnswerInput[]
): Promise<{ responseId: string }> {
  const tokenHash = hashSurveyToken(String(token || ""));

  return mutateOwnerState(SURVEY_STORE, organizationId, (state) => {
    // 1. token hash
    const invite = state.invites.find(
      (candidate) => candidate.surveyId === surveyId && candidate.tokenHash === tokenHash
    );
    if (!token || !invite) {
      throw new SurveyError("TOKEN_INVALID", "유효하지 않은 응답 토큰입니다.", 401);
    }
    // 2. expiry
    if (Date.parse(invite.expiresAt) <= Date.now()) {
      throw new SurveyError("TOKEN_EXPIRED", "응답 토큰이 만료되었습니다.", 401);
    }
    // 3. already used
    if (invite.redeemedAt) {
      throw new SurveyError("TOKEN_USED", "이미 사용된 응답 토큰입니다.", 409);
    }
    // 4. survey active
    const survey = requireSurvey(state, surveyId);
    assertSurveyOpen(survey);

    // 5–6. anonymous response + answers
    const responseId = randomUUID();
    const dayBucket = new Date().toISOString().slice(0, 10);
    const answers = buildAnswers(survey, responseId, answersInput);
    const redactionStatus = answers.some((answer) => answer.heldText !== null)
      ? "needs_review"
      : deriveTextStatus(answers);

    state.responses.push({
      id: responseId,
      surveyId,
      submittedAtBucket: dayBucket,
      createdAtBucket: dayBucket,
      redactionStatus
    });
    state.answers.push(...answers);

    // 7. redeem — only after the response and answers are staged.
    invite.redeemedAt = new Date().toISOString();

    // 8. commit happens when this mutation returns without throwing.
    return { responseId };
  });
}

// ---------------------------------------------------------------------------
// Results — gated by minimum_result_count
// ---------------------------------------------------------------------------

export type SurveyResultsLocked = {
  locked: true;
  status: SurveyStatus;
  responseCount: number;
  minimumResultCount: number;
};

export type SurveyResultsOpen = {
  locked: false;
  status: SurveyStatus;
  minimumResultCount: number;
  aggregate: SurveyAggregate;
  openAnswers: Array<{ questionId: string; text: string }>;
  needsReviewCount: number;
  signal: DecisionEmployeeSignal | null;
};

export type SurveyResults = SurveyResultsLocked | SurveyResultsOpen;

export async function getSurveyResults(
  ownerId: string,
  surveyId: string
): Promise<SurveyResults> {
  const state = await readOwnerState(SURVEY_STORE, ownerId);
  const survey = requireSurvey(state, surveyId);
  const responses = state.responses.filter((response) => response.surveyId === surveyId);

  if (responses.length < survey.minimumResultCount) {
    return {
      locked: true,
      status: survey.status,
      responseCount: responses.length,
      minimumResultCount: survey.minimumResultCount
    };
  }

  const responseIds = new Set(responses.map((response) => response.id));
  const answers = state.answers.filter((answer) => responseIds.has(answer.responseId));
  const aggregate = aggregateSurvey(survey, responses, answers);

  const openAnswers = shuffle(
    answers
      .filter((answer) => typeof answer.redactedText === "string" && answer.redactedText.trim())
      .map((answer) => ({ questionId: answer.questionId, text: answer.redactedText as string }))
  );
  const needsReviewCount = answers.filter((answer) => answer.heldText !== null).length;
  const signal = state.signals.find((candidate) => candidate.surveyId === surveyId) || null;

  return {
    locked: false,
    status: survey.status,
    minimumResultCount: survey.minimumResultCount,
    aggregate,
    openAnswers,
    needsReviewCount,
    signal
  };
}

// Recomputes and stores the Employee Signal snapshot for a survey. AI summary
// fields are preserved if already present; statistics never depend on the AI.
export async function computeAndStoreEmployeeSignal(
  ownerId: string,
  surveyId: string
): Promise<DecisionEmployeeSignal | null> {
  return mutateOwnerState(SURVEY_STORE, ownerId, (state) => {
    const survey = requireSurvey(state, surveyId);
    const responses = state.responses.filter((response) => response.surveyId === surveyId);
    if (responses.length < survey.minimumResultCount) return null;

    const responseIds = new Set(responses.map((response) => response.id));
    const answers = state.answers.filter((answer) => responseIds.has(answer.responseId));
    const aggregate = aggregateSurvey(survey, responses, answers);

    const existing = state.signals.find((candidate) => candidate.surveyId === surveyId);
    const signal: DecisionEmployeeSignal = {
      id: existing?.id || randomUUID(),
      decisionId: survey.decisionId,
      surveyId,
      eligibleCount: aggregate.eligibleCount,
      responseCount: aggregate.responseCount,
      responseRate: aggregate.responseRate,
      supportScore: aggregate.criterionScores.support,
      impactScore: aggregate.criterionScores.impact,
      feasibilityScore: aggregate.criterionScores.feasibility,
      riskScore: aggregate.criterionScores.risk,
      consensusScore: aggregate.consensusScore,
      employeeSignalScore: aggregate.employeeSignalScore,
      confidenceLevel: aggregate.confidenceLevel,
      topSupportReasons: existing?.topSupportReasons || [],
      topConcerns: existing?.topConcerns || [],
      minorityViews: existing?.minorityViews || [],
      generatedSummary: existing?.generatedSummary || null,
      calculatedAt: new Date().toISOString()
    };
    const index = state.signals.findIndex((candidate) => candidate.surveyId === surveyId);
    if (index >= 0) state.signals[index] = signal;
    else state.signals.push(signal);
    return structuredClone(signal);
  });
}

export async function attachAiSummaryToSignal(
  ownerId: string,
  surveyId: string,
  summary: {
    generatedSummary: string;
    topSupportReasons: string[];
    topConcerns: string[];
    minorityViews: string[];
  }
): Promise<DecisionEmployeeSignal | null> {
  return mutateOwnerState(SURVEY_STORE, ownerId, (state) => {
    const signal = state.signals.find((candidate) => candidate.surveyId === surveyId);
    if (!signal) return null;
    signal.generatedSummary = summary.generatedSummary.slice(0, 4000);
    signal.topSupportReasons = summary.topSupportReasons.slice(0, 10);
    signal.topConcerns = summary.topConcerns.slice(0, 10);
    signal.minorityViews = summary.minorityViews.slice(0, 10);
    return structuredClone(signal);
  });
}

export async function getSignalForDecision(
  ownerId: string,
  decisionId: string
): Promise<DecisionEmployeeSignal | null> {
  const state = await readOwnerState(SURVEY_STORE, ownerId);
  return (
    state.signals
      .filter((signal) => signal.decisionId === decisionId)
      .sort((a, b) => b.calculatedAt.localeCompare(a.calculatedAt))[0] || null
  );
}

export async function listSurveysForDecision(
  ownerId: string,
  decisionId: string
): Promise<Survey[]> {
  const state = await readOwnerState(SURVEY_STORE, ownerId);
  return state.surveys.filter(
    (survey) => survey.decisionId === decisionId && survey.status !== "archived"
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function hashSurveyToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function computeMemberKey(surveyId: string, normalizedEmail: string): string {
  return createHash("sha256").update(`${surveyId}:${normalizedEmail}`, "utf8").digest("hex");
}

function computeTokenExpiry(survey: Survey): string {
  const ttlExpiry = Date.now() + TOKEN_TTL_MS;
  const closeExpiry = survey.closesAt ? Date.parse(survey.closesAt) : Number.POSITIVE_INFINITY;
  return new Date(Math.min(ttlExpiry, closeExpiry)).toISOString();
}

function requireSurvey(state: SurveyState, surveyId: string): Survey {
  const survey = state.surveys.find((candidate) => candidate.id === surveyId);
  if (!survey || survey.status === "archived") {
    throw new SurveyError("SURVEY_NOT_FOUND", "설문을 찾을 수 없습니다.", 404);
  }
  return survey;
}

function assertSurveyOpen(survey: Survey): void {
  if (survey.status === "draft") {
    throw new SurveyError("SURVEY_NOT_OPEN", "아직 시작하지 않은 설문입니다.", 409);
  }
  if (survey.status !== "active") {
    throw new SurveyError("SURVEY_CLOSED", "종료된 설문입니다.", 409);
  }
  const now = Date.now();
  if (survey.opensAt && Date.parse(survey.opensAt) > now) {
    throw new SurveyError("SURVEY_NOT_OPEN", "아직 시작하지 않은 설문입니다.", 409);
  }
  if (survey.closesAt && Date.parse(survey.closesAt) <= now) {
    throw new SurveyError("SURVEY_CLOSED", "종료된 설문입니다.", 409);
  }
}

function buildAnswers(
  survey: Survey,
  responseId: string,
  answersInput: SurveyAnswerInput[]
): SurveyAnswer[] {
  const inputByQuestion = new Map<string, SurveyAnswerInput>();
  for (const input of answersInput || []) {
    if (input?.questionId) inputByQuestion.set(input.questionId, input);
  }

  const answers: SurveyAnswer[] = [];
  for (const question of survey.questions) {
    const input = inputByQuestion.get(question.id);
    const hasValue = Boolean(
      input &&
        ((Array.isArray(input.selectedOptions) && input.selectedOptions.length) ||
          typeof input.numericValue === "number" ||
          (typeof input.text === "string" && input.text.trim()))
    );
    if (!hasValue) {
      if (question.required) {
        throw new SurveyError("VALIDATION", "필수 문항에 응답하지 않았습니다.");
      }
      continue;
    }

    const answer: SurveyAnswer = {
      id: randomUUID(),
      responseId,
      questionId: question.id,
      selectedOptions: null,
      numericValue: null,
      redactedText: null,
      heldText: null
    };

    if (question.type === "scale_1_5") {
      const value = Number(input?.numericValue);
      if (!Number.isInteger(value) || value < 1 || value > 5) {
        throw new SurveyError("VALIDATION", "1~5점 문항의 값이 올바르지 않습니다.");
      }
      answer.numericValue = value;
    } else if (question.type === "open_text") {
      const text = String(input?.text || "").slice(0, 4000);
      const redaction = redactOpenText(text);
      if (redaction.status === "needs_review") {
        answer.heldText = text;
      } else {
        answer.redactedText = redaction.text ?? "";
      }
    } else {
      const validOptions =
        question.type === "yes_no" ? ["예", "아니오"] : question.options;
      const selected = (input?.selectedOptions || []).filter((option) =>
        validOptions.includes(option)
      );
      if (!selected.length) {
        throw new SurveyError("VALIDATION", "선택 문항의 값이 올바르지 않습니다.");
      }
      if (question.type !== "multi_choice" && selected.length > 1) {
        throw new SurveyError("VALIDATION", "하나만 선택할 수 있는 문항입니다.");
      }
      answer.selectedOptions = selected;
    }
    answers.push(answer);
  }

  if (!answers.length) {
    throw new SurveyError("VALIDATION", "응답할 문항이 없습니다.");
  }
  return answers;
}

function deriveTextStatus(answers: SurveyAnswer[]): "clean" | "redacted" {
  return answers.some(
    (answer) => answer.redactedText !== null && answer.redactedText.includes("[비공개]")
  )
    ? "redacted"
    : "clean";
}

function sanitizeEmails(emails: string[]): string[] {
  const unique = new Set<string>();
  for (const raw of emails) {
    const email = normalizeEmail(raw);
    if (email) unique.add(email);
  }
  return [...unique].slice(0, 2000);
}

function normalizeEmail(raw: unknown): string {
  const email = String(raw || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ? email : "";
}

function sanitizeMinimumCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_MINIMUM_RESULT_COUNT;
  return Math.min(100, parsed);
}

function sanitizeSignalWeight(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SURVEY_SIGNAL_WEIGHT;
  return Math.min(MAX_SURVEY_SIGNAL_WEIGHT, parsed);
}

function sanitizeEstimatedMinutes(value: unknown, questionCount: number): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 1) return Math.min(120, Math.round(parsed));
  return Math.max(1, Math.ceil(questionCount * 0.5));
}

function sanitizeDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function sanitizeQuestions(inputs: Array<Partial<SurveyQuestion>>): SurveyQuestion[] {
  const questions: SurveyQuestion[] = [];
  inputs.slice(0, 50).forEach((input, index) => {
    const prompt = String(input.prompt || "").trim();
    if (!prompt || !isSurveyQuestionType(input.type)) return;
    const type = input.type;
    const options =
      type === "single_choice" || type === "multi_choice"
        ? (Array.isArray(input.options) ? input.options : [])
            .map((option) => String(option).trim().slice(0, 200))
            .filter(Boolean)
            .slice(0, 20)
        : [];
    if ((type === "single_choice" || type === "multi_choice") && options.length < 2) return;
    questions.push({
      id: typeof input.id === "string" && input.id ? input.id : randomUUID(),
      type,
      prompt: prompt.slice(0, 500),
      description: String(input.description || "").trim().slice(0, 1000),
      options,
      required: input.required !== false,
      orderIndex: index,
      decisionCriterion:
        input.decisionCriterion === "support" ||
        input.decisionCriterion === "impact" ||
        input.decisionCriterion === "feasibility" ||
        input.decisionCriterion === "risk"
          ? input.decisionCriterion
          : null,
      scoreDirection: input.scoreDirection === "negative" ? "negative" : "positive",
      weight:
        typeof input.weight === "number" && Number.isFinite(input.weight) && input.weight > 0
          ? Math.min(10, input.weight)
          : 1
    });
  });
  return questions;
}

function shuffle<T>(items: T[]): T[] {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}
