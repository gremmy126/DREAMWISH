import assert from "node:assert/strict";
import {
  decideApiRequestAccess,
  isRetiredApiWrite
} from "../src/lib/auth/api-access-policy";

const paidClaims = { email: "owner@example.com", paid: true, entitled: true };

const RETIRED_PREFIX_SAMPLES = [
  "/api/automation/workflows",
  "/api/integrations/google/connect",
  "/api/crm/customers",
  "/api/erp/orders",
  "/api/business/plan",
  "/api/calendar/events",
  "/api/oauth/google/connect",
  "/api/workflow/workspaces",
  "/api/webhooks/automation/hook-1"
];

test("writes to retired feature APIs are refused with 410", () => {
  for (const path of RETIRED_PREFIX_SAMPLES) {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      assert.equal(isRetiredApiWrite(path, method), true, `${method} ${path}`);
      const decision = decideApiRequestAccess(path, method, paidClaims);
      assert.deepEqual(decision, {
        allowed: false,
        status: 410,
        code: "FEATURE_RETIRED"
      });
    }
  }
});

test("retired feature data stays readable for backup and export", () => {
  for (const path of RETIRED_PREFIX_SAMPLES) {
    assert.equal(isRetiredApiWrite(path, "GET"), false);
    assert.deepEqual(decideApiRequestAccess(path, "GET", paidClaims), { allowed: true });
  }
});

test("surviving feature APIs accept writes as before", () => {
  for (const path of [
    "/api/memory/candidates",
    "/api/ai/chat",
    "/api/files/folders",
    "/api/knowledge/notes",
    "/api/decisions",
    "/api/surveys",
    "/api/surveys/member/respond"
  ]) {
    assert.equal(isRetiredApiWrite(path, "POST"), false, path);
    assert.deepEqual(decideApiRequestAccess(path, "POST", paidClaims), { allowed: true });
  }
});

test("survey member endpoints require sign-in but not a paid subscription", () => {
  const freeMember = { email: "member@example.com", paid: false, entitled: false };
  assert.deepEqual(
    decideApiRequestAccess("/api/surveys/member", "GET", freeMember),
    { allowed: true }
  );
  assert.deepEqual(
    decideApiRequestAccess("/api/surveys/member/respond", "POST", freeMember),
    { allowed: true }
  );
  const anonymous = decideApiRequestAccess("/api/surveys/member", "GET", null);
  assert.equal(anonymous.allowed, false);
  if (!anonymous.allowed) assert.equal(anonymous.status, 401);
});
