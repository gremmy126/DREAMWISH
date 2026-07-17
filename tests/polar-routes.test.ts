import assert from "node:assert/strict";
import fs from "node:fs";

test("Polar checkout binds customer identity to the verified owner", () => {
  assert.equal(fs.existsSync("app/api/billing/checkout/route.ts"), true);
  const source = fs.readFileSync("app/api/billing/checkout/route.ts", "utf8");
  assert.match(source, /requireOwnerContext/u);
  assert.match(source, /externalCustomerId:\s*owner\.uid/u);
  assert.match(source, /customerEmail:\s*owner\.email/u);
  assert.doesNotMatch(source, /body\.customerEmail|body\.externalCustomerId/u);
});

test("Polar checkout metadata omits coupon_redemption_id when no discount is prepared", () => {
  const { buildCheckoutMetadata } = require("../src/lib/billing/polar") as {
    buildCheckoutMetadata: (
      ownerId: string,
      couponRedemptionId?: string | null
    ) => Record<string, string>;
  };
  assert.deepEqual(buildCheckoutMetadata("owner-1"), { owner_id: "owner-1" });
  assert.deepEqual(buildCheckoutMetadata("owner-1", null), { owner_id: "owner-1" });
  assert.deepEqual(buildCheckoutMetadata("owner-1", ""), { owner_id: "owner-1" });
  assert.deepEqual(buildCheckoutMetadata("owner-1", "  "), { owner_id: "owner-1" });
  assert.deepEqual(buildCheckoutMetadata("owner-1", "redemption-9"), {
    owner_id: "owner-1",
    coupon_redemption_id: "redemption-9"
  });
  const route = fs.readFileSync("app/api/billing/checkout/route.ts", "utf8");
  assert.match(route, /buildCheckoutMetadata/u);
  assert.doesNotMatch(route, /coupon_redemption_id:.*\|\|\s*""/u);
});

test("Polar webhook uses the official signature adapter and fails closed", () => {
  assert.equal(fs.existsSync("app/api/webhooks/polar/route.ts"), true);
  const source = fs.readFileSync("app/api/webhooks/polar/route.ts", "utf8");
  assert.match(source, /Webhooks/u);
  assert.match(source, /POLAR_WEBHOOK_SECRET/u);
  assert.match(source, /if \(!webhookSecret\)/u);
  assert.doesNotMatch(source, /if \(secret &&/u);
});

test("Polar webhook payload maps external customer id and subscription state", () => {
  assert.equal(fs.existsSync("src/lib/billing/polar-event.ts"), true);
  const { extractPolarBillingEvent } = require("../src/lib/billing/polar-event") as {
    extractPolarBillingEvent: (payload: unknown) => {
      ownerId: string;
      eventType: string;
      polarCustomerId: string | null;
      polarSubscriptionId: string | null;
    } | null;
  };
  const event = extractPolarBillingEvent({
    type: "subscription.active",
    timestamp: "2026-07-13T09:00:00.000Z",
    data: {
      id: "subscription-1",
      customer: { id: "customer-1", external_id: "firebase-owner-1" }
    }
  });
  assert.deepEqual(event && {
    ownerId: event.ownerId,
    eventType: event.eventType,
    polarCustomerId: event.polarCustomerId,
    polarSubscriptionId: event.polarSubscriptionId
  }, {
    ownerId: "firebase-owner-1",
    eventType: "subscription.active",
    polarCustomerId: "customer-1",
    polarSubscriptionId: "subscription-1"
  });
});

test("Polar scheduled cancellation keeps access active and records its end state", () => {
  const { extractPolarBillingEvent } = require("../src/lib/billing/polar-event") as {
    extractPolarBillingEvent: (payload: unknown) => {
      eventType: string;
      cancelAtPeriodEnd: boolean;
      canceledAt: string | null;
      endsAt: string | null;
      currentPeriodEnd: string | null;
    } | null;
  };
  const event = extractPolarBillingEvent({
    type: "subscription.updated",
    timestamp: "2026-07-17T09:00:00.000Z",
    data: {
      id: "subscription-canceling",
      status: "active",
      cancel_at_period_end: true,
      canceled_at: "2026-07-17T09:00:00.000Z",
      ends_at: "2026-08-17T09:00:00.000Z",
      current_period_end: "2026-08-17T09:00:00.000Z",
      customer: { id: "customer-1", external_id: "firebase-owner-1" }
    }
  });

  assert.deepEqual(event && {
    eventType: event.eventType,
    cancelAtPeriodEnd: event.cancelAtPeriodEnd,
    canceledAt: event.canceledAt,
    endsAt: event.endsAt,
    currentPeriodEnd: event.currentPeriodEnd
  }, {
    eventType: "subscription.active",
    cancelAtPeriodEnd: true,
    canceledAt: "2026-07-17T09:00:00.000Z",
    endsAt: "2026-08-17T09:00:00.000Z",
    currentPeriodEnd: "2026-08-17T09:00:00.000Z"
  });
});

test("billing status and portal routes remain available to unpaid owners", () => {
  for (const file of [
    "app/api/billing/status/route.ts",
    "app/api/billing/portal/route.ts"
  ]) {
    assert.equal(fs.existsSync(file), true, file);
    assert.match(fs.readFileSync(file, "utf8"), /requireOwnerContext/u, file);
  }
  const env = fs.readFileSync(".env.example", "utf8");
  for (const variable of [
    "ADMIN_EMAILS",
    "POLAR_ACCESS_TOKEN",
    "POLAR_PRODUCT_ID",
    "POLAR_WEBHOOK_SECRET",
    "POLAR_SERVER"
  ]) {
    assert.match(env, new RegExp(variable, "u"));
  }

  const portal = fs.readFileSync("app/api/billing/portal/route.ts", "utf8");
  assert.match(portal, /\?view=settings&billing=return/u);
});
