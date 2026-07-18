import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { applyDomesticCancellation } from "@/src/lib/billing/billing.repository";
import { getDomesticBillingConfig } from "@/src/lib/billing/billing-config";
import { cancelPendingBillingJobs } from "@/src/lib/billing/billing-charge-queue.repository";
import { PortOneKcpV1Adapter } from "@/src/lib/billing/portone/kcp-v1.adapter";
import { PortOneKpnV2Adapter } from "@/src/lib/billing/portone/kpn-v2.adapter";
import { getDomesticSubscriptionByOwner, scheduleSubscriptionCancellation } from "@/src/lib/billing/subscription.repository";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    const current = await getDomesticSubscriptionByOwner(owner.uid);
    if (!current || !["active", "past_due"].includes(current.status)) {
      return NextResponse.json({ ok: false, error: "활성 국내 구독이 없습니다." }, { status: 404 });
    }
    const config = getDomesticBillingConfig();
    const gateway = current.provider === "portone_kpn_v2"
      ? new PortOneKpnV2Adapter(config)
      : new PortOneKcpV1Adapter(config);
    await gateway.cancelSubscription({
      ownerId: owner.uid, subscriptionId: current.id, environment: current.environment
    });
    const subscription = await scheduleSubscriptionCancellation(current.id, owner.uid);
    if (!subscription) return NextResponse.json({ ok: false, error: "구독 해지를 예약할 수 없습니다." }, { status: 409 });
    await cancelPendingBillingJobs(subscription.id);
    const entitlement = await applyDomesticCancellation({
      ownerId: owner.uid, subscriptionId: subscription.id, currentPeriodEnd: subscription.currentPeriodEnd
    });
    return NextResponse.json({ ok: true, subscription, entitlement });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;
    return NextResponse.json({ ok: false, error: "구독 해지를 예약하지 못했습니다." }, { status });
  }
}

