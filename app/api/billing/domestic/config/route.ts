import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getDomesticBillingConfig } from "@/src/lib/billing/billing-config";
import { getDomesticPrimaryProvider } from "@/src/lib/billing/billing-provider.repository";

export async function GET(request: Request) {
  try {
    await requireOwnerContext(request);
    const config = getDomesticBillingConfig();
    const primaryProvider = await getDomesticPrimaryProvider(config.primaryProvider);
    const liveKpnReady = primaryProvider === "portone_kpn_v2" && config.readiness.kpnRecurring.ready;
    const liveKcpReady = primaryProvider === "portone_kcp_v1" && config.readiness.kcpRecurring.ready;
    const customerProvider = config.mode === "sandbox" ? "portone_kpn_v2" : primaryProvider;
    return NextResponse.json({
      ok: true,
      enabled: config.mode === "sandbox"
        ? config.publicSandboxEnabled && config.readiness.kpnGeneral.ready
        : liveKpnReady || liveKcpReady,
      environment: config.mode,
      provider: customerProvider,
      flow: customerProvider === "portone_kcp_v1" ? "v1" : "v2",
      generalReady: config.readiness.kpnGeneral.ready,
      recurringReady: config.readiness.kpnRecurring.ready,
      missingVariables: config.readiness.kpnGeneral.missingVariables
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, enabled: false, error: error instanceof Error ? error.message : "Domestic billing is unavailable." },
      { status: "status" in Object(error) ? Number((error as { status: number }).status) : 503 }
    );
  }
}
