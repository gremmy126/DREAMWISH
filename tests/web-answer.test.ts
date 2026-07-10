import assert from "node:assert/strict";
import {
  buildWebAnswerMessages,
  buildWebAnswerReferences,
  selectWebAnswerContext
} from "../src/lib/ai/web-answer";

const duplicatedResults = [
  {
    title: "부동산 경매 절차",
    url: "https://example.com/auction",
    snippet: "부동산 경매는 채무 부동산을 법원이 매각하는 절차입니다."
  },
  {
    title: "부동산 경매 절차",
    url: "https://example.com/auction",
    snippet: "중복 결과입니다."
  },
  {
    title: "권리분석 안내",
    url: "https://example.org/right-analysis",
    snippet: "입찰 전 권리분석과 임차인 현황을 확인해야 합니다."
  }
];

test("selectWebAnswerContext deduplicates results and keeps only question-relevant context", () => {
  const context = selectWebAnswerContext("부동산 경매가 뭐야?", duplicatedResults);

  assert.equal(context.length, 2);
  assert.equal(context[0].url, "https://example.com/auction");
  assert.equal(context[1].url, "https://example.org/right-analysis");
  assert.match(context[0].snippet, /법원이 매각/);
});

test("buildWebAnswerMessages forces synthesis instead of raw search result output", () => {
  const context = selectWebAnswerContext("부동산 경매가 뭐야?", duplicatedResults);
  const messages = buildWebAnswerMessages("부동산 경매가 뭐야?", context);
  const system = messages[0].content;
  const user = messages[1].content;

  assert.match(system, /검색 결과를 그대로 출력하지 않는다/);
  assert.match(system, /참고자료는 답변 마지막/);
  assert.match(system, /신뢰할 수 없는 외부 검색 자료/);
  assert.match(user, /질문:\s*부동산 경매가 뭐야\?/);
  assert.match(user, /검색 자료 1/);
  assert.doesNotMatch(user, /https:\/\/example\.com\/auction/);
});

test("buildWebAnswerReferences returns compact references for the final answer only", () => {
  const context = selectWebAnswerContext("부동산 경매가 뭐야?", duplicatedResults);
  const references = buildWebAnswerReferences(context);

  assert.deepEqual(references, [
    { label: "example.com", url: "https://example.com/auction" },
    { label: "example.org", url: "https://example.org/right-analysis" }
  ]);
});
