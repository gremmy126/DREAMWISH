import { applyDomesticBillingPayment } from "./billing.repository";
import { getDomesticBillingConfig } from "./billing-config";
import { appendBillingEvent } from "./billing-event.repository";
import { verifiedAttemptStatus } from "./domestic-payment.service";
import {
  getPaymentAttemptByProviderPayment,
  transitionPaymentAttempt
} from "./payment-attempt.repository";
import { PortOneKcpV1Adapter } from "./portone/kcp-v1.adapter";
import { PortOneKpnV2Adapter } from "./portone/kpn-v2.adapter";
import { getDomesticSubscription } from "./subscription.repository";
import {
  completeBillingWebhook,
  failBillingWebhook,
  receiveBillingWebhook,
  type NormalizedBillingWebhook
} from "./billing-webhook.repository";

export async function processBillingWebhook(webhook: NormalizedBillingWebhook) {
  const received = await receiveBillingWebhook(webhook);
  const inboxId = String(received.row.id);
  if (!received.inserted && String(received.row.status) === "processed") {
    return { duplicate: true, applied: false };
  }
  try {
    const attempt = await getPaymentAttemptByProviderPayment(
      webhook.provider,
      webhook.environment,
      webhook.providerPaymentId
    );
    if (!attempt) {
      await completeBillingWebhook(inboxId);
      return { duplicate: !received.inserted, applied: false };
    }
    if (["test_succeeded", "succeeded"].includes(attempt.status)) {
      await completeBillingWebhook(inboxId);
      return { duplicate: true, applied: false };
    }
    const config = getDomesticBillingConfig();
    const gateway = attempt.provider === "portone_kpn_v2"
      ? new PortOneKpnV2Adapter(config)
      : new PortOneKcpV1Adapter(config);
    const expectedPaymentId = attempt.provider === "portone_kcp_v1"
      ? String(attempt.safeMetadata.merchantPaymentId || "")
      : attempt.providerPaymentId!;
    const verified = await gateway.verifyPayment({
      providerPaymentId: webhook.providerPaymentId,
      expectedPaymentId,
      expectedOwnerId: attempt.ownerId,
      expectedMoney: { amount: attempt.expectedAmount, currency: attempt.currency },
      environment: attempt.environment
    });
    if (attempt.status === "pending_provider") {
      await transitionPaymentAttempt(attempt.id, "verification_pending", {
        providerPaymentId: webhook.providerPaymentId
      });
    }
    await transitionPaymentAttempt(attempt.id, verifiedAttemptStatus(attempt.environment));

    if (attempt.environment === "live") {
      const subscriptionId = String(attempt.safeMetadata.subscriptionId || "");
      const subscription = subscriptionId ? await getDomesticSubscription(subscriptionId, attempt.ownerId) : null;
      if (subscription) {
        const eventId = `payment:${attempt.provider}:${verified.providerPaymentId}`;
        await applyDomesticBillingPayment({
          eventId, ownerId: attempt.ownerId, provider: attempt.provider, environment: "live",
          subscriptionId: subscription.id, currentPeriodEnd: subscription.currentPeriodEnd, occurredAt: verified.paidAt
        });
        await appendBillingEvent({
          ownerId: attempt.ownerId, provider: attempt.provider, environment: "live",
          eventType: "payment_confirmed", idempotencyKey: eventId,
          amount: attempt.expectedAmount, currency: "KRW", occurredAt: verified.paidAt,
          safeMetadata: { subscriptionId: subscription.id, orderName: attempt.orderName }
        });
      }
    }
    await completeBillingWebhook(inboxId);
    return { duplicate: !received.inserted, applied: true };
  } catch (error) {
    await failBillingWebhook(inboxId, "The provider payment could not be verified.");
    throw error;
  }
}

