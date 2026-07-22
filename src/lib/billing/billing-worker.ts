import { getDomesticBillingConfig } from "./billing-config";
import { getBillingGateway } from "./billing-gateway.registry";
import {
  claimDueBillingJobs,
  completeBillingJob,
  deadLetterBillingJob,
  enqueueBillingChargeJob,
  retryBillingJob,
  type BillingChargeJob
} from "./billing-charge-queue.repository";
import { appendBillingEvent } from "./billing-event.repository";
import { getBillingMethodWithReference } from "./billing-method.repository";
import {
  createPaymentAttempt,
  transitionPaymentAttempt
} from "./payment-attempt.repository";
import {
  advanceSubscriptionPeriod,
  getDomesticSubscription,
  markSubscriptionPastDue
} from "./subscription.repository";
import { PortOneKpnV2Adapter } from "./portone/kpn-v2.adapter";
import { PortOneKcpV1Adapter } from "./portone/kcp-v1.adapter";
import { compactProviderPaymentId } from "./payment-id";
import { applyDomesticBillingPayment } from "./billing.repository";

export async function runBillingWorkerOnce(input: {
  workerId: string;
  now?: Date;
  limit?: number;
}) {
  const jobs = await claimDueBillingJobs(
    input.workerId,
    input.limit ?? 10,
    input.now ?? new Date()
  );
  for (const job of jobs) await processClaimedBillingJob(job, input.workerId);
  return jobs.length;
}

export async function processClaimedBillingJob(job: BillingChargeJob, workerId: string) {
  const lease = { jobId: job.id, workerId, fencingToken: job.fencingToken };
  let attemptId: string | null = null;
  try {
    const subscription = await getDomesticSubscription(job.subscriptionId);
    if (
      !subscription ||
      subscription.ownerId !== job.ownerId ||
      subscription.provider !== job.provider ||
      subscription.environment !== job.environment ||
      !["active", "past_due"].includes(subscription.status) ||
      subscription.cancelAtPeriodEnd
    ) {
      throw safeBillingError("SUBSCRIPTION_NOT_CHARGEABLE", "The subscription is not chargeable.");
    }
    const method = await getBillingMethodWithReference(subscription.billingMethodId, subscription.ownerId);
    if (!method || method.status !== "active" || method.provider !== subscription.provider) {
      throw safeBillingError("BILLING_METHOD_UNAVAILABLE", "The billing method is unavailable.");
    }

    const paymentId = compactProviderPaymentId(`dw${job.id.replace(/-/gu, "")}`);
    let attempt = await createPaymentAttempt({
      ownerId: job.ownerId,
      provider: subscription.provider,
      environment: subscription.environment,
      purpose: "subscription_charge",
      idempotencyKey: job.idempotencyKey,
      providerPaymentId: paymentId,
      expectedAmount: job.amount,
      orderName: "DREAMWISH 월간 구독",
      safeMetadata: { subscriptionId: subscription.id, merchantPaymentId: paymentId, periodEnd: subscription.currentPeriodEnd }
    });
    attemptId = attempt.id;
    if (["failed", "expired"].includes(attempt.status)) {
      throw safeBillingError("PAYMENT_ATTEMPT_TERMINAL", "The payment attempt cannot be resumed.");
    }
    if (attempt.status === "created") attempt = await transitionPaymentAttempt(attempt.id, "pending_provider");

    const config = getDomesticBillingConfig();
    const gateway = subscription.provider === "portone_kpn_v2"
      ? new PortOneKpnV2Adapter(config)
      : subscription.provider === "portone_kcp_v1"
        ? new PortOneKcpV1Adapter(config)
        : getBillingGateway(config, "existing_subscription", subscription.provider);
    if (attempt.status === "pending_provider") {
      const charge = await gateway.charge({
        ownerId: job.ownerId,
        paymentId,
        providerReference: method.providerReference,
        money: { amount: job.amount, currency: "KRW" },
        orderName: "DREAMWISH 월간 구독",
        environment: subscription.environment
      });
      attempt = await transitionPaymentAttempt(attempt.id, "verification_pending", { providerPaymentId: charge.paymentId });
    }
    const providerPaymentId = attempt.providerPaymentId || paymentId;
    const verified = await gateway.verifyPayment({
      providerPaymentId,
      expectedPaymentId: paymentId,
      expectedOwnerId: job.ownerId,
      expectedMoney: { amount: job.amount, currency: "KRW" },
      environment: subscription.environment
    });
    if (!['succeeded', 'test_succeeded'].includes(attempt.status)) {
      attempt = await transitionPaymentAttempt(attempt.id, subscription.environment === "live" ? "succeeded" : "test_succeeded");
    }
    await appendBillingEvent({
      ownerId: job.ownerId,
      provider: subscription.provider,
      environment: subscription.environment,
      eventType: "payment_confirmed",
      idempotencyKey: `payment:${subscription.provider}:${verified.providerPaymentId}`,
      amount: job.amount,
      currency: "KRW",
      occurredAt: verified.paidAt,
      safeMetadata: { orderName: "DREAMWISH 월간 구독", subscriptionId: subscription.id }
    });
    const chargedPeriodEnd = typeof attempt.safeMetadata.periodEnd === "string"
      ? attempt.safeMetadata.periodEnd
      : subscription.currentPeriodEnd;
    const followingPeriodEnd = addMonth(chargedPeriodEnd);
    const advanced = await advanceSubscriptionPeriod(
      subscription.id,
      chargedPeriodEnd,
      followingPeriodEnd
    );
    const effectiveSubscription = advanced || (subscription.currentPeriodEnd === followingPeriodEnd ? subscription : null);
    if (effectiveSubscription && subscription.environment === "live") {
      await applyDomesticBillingPayment({
        eventId: `payment:${subscription.provider}:${verified.providerPaymentId}`,
        ownerId: job.ownerId,
        provider: subscription.provider,
        environment: "live",
        subscriptionId: subscription.id,
        currentPeriodEnd: followingPeriodEnd,
        occurredAt: verified.paidAt
      });
    }
    if (effectiveSubscription && !effectiveSubscription.cancelAtPeriodEnd) {
      await enqueueBillingChargeJob({
        ownerId: job.ownerId,
        subscriptionId: subscription.id,
        provider: subscription.provider,
        environment: subscription.environment,
        idempotencyKey: `${subscription.id}:${followingPeriodEnd}`,
        amount: effectiveSubscription.amount,
        nextRunAt: followingPeriodEnd
      });
    }
    await completeBillingJob(lease, attempt.id);
  } catch (error) {
    const safe = normalizeBillingWorkerError(error);
    const terminal = job.attempt >= job.maxAttempts || ["SUBSCRIPTION_NOT_CHARGEABLE", "PAYMENT_ATTEMPT_TERMINAL"].includes(safe.code);
    if (attemptId && terminal) {
      await transitionPaymentAttempt(attemptId, "failed", {
        failureCode: safe.code,
        safeFailureMessage: safe.message
      }).catch(() => undefined);
    }
    if (terminal) {
      await deadLetterBillingJob(lease, safe);
      if (safe.code !== "SUBSCRIPTION_NOT_CHARGEABLE") {
        await markSubscriptionPastDue(job.subscriptionId, safe.message).catch(() => undefined);
      }
    } else {
      await retryBillingJob(
        lease,
        safe,
        new Date(Date.now() + Math.min(86_400_000, 60_000 * 2 ** job.attempt)).toISOString()
      );
    }
  }
}

function safeBillingError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

function normalizeBillingWorkerError(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code: unknown }).code).slice(0, 80)
      : "PAYMENT_PROVIDER_FAILED";
  const safeMessages: Record<string, string> = {
    SUBSCRIPTION_NOT_CHARGEABLE: "The subscription is not chargeable.",
    BILLING_METHOD_UNAVAILABLE: "The billing method is unavailable.",
    PAYMENT_ATTEMPT_TERMINAL: "The payment attempt cannot be resumed."
  };
  return { code, message: safeMessages[code] || "The payment provider could not complete the charge." };
}

function addMonth(value: string) {
  const date = new Date(value);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString();
}
