import assert from "node:assert/strict";

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(values)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    run();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("live domestic billing refuses a public sandbox checkout", () => {
  const { getDomesticBillingConfig, isBillingError } = require("../src/lib/billing/billing-config") as {
    getDomesticBillingConfig: () => unknown;
    isBillingError: (error: unknown, code: string) => boolean;
  };

  withEnv(
    {
      BILLING_DOMESTIC_MODE: "live",
      BILLING_PUBLIC_SANDBOX_ENABLED: "true"
    },
    () => {
      assert.throws(
        () => getDomesticBillingConfig(),
        (error: unknown) => isBillingError(error, "PAYMENT_MODE_CONFLICT")
      );
    }
  );
});

test("KPN is the domestic default and KCP is never an automatic retry", () => {
  const { buildDomesticBillingConfig } = require("../src/lib/billing/billing-config") as {
    buildDomesticBillingConfig: (env: Record<string, string | undefined>) => any;
  };
  const { getBillingGateway } = require("../src/lib/billing/billing-gateway.registry") as {
    getBillingGateway: (config: any, use: string) => { provider: string };
  };
  const config = buildDomesticBillingConfig({
    BILLING_DOMESTIC_MODE: "sandbox",
    BILLING_DOMESTIC_PRIMARY_PROVIDER: "portone_kpn_v2"
  });

  assert.equal(getBillingGateway(config, "new_subscription").provider, "portone_kpn_v2");
  assert.equal(config.allowAutomaticCrossProviderRetry, false);
});

test("billing readiness exposes missing variable names but never secret values", () => {
  const { buildDomesticBillingConfig } = require("../src/lib/billing/billing-config") as {
    buildDomesticBillingConfig: (env: Record<string, string | undefined>) => any;
  };
  const config = buildDomesticBillingConfig({
    BILLING_DOMESTIC_MODE: "sandbox",
    PORTONE_V2_API_SECRET: "never-return-this-secret"
  });
  const serialized = JSON.stringify(config.readiness);

  assert.match(serialized, /PORTONE_V2_STORE_ID/u);
  assert.doesNotMatch(serialized, /never-return-this-secret/u);
});

