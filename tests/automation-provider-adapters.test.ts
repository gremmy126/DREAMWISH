import assert from "node:assert/strict";
import { ACTION_DEFINITIONS, isActionExecutable } from "../src/lib/automation/registry/action-registry";

test("project management CRM commerce and payment actions with complete schemas have concrete adapters", () => {
  const coveredApps = new Set([
    "crm", "airtable", "trello", "asana", "jira", "linear",
    "hubspot", "salesforce", "stripe", "shopify"
  ]);
  const intentionallyUnavailable = new Set(["shopify.refund-order"]);
  const missing = ACTION_DEFINITIONS
    .filter((action) => coveredApps.has(action.appId))
    .filter((action) => !intentionallyUnavailable.has(action.adapterKey))
    .filter((action) => !isActionExecutable(action.appId, action.id, action.version))
    .map((action) => action.adapterKey);
  assert.deepEqual(missing, []);
  assert.equal(isActionExecutable("shopify", "refund-order"), false);
});

test("high-impact payment and commerce actions retain confirmation gates", () => {
  for (const key of [
    "stripe.refund",
    "stripe.cancel-payment",
    "stripe.cancel-subscription",
    "shopify.cancel-order",
    "shopify.update-inventory",
    "shopify.refund-order"
  ]) {
    const action = ACTION_DEFINITIONS.find((candidate) => candidate.adapterKey === key);
    assert.ok(action, key);
    assert.ok(["high", "critical"].includes(action!.riskLevel), key);
    assert.ok(action!.confirmationPhrase, key);
  }
});

test("publishing actions with provider-safe single-call or image-container flows have concrete adapters", () => {
  const supportedApps = new Set(["wordpress", "facebook", "instagram", "x", "linkedin"]);
  const providerLimited = new Set(["instagram.publish-reel", "instagram.publish-story"]);
  const missing = ACTION_DEFINITIONS
    .filter((action) => supportedApps.has(action.appId))
    .filter((action) => !providerLimited.has(action.adapterKey))
    .filter((action) => !isActionExecutable(action.appId, action.id, action.version))
    .map((action) => action.adapterKey);
  assert.deepEqual(missing, []);
  for (const key of providerLimited) {
    const [appId, actionId] = key.split(".");
    assert.equal(isActionExecutable(appId!, actionId!), false);
  }
});
