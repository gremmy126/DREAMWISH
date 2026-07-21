import assert from "node:assert/strict";
import {
  RegexTextRedactor,
  redactOpenText,
  type TextRedactor
} from "../src/lib/surveys/survey-redaction";

test("emails, phone numbers, URLs, SNS handles, and employee ids are masked", () => {
  const result = redactOpenText(
    "문의는 hong@company.com 또는 010-1234-5678, 자세한 내용은 https://wiki.company.com/plan 참고, 트위터 @hong_dev, 사번: A12345"
  );
  assert.equal(result.status, "redacted");
  assert.ok(result.text);
  assert.doesNotMatch(result.text as string, /hong@company\.com/u);
  assert.doesNotMatch(result.text as string, /010-1234-5678/u);
  assert.doesNotMatch(result.text as string, /wiki\.company\.com/u);
  assert.doesNotMatch(result.text as string, /@hong_dev/u);
  assert.doesNotMatch(result.text as string, /A12345/u);
  assert.match(result.text as string, /\[비공개\]/u);
});

test("Korean names with honorifics or titles are masked", () => {
  const result = redactOpenText("김철수 과장이 반대했고 이영희님도 우려를 표했다");
  assert.equal(result.status, "redacted");
  assert.doesNotMatch(result.text as string, /김철수/u);
  assert.doesNotMatch(result.text as string, /이영희/u);
});

test("clean opinions pass through untouched", () => {
  const result = redactOpenText("예산이 부족하고 일정이 촉박해서 단계적 출시가 낫다고 생각합니다.");
  assert.equal(result.status, "clean");
  assert.equal(result.text, "예산이 부족하고 일정이 촉박해서 단계적 출시가 낫다고 생각합니다.");
});

test("residual long digit runs force needs_review instead of publishing", () => {
  const result = redactOpenText("계약 번호 98765432 관련 문제가 있습니다");
  assert.equal(result.status, "needs_review");
  assert.equal(result.text, null);
});

test("a throwing redactor degrades to needs_review, never to raw text", () => {
  const broken: TextRedactor = {
    redact() {
      throw new Error("redaction backend down");
    }
  };
  const result = redactOpenText("개인정보가 있을 수도 있는 원문", broken);
  assert.equal(result.status, "needs_review");
  assert.equal(result.text, null);
});

test("the default redactor is deterministic", () => {
  const redactor = new RegexTextRedactor();
  const input = "연락처 010 9876 5432 로 회신 부탁";
  assert.deepEqual(redactor.redact(input), redactor.redact(input));
});
