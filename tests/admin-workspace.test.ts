import assert from "node:assert/strict";
import fs from "node:fs";

test("administrator workspace is server protected and exposes operational sections", () => {
  const page = fs.readFileSync("app/admin/page.tsx", "utf8");
  const shell = fs.readFileSync("components/Admin/AdminShell.tsx", "utf8");

  assert.match(page, /verifySessionToken/u);
  assert.match(page, /redirect\("\/"\)/u);
  for (const label of ["대시보드", "사용자", "구독·이용권", "쿠폰", "DLQ", "감사 로그", "시스템"]) {
    assert.match(shell, new RegExp(label));
  }
  // 자동화 페이지는 관리자 워크스페이스에서 제거되었다 (DLQ·감사 로그는 유지).
  assert.doesNotMatch(shell, /"automation"/u);
});

test("profile menu exposes administrator navigation only after server role verification", () => {
  const source = fs.readFileSync("components/layout/Topbar.tsx", "utf8");

  assert.match(source, /\/api\/auth\/me/u);
  assert.match(source, /관리자 페이지/u);
  assert.match(source, /account\?\.role === "admin"/u);
  assert.match(source, /href="\/admin"/u);
});

test("administrator user mutations require server guard, CSRF, exact confirmation, and last-admin protection", () => {
  const route = fs.readFileSync("app/api/admin/users/[userId]/actions/route.ts", "utf8");

  assert.match(route, /requireAdminContext/u);
  assert.match(route, /assertSameOriginMutation/u);
  assert.match(route, /confirmationPhrase/u);
  assert.match(route, /countActiveAdministrators/u);
  assert.match(route, /assertAdminMutationAllowed/u);
  assert.match(route, /appendAdminAuditEvent/u);
});

test("administrator audit and DLQ routes verify administrator role at route level", () => {
  const audit = fs.readFileSync("app/api/admin/audit-log/route.ts", "utf8");
  const dlq = fs.readFileSync("app/api/admin/automation/dlq/route.ts", "utf8");

  assert.match(audit, /requireAdminContext/u);
  assert.match(dlq, /requireAdminContext/u);
  assert.match(dlq, /maskSensitive/u);
  assert.match(dlq, /reexecuteDeadLetterJob/u);
});

test("administrator system diagnostics reveal configuration state without environment values", () => {
  const route = fs.readFileSync("app/api/admin/system/status/route.ts", "utf8");

  assert.match(route, /configured/u);
  assert.match(route, /KAKAO_CLIENT_ID/u);
  assert.match(route, /NAVER_CLIENT_ID/u);
  assert.doesNotMatch(route, /value:\s*process\.env/u);
});

