import assert from "node:assert/strict";
import {
  classifyQuestion,
  getChatExecutionPlan,
  getWebSearchQuery
} from "../src/lib/ai/question-classifier";

test("classifyQuestion routes general knowledge directly to the LLM", () => {
  for (const question of [
    "부동산 경매가 뭐야?",
    "React useEffect를 쉽게 설명해줘",
    "피타고라스 정리를 설명해줘",
    "이 문장을 영어로 번역해줘"
  ]) {
    assert.equal(classifyQuestion(question), "GENERAL");
    assert.deepEqual(getChatExecutionPlan(question), {
      intent: "GENERAL",
      shouldUseRag: false,
      shouldUseWeb: false
    });
  }
});

test("classifyQuestion routes personal workspace questions to local RAG", () => {
  for (const question of [
    "내 프로젝트 진행상황 요약해줘",
    "내 메모에서 부동산 관련 내용 찾아줘",
    "내 CRM 고객 정보 보여줘",
    "내가 작성한 Knowledge 문서 기반으로 설명해줘"
  ]) {
    assert.equal(classifyQuestion(question), "LOCAL");
    assert.deepEqual(getChatExecutionPlan(question), {
      intent: "LOCAL",
      shouldUseRag: true,
      shouldUseWeb: false
    });
  }
});

test("classifyQuestion routes current or latest questions to web search", () => {
  for (const question of [
    "오늘 원달러 환율 알려줘",
    "테슬라 오늘 주가 어때?",
    "Next.js 최신 버전 알려줘",
    "서울 날씨 지금 어때?"
  ]) {
    assert.equal(classifyQuestion(question), "WEB");
    assert.deepEqual(getChatExecutionPlan(question), {
      intent: "WEB",
      shouldUseRag: false,
      shouldUseWeb: true
    });
  }
});

test("getWebSearchQuery removes explicit web-search prefixes", () => {
  assert.equal(getWebSearchQuery("웹 검색: 부동산 경매"), "부동산 경매");
  assert.equal(getWebSearchQuery("web search latest Next.js"), "latest Next.js");
  assert.equal(getWebSearchQuery("오늘 환율 알려줘"), "오늘 환율 알려줘");
});
