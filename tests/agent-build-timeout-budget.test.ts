import assert from "node:assert/strict";
import fs from "node:fs";

// AI Agent 생성이 앞단 프록시/CDN(예: Cloudflare 524는 100초)에서 "응답 시작"을
// 기다리다 502/504로 끊기던 문제: 이제 응답을 SSE 스트림으로 즉시 열고
// 하트비트를 보내며 생성한다. 준비/인증 오류만 일반 JSON으로 즉시 응답한다.
test("agent-build streams the response with heartbeats so proxies never time out", () => {
  const route = fs.readFileSync("app/api/ai/agent-build/route.ts", "utf8");
  assert.match(route, /new ReadableStream/u);
  assert.match(route, /text\/event-stream/u);
  assert.match(route, /: ping/u);
  assert.match(route, /setInterval\(/u);
  assert.match(route, /X-Accel-Buffering/u);
  // 최종 결과는 'result' 이벤트로 보낸다.
  assert.match(route, /event: result/u);
});

test("agent-build still uses a single short-timeout pass under a hard deadline", () => {
  const route = fs.readFileSync("app/api/ai/agent-build/route.ts", "utf8");
  const mainTimeout = Number(route.match(/MAIN_TIMEOUT_MS\s*=\s*([0-9_]+)/u)?.[1]?.replace(/_/gu, ""));
  const deadline = Number(route.match(/GENERATION_DEADLINE_MS\s*=\s*([0-9_]+)/u)?.[1]?.replace(/_/gu, ""));
  assert.ok(mainTimeout > 0 && mainTimeout <= 60_000, `main timeout must be short, got ${mainTimeout}`);
  assert.ok(deadline > mainTimeout, "deadline must sit above the main timeout");
  assert.match(route, /timeoutMs:\s*MAIN_TIMEOUT_MS/u);
  assert.match(route, /withDeadline\(/u);
  // 자동 2차(폴리시) 패스는 없다 — chatWithAI 는 정확히 한 번 호출된다.
  assert.doesNotMatch(route, /POLISH_PROMPT/u);
  assert.equal((route.match(/chatWithAI\(/gu) || []).length, 1);
  assert.doesNotMatch(route, /150_000/u);
  assert.doesNotMatch(route, /120_000/u);
});

test("agent-build maps every failure to a standard code and message", () => {
  const route = fs.readFileSync("app/api/ai/agent-build/route.ts", "utf8");
  assert.match(route, /AgentDeadlineError/u);
  assert.match(route, /AGENT_PROVIDER_TIMEOUT/u);
  assert.match(route, /AGENT_PROVIDER_AUTH_FAILED/u);
  assert.match(route, /AGENT_USAGE_LIMIT_EXCEEDED/u);
  assert.match(route, /AGENT_RESPONSE_INVALID/u);
  assert.match(route, /AGENT_VALIDATION_FAILED/u);
  assert.match(route, /function mapAgentError/u);
});

test("agent-build negotiates the response mode so old and new clients both work", () => {
  const route = fs.readFileSync("app/api/ai/agent-build/route.ts", "utf8");
  const view = fs.readFileSync("components/Agents/AgentStudio.tsx", "utf8");
  // 서버: Accept 헤더가 text/event-stream일 때만 스트리밍, 아니면 일반 JSON.
  // 배포 전후 클라이언트 버전이 섞여 있어도(스큐) 항상 파싱 가능한 응답을 준다.
  assert.match(route, /request\.headers\.get\("accept"\)/u);
  assert.match(route, /wantsStream/u);
  assert.match(route, /NextResponse\.json\(outcome\.payload,\s*\{\s*status:\s*outcome\.status\s*\}\)/u);
  // 두 모드가 같은 생성 결과를 공유한다.
  assert.match(route, /function runGeneration/u);
  // 클라이언트: 스트리밍을 명시적으로 요청한다.
  assert.match(view, /Accept:\s*"text\/event-stream"/u);
});

test("the client reads the SSE stream and handles both string and object errors", () => {
  const view = fs.readFileSync("components/Agents/AgentStudio.tsx", "utf8");
  assert.match(view, /readAgentBuildStream/u);
  assert.match(view, /text\/event-stream/u);
  assert.match(view, /getReader\(\)/u);
  // 스트리밍 응답은 200이므로 body.ok로 성공을 판정한다.
  assert.match(view, /body\.ok !== true/u);
  assert.match(view, /HTTP \$\{response\.status\}/u);
  // 문자열/객체 두 형태의 error를 모두 처리한다.
  assert.match(view, /typeof body\.error === "string"/u);
});
