import assert from "node:assert/strict";
import fs from "node:fs";

test("approval center implements warning, final confirmation, edit, defer and reject controls", () => {
  const source = fs.readFileSync("components/Automation/ApprovalCenter.tsx", "utf8");
  for (const text of ["계속 진행", "최종 승인하고 실행", "취소", "입력값 수정", "나중에 승인", "승인 만료 시간"]) {
    assert.match(source, new RegExp(text, "u"));
  }
  assert.match(source, /confirmationPhrase/u);
  assert.match(source, /disabled=/u);
});

test("execution detail exposes preview retries provider request and adapter telemetry", () => {
  const source = fs.readFileSync("components/Automation/DurableRunHistory.tsx", "utf8");
  const repository = fs.readFileSync("src/lib/automation/runtime/execution.repository.ts", "utf8");
  for (const text of ["Preview", "재시도", "API 요청 ID", "Rate Limit", "Adapter 지연", "입력", "출력"]) {
    assert.match(source, new RegExp(text, "u"));
  }
  assert.match(source, /step\.appId/u);
  assert.match(repository, /node\.app_id/u);
});

test("admin DLQ API checks administrator role and masks safe payload again", () => {
  const route = fs.readFileSync("app/api/automation/admin/dlq/route.ts", "utf8");
  const repository = fs.readFileSync("src/lib/automation/queue/dlq.repository.ts", "utf8");
  assert.match(route, /owner\.role !== "admin"/u);
  assert.match(repository, /maskAutomationSecrets/u);
  assert.match(route, /reexecuteDeadLetterJob/u);
});

test("durable automation API routes derive owner from the signed session", () => {
  for (const route of [
    "app/api/automation/approvals/route.ts",
    "app/api/automation/executions/route.ts",
    "app/api/automation/audit/route.ts"
  ]) {
    const source = fs.readFileSync(route, "utf8");
    assert.match(source, /requireOwnerContext\(request\)/u);
    assert.doesNotMatch(source, /x-owner-id/u);
  }
});

test("automation workspace exposes approval audit and administrator operations tabs", () => {
  const tabs = fs.readFileSync("components/Automation/AutomationTabs.tsx", "utf8");
  assert.match(tabs, /승인 센터/u);
  assert.match(tabs, /감사 로그/u);
  assert.match(tabs, /관리자 DLQ/u);
});

test("every branded automation surface consumes the shared AppLogo", () => {
  for (const file of [
    "components/Automation/AutomationView.tsx",
    "components/Automation/AutomationSecondaryViews.tsx",
    "components/Automation/ApprovalCenter.tsx",
    "components/Automation/DurableRunHistory.tsx"
  ]) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /components\/shared\/AppLogo/u, file);
    assert.doesNotMatch(source, /AutomationAppLogo/u, file);
  }
});
