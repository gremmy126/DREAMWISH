import { NextResponse } from "next/server";
import { getAllAIModelTiers } from "@/src/lib/ai/ai-model-catalog";
import { OwnerContextError, requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getOwnerBalances } from "@/src/lib/billing/ai-credit-ledger";
import {
  getRecentUsageEvents,
  getUsageAggregates
} from "@/src/lib/billing/ai-usage-event.repository";

// Owner-scoped per-tier usage aggregates and recent events. Records carry token
// counts and the attributed provider/model only — never prompts, generated
// content, or credentials.
export async function GET(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const [aggregates, balances, recentEvents] = await Promise.all([
      getUsageAggregates(owner.uid),
      getOwnerBalances(owner.uid),
      getRecentUsageEvents(owner.uid, 20)
    ]);
    const usage = getAllAIModelTiers()
      .map((tier) => {
        const aggregate = aggregates.find((item) => item.tierId === tier.id);
        const balance = balances[tier.id];
        return {
          tierId: tier.id,
          label: tier.label,
          calls: aggregate?.calls || 0,
          inputTokens: aggregate?.inputTokens || 0,
          outputTokens: aggregate?.outputTokens || 0,
          totalTokens: aggregate?.totalTokens || 0,
          settledCredits: aggregate?.settledCredits || 0,
          remainingCredits: balance?.available || 0,
          lastUsedAt: aggregate?.lastUsedAt || null
        };
      })
      .filter((row) => row.calls > 0 || row.remainingCredits > 0);
    return NextResponse.json(
      { ok: true, data: { usage, recentEvents } },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const status = error instanceof OwnerContextError ? error.status : 503;
    return NextResponse.json(
      { ok: false, error: "사용량 정보를 불러올 수 없습니다." },
      { status }
    );
  }
}
