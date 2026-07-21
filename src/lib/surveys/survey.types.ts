// Anonymous employee-input survey MVP.
//
// Anonymity contract (docs/stage-1-plan.md §D):
// - SurveyResponse / SurveyAnswer never carry user_id, member_id, email, name,
//   invite id, token, token hash, IP address, user agent, department, or rank.
// - Timestamps on responses are day buckets only.
// - SurveyInvitePrivate is server-private: it is never serialized into any API
//   response, including admin APIs.
// - There is no foreign key or shared identifier between invites and responses.

export type SurveyStatus = "draft" | "active" | "closed" | "archived";

export type SurveyQuestionType =
  | "single_choice"
  | "multi_choice"
  | "yes_no"
  | "scale_1_5"
  | "open_text";

export type SurveyCriterion = "support" | "impact" | "feasibility" | "risk";

export type SurveyQuestion = {
  id: string;
  type: SurveyQuestionType;
  prompt: string;
  description: string;
  options: string[];
  required: boolean;
  orderIndex: number;
  decisionCriterion: SurveyCriterion | null;
  scoreDirection: "positive" | "negative";
  weight: number;
};

export type Survey = {
  id: string;
  organizationId: string;
  decisionId: string | null;
  title: string;
  description: string;
  status: SurveyStatus;
  anonymityMode: "verified_anonymous";
  minimumResultCount: number;
  employeeSignalWeight: number;
  targetMemberEmails: string[];
  estimatedMinutes: number;
  opensAt: string | null;
  closesAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  questions: SurveyQuestion[];
};

// Server-private. Identifies the member (memberKey) so eligibility and
// duplicate prevention work, but responses never reference this record.
export type SurveyInvitePrivate = {
  id: string;
  surveyId: string;
  memberKey: string;
  tokenHash: string;
  expiresAt: string;
  redeemedAt: string | null;
  createdAt: string;
};

export type SurveyRedactionStatus = "clean" | "redacted" | "needs_review";

export type SurveyResponse = {
  id: string;
  surveyId: string;
  submittedAtBucket: string;
  createdAtBucket: string;
  redactionStatus: SurveyRedactionStatus;
};

export type SurveyAnswer = {
  id: string;
  responseId: string;
  questionId: string;
  selectedOptions: string[] | null;
  numericValue: number | null;
  redactedText: string | null;
  // Original open text held back when redaction needs manual review.
  // Excluded from every result payload.
  heldText: string | null;
};

export type SurveyConfidenceLevel = "low" | "medium" | "high";

export type DecisionEmployeeSignal = {
  id: string;
  decisionId: string | null;
  surveyId: string;
  eligibleCount: number;
  responseCount: number;
  responseRate: number;
  supportScore: number | null;
  impactScore: number | null;
  feasibilityScore: number | null;
  riskScore: number | null;
  consensusScore: number | null;
  employeeSignalScore: number | null;
  confidenceLevel: SurveyConfidenceLevel;
  topSupportReasons: string[];
  topConcerns: string[];
  minorityViews: string[];
  generatedSummary: string | null;
  calculatedAt: string;
};

export type SurveyAiSummary = {
  summary: string;
  top_support_reasons: string[];
  top_concerns: string[];
  minority_views: string[];
  alternative_suggestions: string[];
  execution_blockers: string[];
  questions_for_management: string[];
  confidence_note: string;
};

export const DEFAULT_MINIMUM_RESULT_COUNT = 5;
export const DEFAULT_SURVEY_SIGNAL_WEIGHT = 0.15;
export const MAX_SURVEY_SIGNAL_WEIGHT = 0.3;
// Target participation used by the confidence formula. Kept as a named
// setting per docs/stage-1-plan.md §D.
export const DEFAULT_TARGET_RESPONSE_RATE = 0.7;

export const SURVEY_QUESTION_TYPES: SurveyQuestionType[] = [
  "single_choice",
  "multi_choice",
  "yes_no",
  "scale_1_5",
  "open_text"
];

export function isSurveyQuestionType(value: unknown): value is SurveyQuestionType {
  return SURVEY_QUESTION_TYPES.includes(value as SurveyQuestionType);
}
