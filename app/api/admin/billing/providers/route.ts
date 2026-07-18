import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext } from "@/src/lib/admin/admin-guard";
import { getDomesticBillingConfig } from "@/src/lib/billing/billing-config";
import { getDomesticPrimaryProvider, setDomesticPrimaryProvider } from "@/src/lib/billing/billing-provider.repository";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

const updateSchema = z.object({
  provider: z.enum(["portone_kpn_v2", "portone_kcp_v1"]),
  confirmation: z.literal("NEW_SUBSCRIPTIONS_ONLY")
}).strict();

export async function GET(request: Request) {
  await requireAdminContext(request);
  const config = getDomesticBillingConfig();
  const primaryProvider = await getDomesticPrimaryProvider(config.primaryProvider);
  return NextResponse.json({
    ok: true,
    mode: config.mode,
    primaryProvider,
    allowAutomaticCrossProviderRetry: false,
    providers: {
      portone_kpn_v2: {
        ready: config.readiness.kpnGeneral.ready && config.readiness.kpnRecurring.ready,
        generalReady: config.readiness.kpnGeneral.ready,
        recurringReady: config.readiness.kpnRecurring.ready,
        missingVariables: [...new Set([...config.readiness.kpnGeneral.missingVariables, ...config.readiness.kpnRecurring.missingVariables])]
      },
      portone_kcp_v1: {
        ready: config.readiness.kcpRecurring.ready,
        recurringReady: config.readiness.kcpRecurring.ready,
        missingVariables: config.readiness.kcpRecurring.missingVariables
      }
    },
    webhooks: { v2Ready: config.readiness.webhookV2.ready, missingVariables: config.readiness.webhookV2.missingVariables }
  });
}

export async function POST(request: Request) {
  assertSameOriginMutation(request);
  const admin = await requireAdminContext(request);
  const input = updateSchema.parse(await request.json());
  const config = getDomesticBillingConfig();
  const readiness = input.provider === "portone_kpn_v2" ? config.readiness.kpnRecurring : config.readiness.kcpRecurring;
  if (!readiness.ready) {
    return NextResponse.json({ ok: false, error: "선택한 결제 공급자가 준비되지 않았습니다.", missingVariables: readiness.missingVariables }, { status: 409 });
  }
  const primaryProvider = await setDomesticPrimaryProvider({ provider: input.provider, actorId: admin.uid });
  return NextResponse.json({ ok: true, primaryProvider, appliesTo: "new_subscriptions_only" });
}

