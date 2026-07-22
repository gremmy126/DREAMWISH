import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("sucrase/register/ts");
const moduleLoader = require("node:module");
const originalResolve = moduleLoader._resolveFilename;
moduleLoader._resolveFilename = function resolveProjectAlias(request, parent, isMain, options) {
  const mapped = request.startsWith("@/") ? path.join(process.cwd(), request.slice(2)) : request;
  return originalResolve.call(this, mapped, parent, isMain, options);
};

const { runBillingWorkerOnce } = require(path.join(process.cwd(), "src/lib/billing/billing-worker.ts"));
const { registerBillingWorker, heartbeatBillingWorker, stopBillingWorker } = require(path.join(process.cwd(), "src/lib/billing/billing-worker-heartbeat.repository.ts"));
const { getDomesticBillingConfig } = require(path.join(process.cwd(), "src/lib/billing/billing-config.ts"));
const { getDomesticPrimaryProvider } = require(path.join(process.cwd(), "src/lib/billing/billing-provider.repository.ts"));
const { listActiveSubscriptionProviders } = require(path.join(process.cwd(), "src/lib/billing/subscription.repository.ts"));
const once = process.argv.includes("--once");
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => controller.abort());

// 필수 변수가 없으면 크래시 루프(Railway CRASHED) 대신 유휴 대기한다.
// 결제 미구성은 정상적인 운영 상태일 수 있으므로 실패가 아니라 대기다.
// Railway에서 환경 변수를 추가하면 재배포되면서 자동으로 정상 기동한다.
async function idleUntilAborted(missing) {
  console.warn(`[billing-worker] not configured — idling without processing. missing: ${missing.join(", ")}`);
  if (once) {
    console.log("[billing-worker] processed=0 (not configured)");
    process.exit(0);
  }
  while (!controller.signal.aborted) {
    await new Promise((resolve) => setTimeout(resolve, 300_000));
    console.warn(`[billing-worker] still waiting for configuration: ${missing.join(", ")}`);
  }
  process.exit(0);
}

const missingBase = ["DATABASE_URL"].filter((name) => !process.env[name]?.trim());
if (process.env.NODE_ENV === "production" && ![
  process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY,
  process.env.OAUTH_TOKEN_ENCRYPTION_KEY,
  process.env.AUTH_SECRET
].some((value) => value && value.length >= 32)) {
  missingBase.push("INTEGRATION_TOKEN_ENCRYPTION_KEY_OR_OAUTH_TOKEN_ENCRYPTION_KEY");
}
if (missingBase.length) {
  await idleUntilAborted(missingBase);
}

const missingProviderVariables = new Set();
try {
  const billingConfig = getDomesticBillingConfig();
  const configuredPrimary = await getDomesticPrimaryProvider(billingConfig.primaryProvider);
  const activeProviders = await listActiveSubscriptionProviders();
  const requiredProviders = new Set(activeProviders.length ? activeProviders : [configuredPrimary]);
  for (const provider of requiredProviders) {
    const readiness = provider === "portone_kcp_v1"
      ? billingConfig.readiness.kcpRecurring
      : billingConfig.readiness.kpnRecurring;
    for (const name of readiness.missingVariables) missingProviderVariables.add(name);
  }
} catch (error) {
  console.error(`[billing-worker] configuration check failed: ${error instanceof Error ? error.message : error}`);
  await idleUntilAborted(["BILLING_CONFIGURATION"]);
}
if (missingProviderVariables.size) {
  await idleUntilAborted([...missingProviderVariables]);
}

const workerSeed = process.env.RAILWAY_REPLICA_ID || process.env.RAILWAY_SERVICE_ID || `local-${process.pid}`;
const workerId = `billing-${createHash("sha256").update(workerSeed).digest("hex").slice(0, 16)}`;
const version = process.env.RAILWAY_DEPLOYMENT_ID ? `1.0.0-${process.env.RAILWAY_DEPLOYMENT_ID.slice(0, 12)}` : "1.0.0";
let heartbeat;
try {
  await registerBillingWorker(workerId, version);
  heartbeat = setInterval(() => void heartbeatBillingWorker(workerId).catch(() => undefined), 10_000);
  do {
    const processed = await runBillingWorkerOnce({ workerId });
    if (once) {
      console.log(`[billing-worker] processed=${processed}`);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, processed > 0 ? 250 : 2_000));
  } while (!controller.signal.aborted);
} catch (error) {
  console.error(`[billing-worker] stopped: ${error instanceof Error ? error.name : "UNKNOWN"}`);
  process.exitCode = 1;
} finally {
  if (heartbeat) clearInterval(heartbeat);
  await stopBillingWorker(workerId).catch(() => undefined);
}
