import type { SurveyRedactionStatus } from "./survey.types";

// De-identification for open-text answers before they reach admins or the LLM.
//
// The interface is intentionally provider-agnostic: a future Presidio-based
// microservice can implement TextRedactor without touching callers. Adding a
// Python service to this single-Node deployment was judged too heavy for
// Stage 1 (docs/stage-1-plan.md §D), so the default implementation is a
// deterministic regex pipeline covering: email, Korean phone numbers,
// employee-id patterns, URLs, SNS handles, and name-like strings that carry a
// Korean honorific/title suffix.
//
// If redaction throws, or residues that look like identifiers survive the
// pipeline, the result is `needs_review` and the caller must hold the original
// text back instead of publishing it.

export type RedactionResult = {
  status: SurveyRedactionStatus;
  text: string | null;
};

export interface TextRedactor {
  redact(text: string): RedactionResult;
}

const MASK = "[비공개]";

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu;
// 010-1234-5678, 01012345678, +82-10-1234-5678, 02-123-4567, 051 916 1222 ...
const KR_PHONE_PATTERN =
  /(?:\+82[-\s]?|0)(?:2|1[016789]|[3-6][1-5]|70)[-\s]?\d{3,4}[-\s]?\d{4}/gu;
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+/giu;
// @handle SNS accounts (not email fragments; emails are removed first).
const SNS_HANDLE_PATTERN = /(?<![A-Za-z0-9.])@[A-Za-z0-9_.]{2,30}/gu;
// Employee ids: explicit markers (사번/직원번호) followed by an identifier, or
// standalone letter-digit codes like AB-12345 / EMP2024001.
const EMPLOYEE_ID_MARKER_PATTERN = /(?:사번|직원\s?번호|사원\s?번호)\s*[:#]?\s*[A-Za-z0-9-]{3,16}/gu;
const EMPLOYEE_ID_CODE_PATTERN = /\b[A-Za-z]{1,4}-?\d{4,10}\b/gu;
// Korean name followed by an honorific or a common title: 홍길동님, 김철수 과장.
// Postpositions may follow the title (과장이, 님도), so no trailing lookahead.
const KR_NAME_TITLE_PATTERN =
  /[가-힣]{2,4}\s?(?:님|씨|대리|주임|사원|과장|차장|부장|팀장|실장|본부장|이사|상무|전무|대표|사장|회장|매니저|수석|선임)/gu;
// Residual long digit runs after masking suggest an identifier we missed.
const RESIDUAL_ID_PATTERN = /\d{7,}/u;

export class RegexTextRedactor implements TextRedactor {
  redact(text: string): RedactionResult {
    try {
      const original = String(text ?? "");
      if (!original.trim()) return { status: "clean", text: "" };

      let output = original;
      output = output.replace(EMAIL_PATTERN, MASK);
      output = output.replace(URL_PATTERN, MASK);
      output = output.replace(KR_PHONE_PATTERN, MASK);
      output = output.replace(EMPLOYEE_ID_MARKER_PATTERN, MASK);
      output = output.replace(SNS_HANDLE_PATTERN, MASK);
      output = output.replace(KR_NAME_TITLE_PATTERN, MASK);
      output = output.replace(EMPLOYEE_ID_CODE_PATTERN, MASK);

      if (RESIDUAL_ID_PATTERN.test(output)) {
        return { status: "needs_review", text: null };
      }

      return output === original
        ? { status: "clean", text: output }
        : { status: "redacted", text: output };
    } catch {
      return { status: "needs_review", text: null };
    }
  }
}

const defaultRedactor = new RegexTextRedactor();

export function redactOpenText(
  text: string,
  redactor: TextRedactor = defaultRedactor
): RedactionResult {
  try {
    return redactor.redact(text);
  } catch {
    return { status: "needs_review", text: null };
  }
}
