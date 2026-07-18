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

const missingBase = ["DATABASE_URL"].filter((name) => !process.env[name]?.trim());
if (process.env.NODE_ENV === "production" && ![
  process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY,
  process.env.OAUTH_TOKEN_ENCRYPTION_KEY,
  process.env.AUTH_SECRET
].some((value) => value && value.length >= 32)) {
  missingBase.push("INTEGRATION_TOKEN_ENCRYPTION_KEY_OR_OAUTH_TOKEN_ENCRYPTION_KEY");
}
if (missingBase.length) {
  console.error(`[billing-worker] missing variables: ${missingBase.join(", ")}`);
  process.exit(1);
}

const billingConfig = getDomesticBillingConfig();
const configuredPrimary = await getDomesticPrimaryProvider(billingConfig.primaryProvider);
const activeProviders = await listActiveSubscriptionProviders();
const requiredProviders = new Set(activeProviders.length ? activeProviders : [configuredPrimary]);
const missingProviderVariables = new Set();
for (const provider of requiredProviders) {
  const readiness = provider === "portone_kcp_v1"
    ? billingConfig.readiness.kcpRecurring
    : billingConfig.readiness.kpnRecurring;
  for (const name of readiness.missingVariables) missingProviderVariables.add(name);
}
if (missingProviderVariables.size) {
  console.error(`[billing-worker] missing variables: ${[...missingProviderVariables].join(", ")}`);
  process.exit(1);
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
