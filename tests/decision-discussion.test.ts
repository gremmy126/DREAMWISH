import assert from "node:assert/strict";
import {
  buildDecisionContextSummary,
  buildDecisionDiscussionMessages,
  buildDeterministicDiscussionAnswer
} from "../src/lib/decisions/decision-discussion";
import type { Decision } from "../src/lib/decisions/decision.types";

function sampleDecision(): Decision {
  return {
    id: "d1",
    title: "신규 서비스 출시",
    objective: "6개월 내 월 매출 3천만 원",
    problem: {
      statement: "직접 개발과 외주 중 무엇을 택할까",
      goals: [],
      constraints: ["개발 인력 2명"],
      budget: "5천만 원",
      deadline: "이번 분기",
      riskTolerance: "medium",
      successCriteria: ["손익분기 12개월"],
      reversible: true
    },
    simulationResult: {
      scenarios: [
        { kind: "base", label: "기본", probability: 55, expectedOutcome: "완만한 성장" }
      ],
      ranking: [
        { id: "a", title: "직접 개발", total: 82 },
        { id: "b", title: "외주", total: 71 }
      ],
      gap: 11,
      sensitivityNote: "위험 가중치를 높이면 순위가 바뀝니다.",
      computedAt: new Date().toISOString()
    },
    research: {
      jobId: "job1",
      status: "completed",
      summary: "직접 개발은 초기 비용이 높지만 장기 유지보수에 유리합니다.",
      findings: "",
      sourceCount: 7,
      updatedAt: new Date().toISOString()
    },
    recommendation: {
      summary: "기간을 정해 직접 개발을 조건부로 검증하는 것을 권합니다.",
      rationale: "장기 유지보수와 통제권 때문에 직접 개발이 유리합니다.",
      confidence: "medium",
      assumptions: [],
      counterpoints: ["외주가 더 빠르다는 의견 → 초기 출시는 빠르나 유지보수 비용이 커집니다."],
      switchCondition: "3개월 내 채용이 실패하면 외주로 전환합니다.",
      firstAction: "채용 공고를 오늘 게시하세요.",
      updatedAt: new Date().toISOString()
    }
  } as unknown as Decision;
}

test("decision context summary grounds follow-up answers in the analysis", () => {
  const summary = buildDecisionContextSummary(sampleDecision(), null);
  assert.match(summary, /직접 개발과 외주/u); // problem
  assert.match(summary, /딥리서치 요약:/u); // research
  assert.match(summary, /1위 직접 개발\(82점\)/u); // simulation ranking
  assert.match(summary, /1·2위 격차 11점/u); // gap
  assert.match(summary, /최종 결론:/u); // conclusion
});

test("discussion messages forbid handing off to free chat and end with the question", () => {
  const messages = buildDecisionDiscussionMessages(
    sampleDecision(),
    null,
    "최악의 시나리오는 무엇인가요?",
    [
      { role: "ai", text: "핵심 결론: 직접 개발을 권합니다." },
      { role: "user", text: "왜죠?" }
    ]
  );
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /자유 대화에서 이어가라.*않는다/u);
  const last = messages[messages.length - 1];
  assert.equal(last.role, "user");
  assert.equal(last.content, "최악의 시나리오는 무엇인가요?");
  // Prior conversation is carried as alternating turns.
  assert.ok(messages.some((message) => message.role === "assistant"));
});

test("deterministic discussion answer stays grounded and never redirects to free chat", () => {
  const answer = buildDeterministicDiscussionAnswer(sampleDecision());
  assert.match(answer, /현재 결론은/u);
  assert.doesNotMatch(answer, /자유 대화|새 대화/u);
});
