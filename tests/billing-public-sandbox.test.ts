import assert from "node:assert/strict";
import fs from "node:fs";

test("public domestic checkout is sandbox-only and the server owns price and currency", () => {
  const source = fs.readFileSync("app/api/billing/domestic/checkout/route.ts", "utf8");
  assert.match(source, /publicSandboxEnabled/u);
  assert.match(source, /PUBLIC_SANDBOX_SKU/u);
  assert.doesNotMatch(source, /body\.(?:amount|currency|provider|environment)/u);
});

test("sandbox verification can only end in test_succeeded", () => {
  const { verifiedAttemptStatus } = require("../src/lib/billing/domestic-payment.service") as {
    verifiedAttemptStatus: (environment: string) => string;
  };
  assert.equal(verifiedAttemptStatus("sandbox"), "test_succeeded");
  assert.equal(verifiedAttemptStatus("live"), "succeeded");
});

test("public sandbox verification never mutates entitlement or confirmed revenue", () => {
  const source = fs.readFileSync("src/lib/billing/domestic-payment.service.ts", "utf8");
  const sandboxBranch = source.slice(source.indexOf("attempt.environment === \"sandbox\""));
  assert.match(sandboxBranch, /test_succeeded/u);
  assert.doesNotMatch(sandboxBranch.split("return")[0] || "", /applyDomesticEntitlement|payment_confirmed|consume/u);
});

