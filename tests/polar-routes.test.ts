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
});
