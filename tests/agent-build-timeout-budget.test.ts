import assert from "node:assert/strict";
import fs from "node:fs";

// AI Agent 생성이 앞단 프록시/CDN(예: Cloudflare 524는 100초) 타임아웃 안에
// 반드시 JSON을 돌려주도록, 라우트가 전체 시간 예산을 지키는지 검증한다.
// (예산을 넘겨 하드 실패하면 클라이언트에는 원인 없는 "생성에 실패했습니다"만
//  뜬다.)
test("agent-build enforces an overall time budget under the gateway timeout", () => {
  const route = fs.readFileSync("app/api/ai/agent-build/route.ts", "utf8");

  const budget = Number(route.match(/OVERALL_BUDGET_MS\s*=\s*([0-9_]+)/u)?.[1]?.replace(/_/gu, ""));
  const mainTimeout = Number(route.match(/MAIN_TIMEOUT_MS\s*=\s*([0-9_]+)/u)?.[1]?.replace(/_/gu, ""));
  assert.ok(budget > 0 && budget <= 95_000, `overall budget must stay under ~100s, got ${budget}`);
  assert.ok(mainTimeout > 0 && mainTimeout < budget, "main timeout must fit inside the budget");

  // 메인 생성은 제한된 타임아웃으로 호출된다.
  assert.match(route, /timeoutMs:\s*MAIN_TIMEOUT_MS/u);
  // 예전의 과도한 고정 타임아웃(150s/120s)은 더 이상 사용하지 않는다.
  assert.doesNotMatch(route, /timeoutMs:\s*150_000/u);
  assert.doesNotMatch(route, /timeoutMs:\s*120_000/u);
});

test("the polish pass only runs when enough budget remains", () => {
  const route = fs.readFileSync("app/api/ai/agent-build/route.ts", "utf8");
  assert.match(route, /remainingBudgetMs\s*=\s*OVERALL_BUDGET_MS\s*-\s*\(Date\.now\(\)\s*-\s*startedAt\)/u);
  assert.match(route, /remainingBudgetMs\s*>\s*POLISH_MIN_REMAINING_MS/u);
  assert.match(route, /Math\.min\(POLISH_MAX_TIMEOUT_MS,\s*remainingBudgetMs\s*-\s*10_000\)/u);
});

test("agent-build always returns a JSON error with a code and retryable flag", () => {
  const route = fs.readFileSync("app/api/ai/agent-build/route.ts", "utf8");
  // 표준 오류 코드로 원인을 구분해 돌려준다.
  assert.match(route, /AGENT_PROVIDER_TIMEOUT/u);
  assert.match(route, /AGENT_PROVIDER_AUTH_FAILED/u);
  assert.match(route, /AGENT_USAGE_LIMIT_EXCEEDED/u);
  assert.match(route, /AGENT_RESPONSE_INVALID/u);
  assert.match(route, /ok:\s*false,\s*code,\s*retryable:\s*true/u);
});
