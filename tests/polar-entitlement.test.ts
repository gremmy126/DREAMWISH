import assert from "node:assert/strict";
import fs from "node:fs";

test("unpaid users require payment while the verified administrator bypasses billing", () => {
  const { buildAccessState } = require("../src/lib/auth/access-control") as {
    buildAccessState: (input: { email: string; paid: boolean }) => {
      canUseApp: boolean;
      requiresPayment: boolean;
      adminBypass: boolean;
    };
  };

  assert.deepEqual(buildAccessState({ email: "member@example.com", paid: false }), {
    email: "member@example.com",
    role: "user",
    paid: false,
    adminBypass: false,
    canUseApp: false,
    requiresPayment: true
  });
  assert.equal(
    buildAccessState({ email: " KARA111131@NAVER.COM ", paid: false }).canUseApp,
    true
  );
});

test("protected API access returns 402 for an authenticated unpaid user", () => {
  const { decideApiAccess } = require("../src/lib/auth/api-access-policy") as {
    decideApiAccess: (
      path: string,
      claims: { email: string; paid: boolean } | null
    ) => unknown;
  };

  assert.deepEqual(
    decideApiAccess("/api/ai/chat", { email: "member@example.com", paid: false }),
    { allowed: false, status: 402, code: "PAYMENT_REQUIRED" }
  );
  assert.deepEqual(
    decideApiAccess("/api/billing/checkout", {
      email: "member@example.com",
      paid: false
    }),
    { allowed: true }
  );
});

test("billing event mapping revokes stale or failed subscriptions", () => {
  assert.equal(fs.existsSync("src/lib/billing/billing-event.ts"), true);
  const { statusFromPolarEvent } = require("../src/lib/billing/billing-event") as {
    statusFromPolarEvent: (type: string, current: string) => string;
  };

  assert.equal(statusFromPolarEvent("subscription.active", "none"), "active");
  assert.equal(statusFromPolarEvent("subscription.uncanceled", "canceled"), "active");
  assert.equal(statusFromPolarEvent("subscription.past_due", "active"), "past_due");
  assert.equal(statusFromPolarEvent("subscription.canceled", "active"), "canceled");
  assert.equal(statusFromPolarEvent("order.refunded", "active"), "revoked");
});

test("billing entitlement explicitly tracks scheduled cancellation", () => {
  const { emptyBillingEntitlement } = require("../src/lib/billing/billing.types") as {
    emptyBillingEntitlement: (ownerId: string) => Record<string, unknown>;
  };
  const entitlement = emptyBillingEntitlement("owner-1");
  assert.equal(entitlement.cancelAtPeriodEnd, false);
  assert.equal(entitlement.canceledAt, null);
  assert.equal(entitlement.endsAt, null);

  const repository = fs.readFileSync("src/lib/billing/billing.repository.ts", "utf8");
  assert.match(repository, /cancelAtPeriodEnd/u);
  assert.match(repository, /canceledAt/u);
  assert.match(repository, /endsAt/u);
});

test("entitled owner context rechecks durable billing state", () => {
  assert.equal(fs.existsSync("src/lib/auth/entitled-owner-context.ts"), true);
  const source = fs.readFileSync("src/lib/auth/entitled-owner-context.ts", "utf8");
  assert.match(source, /getBillingEntitlement/u);
  assert.match(source, /PAYMENT_REQUIRED/u);
  assert.match(source, /owner\.role === "admin"/u);
});

test("Firebase login and session routes derive effective access from billing and grants", () => {
  for (const file of ["app/api/auth/login/route.ts", "app/api/auth/session/route.ts"]) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /completePrimaryAuthentication/u, file);
    assert.match(source, /verified\.uid/u, file);
    assert.doesNotMatch(source, /paid:\s*result\.access\.paid/u, file);
  }
  const issuance = fs.readFileSync("src/lib/auth/session-issuance.service.ts", "utf8");
  assert.match(issuance, /getBillingEntitlement/u);
  assert.match(issuance, /hasEffectiveEntitlement/u);
  assert.match(issuance, /buildOperationalAccessState/u);
});
