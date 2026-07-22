import assert from "node:assert/strict";
import fs from "node:fs";

// AI Agent 생성이 앞단 프록시/CDN(예: Cloudflare 524는 100초) 타임아웃 안에
// 반드시 JSON을 돌려주도록, 라우트가 단일 패스 + 짧은 데드라인을 지키는지
// 검증한다. (예산을 넘겨 하드 실패하면 클라이언트에는 원인 없는 "생성에
// 실패했습니다"만 뜬다.)
test("agent-build uses a short single-pass timeout and a hard deadline", () => {
  const route = fs.readFileSync("app/api/ai/agent-build/route.ts", "utf8");

  const mainTimeout = Number(route.match(/MAIN_TIMEOUT_MS\s*=\s*([0-9_]+)/u)?.[1]?.replace(/_/gu, ""));
  const deadline = Number(route.match(/GENERATION_DEADLINE_MS\s*=\s*([0-9_]+)/u)?.[1]?.replace(/_/gu, ""));
  assert.ok(mainTimeout > 0 && mainTimeout <= 60_000, `main timeout must be short, got ${mainTimeout}`);
  assert.ok(deadline > mainTimeout && deadline <= 90_000, `deadline must sit above the timeout and under the gateway, got ${deadline}`);

  // 메인 생성은 제한된 타임아웃 + 데드라인으로 호출된다.
  assert.match(route, /timeoutMs:\s*MAIN_TIMEOUT_MS/u);
  assert.match(route, /withDeadline\(/u);
  assert.match(route, /GENERATION_DEADLINE_MS/u);
  // 예전의 과도한 고정 타임아웃(150s/120s)은 더 이상 사용하지 않는다.
  assert.doesNotMatch(route, /150_000/u);
  assert.doesNotMatch(route, /120_000/u);
});

test("agent-build no longer runs an automatic second (polish) AI pass", () => {
  const route = fs.readFileSync("app/api/ai/agent-build/route.ts", "utf8");
  // 자동 2차 패스를 제거해 웹사이트 생성도 단일 호출로 끝난다(게이트웨이
  // 타임아웃 방지). 품질은 강한 시스템 프롬프트로 확보한다.
  assert.doesNotMatch(route, /POLISH_PROMPT/u);
  // 라우트 전체에서 chatWithAI 는 정확히 한 번만 호출된다(자동 2차 패스 없음).
  assert.equal((route.match(/chatWithAI\(/gu) || []).length, 1);
});

test("agent-build always returns a JSON error with a code and retryable flag", () => {
  const route = fs.readFileSync("app/api/ai/agent-build/route.ts", "utf8");
  assert.match(route, /AgentDeadlineError/u);
  assert.match(route, /AGENT_PROVIDER_TIMEOUT/u);
  assert.match(route, /AGENT_PROVIDER_AUTH_FAILED/u);
  assert.match(route, /AGENT_USAGE_LIMIT_EXCEEDED/u);
  assert.match(route, /AGENT_RESPONSE_INVALID/u);
  assert.match(route, /ok:\s*false,\s*code,\s*retryable:\s*true/u);
});

test("the client surfaces the HTTP status when the server returns no JSON error", () => {
  const view = fs.readFileSync("components/Agents/AgentStudio.tsx", "utf8");
  assert.match(view, /HTTP \$\{response\.status\}/u);
});
