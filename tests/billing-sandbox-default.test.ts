import assert from "node:assert/strict";
import {
  BillingConfigurationError,
  buildDomesticBillingConfig
} from "../src/lib/billing/billing-config";

const SANDBOX_KEYS = {
  PORTONE_V2_STORE_ID: "store-test",
  PORTONE_V2_API_SECRET: "secret-test",
  PORTONE_KPN_TEST_GENERAL_CHANNEL_KEY: "channel-test"
};

// 테스트 키만 넣으면 결제창을 바로 확인할 수 있어야 한다 — 샌드박스 모드는
// 플래그 미설정 시 기본 허용이다 (샌드박스 결제는 권한·매출을 바꾸지 않는다).
test("sandbox checkout is enabled by default once the test keys exist", () => {
  const config = buildDomesticBillingConfig({ ...SANDBOX_KEYS });
  assert.equal(config.mode, "sandbox");
  assert.equal(config.publicSandboxEnabled, true);
  assert.equal(config.readiness.kpnGeneral.ready, true);
});

test("an explicit false flag still disables public sandbox checkout", () => {
  const config = buildDomesticBillingConfig({
    ...SANDBOX_KEYS,
    BILLING_PUBLIC_SANDBOX_ENABLED: "false"
  });
  assert.equal(config.publicSandboxEnabled, false);
});

test("live mode keeps the old strict behavior", () => {
  // 미설정이면 비활성 (기본 허용은 샌드박스에만 적용).
  const live = buildDomesticBillingConfig({ BILLING_DOMESTIC_MODE: "live" });
  assert.equal(live.publicSandboxEnabled, false);
  // live에서 공개 샌드박스를 켜는 것은 여전히 설정 충돌이다.
  assert.throws(
    () =>
      buildDomesticBillingConfig({
        BILLING_DOMESTIC_MODE: "live",
        BILLING_PUBLIC_SANDBOX_ENABLED: "true"
      }),
    BillingConfigurationError
  );
});
