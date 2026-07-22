import { NextResponse } from "next/server";
import { getAllAIModelTiers } from "@/src/lib/ai/ai-model-catalog";
import { OwnerContextError, requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getOwnerBalances } from "@/src/lib/billing/ai-credit-ledger";
import { getDomesticBillingConfig } from "@/src/lib/billing/billing-config";

// Public AI credit products: the server-owned tier catalog plus the
// authenticated owner's per-tier balances. No credentials, model ids, or
// prices supplied by the client are ever trusted — everything comes from the
// server catalog and ledger.
export async function GET(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const balances = await getOwnerBalances(owner.uid);
    const config = getDomesticBillingConfig();
    const tiers = getAllAIModelTiers().map((tier) => ({
      id: tier.id,
      provider: tier.provider,
      label: tier.label,
      useCase: tier.useCase,
      priceKrwPerMillion: tier.priceKrwPerMillion,
      configured: tier.configured,
      balance: balances[tier.id] || { available: 0, reserved: 0, consumed: 0 }
    }));
    return NextResponse.json(
      { ok: true, data: { tiers, environment: config.mode } },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const status = error instanceof OwnerContextError ? error.status : 503;
    return NextResponse.json(
      { ok: false, error: "크레딧 상품 정보를 불러올 수 없습니다." },
      { status }
    );
  }
}
