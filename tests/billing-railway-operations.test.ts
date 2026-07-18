import assert from "node:assert/strict";
import fs from "node:fs";

test("PortOne Railway guide lists required variables and webhook paths without secrets", () => {
  const guide = fs.readFileSync("docs/railway-portone-billing.md", "utf8");
  const env = fs.readFileSync(".env.example", "utf8");
  for (const name of [
    "BILLING_DOMESTIC_MODE",
    "BILLING_PUBLIC_SANDBOX_ENABLED",
    "BILLING_DOMESTIC_PRIMARY_PROVIDER",
    "PORTONE_V2_STORE_ID",
    "PORTONE_V2_API_SECRET",
    "PORTONE_KPN_TEST_GENERAL_CHANNEL_KEY",
    "PORTONE_KPN_TEST_BILLING_CHANNEL_KEY",
    "PORTONE_V2_WEBHOOK_SECRET_TEST",
    "PORTONE_V1_IMP_CODE",
    "PORTONE_V1_API_KEY",
    "PORTONE_V1_API_SECRET",
    "PORTONE_KCP_V1_TEST_BILLING_CHANNEL_KEY"
  ]) {
    assert.match(guide, new RegExp(name, "u"), name);
    assert.match(env, new RegExp(name, "u"), name);
  }
  assert.match(guide, /\/api\/webhooks\/portone\/v2/u);
  assert.match(guide, /\/api\/webhooks\/portone\/v1/u);
  assert.doesNotMatch(guide, /PortOne [A-Za-z0-9_-]{20,}|imp_secret\s*=\s*[A-Za-z0-9]/u);
});

test("PostgreSQL verification script checks billing schema and rollback behavior", () => {
  const script = fs.readFileSync("scripts/verify-billing-postgres.mjs", "utf8");
  assert.match(script, /DATABASE_URL/u);
  assert.match(script, /billing_payment_attempts/u);
  assert.match(script, /billing_charge_jobs/u);
  assert.match(script, /ROLLBACK_SENTINEL/u);
});
