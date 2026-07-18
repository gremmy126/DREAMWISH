import { NextResponse } from "next/server";
import { requireAdminContext } from "@/src/lib/admin/admin-guard";
import { getAutomationWorkerHealth } from "@/src/lib/automation/queue/worker-heartbeat.repository";
import { getDomesticBillingConfig } from "@/src/lib/billing/billing-config";
import { getDomesticPrimaryProvider } from "@/src/lib/billing/billing-provider.repository";
import { getBillingWorkerHealth } from "@/src/lib/billing/billing-worker-heartbeat.repository";

export async function GET(request: Request) {
  await requireAdminContext(request);
  const configured = (names: string[]) => names.every((name) => Boolean(process.env[name]?.trim()));
  const automation = await getAutomationWorkerHealth();
  const domestic = getDomesticBillingConfig();
  const domesticProvider = await getDomesticPrimaryProvider(domestic.primaryProvider);
  const domesticReadiness = domesticProvider === "portone_kcp_v1"
    ? domestic.readiness.kcpRecurring
    : domestic.readiness.kpnRecurring;
  const billingConfigured = configured(["DATABASE_URL"]) && domestic.mode === "live" && domesticReadiness.ready;
  const billingWorker = billingConfigured
    ? await getBillingWorkerHealth().catch(() => ({ status: "offline" as const, lastSeenAt: null, version: null }))
    : { status: "offline" as const, lastSeenAt: null, version: null };
  return NextResponse.json({
    ok: true,
    services: [
      { id: "postgres", name: "PostgreSQL", configured: configured(["DATABASE_URL"]) },
      { id: "polar", name: "Polar", configured: configured(["POLAR_ACCESS_TOKEN", "POLAR_PRODUCT_ID", "POLAR_WEBHOOK_SECRET"]) },
      { id: "kakao", name: "Kakao OAuth", configured: configured(["KAKAO_CLIENT_ID", "KAKAO_CLIENT_SECRET", "KAKAO_REDIRECT_URI"]) },
      { id: "naver", name: "Naver OAuth", configured: configured(["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET", "NAVER_REDIRECT_URI"]) },
      { id: "firebase", name: "Firebase", configured: configured(["NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_PROJECT_ID"]) },
      {
        id: "domestic-billing",
        name: "Domestic Billing",
        configured: domesticReadiness.ready,
        health: domesticReadiness.ready ? "healthy" : "not_configured",
        provider: domesticProvider,
        mode: domestic.mode,
        missingVariables: domesticReadiness.missingVariables
      },
      {
        id: "billing-worker",
        name: "Billing Worker",
        configured: billingConfigured,
        health: billingConfigured ? billingWorker.status : "not_configured",
        lastSeenAt: billingWorker.lastSeenAt,
        version: billingWorker.version
      },
      {
        id: "automation",
        name: "Automation Worker",
        configured: automation.configured,
        health: automation.status,
        lastSeenAt: automation.lastSeenAt,
        lastSeenAgeSeconds: automation.lastSeenAgeSeconds,
        version: automation.version,
        versionCompatible: automation.versionCompatible,
        capabilities: automation.capabilities
      }
    ]
  });
}
