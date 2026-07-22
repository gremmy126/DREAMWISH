import { z } from "zod";
import type { BillingEnvironment, BillingProvider } from "./billing-gateway.types";

const truthy = new Set(["1", "true", "yes", "on"]);
const providerSchema = z.enum(["portone_kpn_v2", "portone_kcp_v1"]);
const modeSchema = z.enum(["sandbox", "live"]);

const REQUIRED_BY_CAPABILITY = {
  kpnGeneral: ["PORTONE_V2_STORE_ID", "PORTONE_V2_API_SECRET", "PORTONE_KPN_TEST_GENERAL_CHANNEL_KEY"],
  kpnRecurring: ["PORTONE_V2_STORE_ID", "PORTONE_V2_API_SECRET", "PORTONE_KPN_TEST_BILLING_CHANNEL_KEY"],
  kcpRecurring: ["PORTONE_V1_IMP_CODE", "PORTONE_V1_API_KEY", "PORTONE_V1_API_SECRET", "PORTONE_KCP_V1_TEST_BILLING_CHANNEL_KEY"],
  webhookV2: ["PORTONE_V2_WEBHOOK_SECRET_TEST"]
} as const;

export class BillingConfigurationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "BillingConfigurationError";
  }
}

export type DomesticBillingConfig = {
  mode: BillingEnvironment;
  publicSandboxEnabled: boolean;
  primaryProvider: Exclude<BillingProvider, "polar">;
  allowAutomaticCrossProviderRetry: false;
  values: Readonly<{
    storeId?: string;
    v2ApiSecret?: string;
    kpnGeneralChannelKey?: string;
    kpnBillingChannelKey?: string;
    v2WebhookSecret?: string;
    v1ImpCode?: string;
    v1ApiKey?: string;
    v1ApiSecret?: string;
    kcpBillingChannelKey?: string;
  }>;
  readiness: Readonly<Record<keyof typeof REQUIRED_BY_CAPABILITY, { ready: boolean; missingVariables: string[] }>>;
};

export function getDomesticBillingConfig() {
  return buildDomesticBillingConfig(process.env);
}

// Single source for the monthly subscription charge: the live charge, sandbox
// display, coupon base, and server-side verification all resolve through here.
// BILLING_DOMESTIC_MONTHLY_AMOUNT_KRW overrides it; the default is KRW 5,000.
export const DEFAULT_DOMESTIC_MONTHLY_AMOUNT_KRW = 5000;

export function getDomesticMonthlyAmountKrw(): number {
  const value = Number(process.env.BILLING_DOMESTIC_MONTHLY_AMOUNT_KRW || DEFAULT_DOMESTIC_MONTHLY_AMOUNT_KRW);
  if (!Number.isSafeInteger(value) || value < 100) {
    throw new BillingConfigurationError(
      "BILLING_MONTHLY_AMOUNT_INVALID",
      "BILLING_DOMESTIC_MONTHLY_AMOUNT_KRW is invalid."
    );
  }
  return value;
}

export function buildDomesticBillingConfig(env: Record<string, string | undefined>): DomesticBillingConfig {
  const mode = modeSchema.catch("sandbox").parse(env.BILLING_DOMESTIC_MODE);
  // 샌드박스 모드에서는 테스트 키만 넣으면 바로 결제창을 확인할 수 있어야
  // 한다: 플래그 미설정 시 기본 허용, 명시적으로 false일 때만 비활성화.
  // (샌드박스 결제는 test_succeeded로만 끝나고 이용 권한·매출을 바꾸지 않는다.)
  // live 모드는 기존과 동일하게 명시적 true를 금지한다.
  const rawSandboxFlag = String(env.BILLING_PUBLIC_SANDBOX_ENABLED || "").trim();
  const publicSandboxEnabled =
    mode === "sandbox" ? (rawSandboxFlag ? parseBoolean(rawSandboxFlag) : true) : parseBoolean(rawSandboxFlag);
  if (mode === "live" && publicSandboxEnabled) {
    throw new BillingConfigurationError(
      "PAYMENT_MODE_CONFLICT",
      "Public sandbox checkout cannot run in live mode."
    );
  }

  const primaryProvider = providerSchema
    .catch("portone_kpn_v2")
    .parse(env.BILLING_DOMESTIC_PRIMARY_PROVIDER);
  const readiness = Object.fromEntries(
    Object.entries(REQUIRED_BY_CAPABILITY).map(([capability, names]) => {
      const resolved = names.map((name) => liveName(name, mode));
      const missingVariables = resolved.filter((name) => !env[name]?.trim());
      return [capability, { ready: missingVariables.length === 0, missingVariables }];
    })
  ) as DomesticBillingConfig["readiness"];

  return {
    mode,
    publicSandboxEnabled,
    primaryProvider,
    allowAutomaticCrossProviderRetry: false,
    values: {
      storeId: clean(env.PORTONE_V2_STORE_ID),
      v2ApiSecret: clean(env.PORTONE_V2_API_SECRET),
      kpnGeneralChannelKey: clean(env[liveName("PORTONE_KPN_TEST_GENERAL_CHANNEL_KEY", mode)]),
      kpnBillingChannelKey: clean(env[liveName("PORTONE_KPN_TEST_BILLING_CHANNEL_KEY", mode)]),
      v2WebhookSecret: clean(env[liveName("PORTONE_V2_WEBHOOK_SECRET_TEST", mode)]),
      v1ImpCode: clean(env.PORTONE_V1_IMP_CODE),
      v1ApiKey: clean(env.PORTONE_V1_API_KEY),
      v1ApiSecret: clean(env.PORTONE_V1_API_SECRET),
      kcpBillingChannelKey: clean(env[liveName("PORTONE_KCP_V1_TEST_BILLING_CHANNEL_KEY", mode)])
    },
    readiness
  };
}

export function requireBillingCapability(
  config: DomesticBillingConfig,
  capability: keyof typeof REQUIRED_BY_CAPABILITY
) {
  const status = config.readiness[capability];
  if (!status.ready) {
    throw new BillingConfigurationError(
      "PAYMENT_NOT_CONFIGURED",
      `Missing billing variables: ${status.missingVariables.join(", ")}`
    );
  }
}

export function isBillingError(error: unknown, code: string) {
  return error instanceof BillingConfigurationError && error.code === code;
}

function liveName(testName: string, mode: BillingEnvironment) {
  return mode === "live" ? testName.replace("_TEST_", "_LIVE_").replace(/_TEST$/u, "_LIVE") : testName;
}

function parseBoolean(value: string | undefined) {
  return truthy.has(String(value || "").trim().toLowerCase());
}

function clean(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

