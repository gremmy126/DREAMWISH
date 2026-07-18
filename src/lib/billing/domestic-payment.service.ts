import { getDomesticBillingConfig } from "./billing-config";
import { getBillingGateway } from "./billing-gateway.registry";
import type { BillingEnvironment, PaymentAttemptStatus } from "./billing-gateway.types";
import { getPaymentAttempt, transitionPaymentAttempt } from "./payment-attempt.repository";
import { PortOneKpnV2Adapter } from "./portone/kpn-v2.adapter";

export function verifiedAttemptStatus(environment: BillingEnvironment): PaymentAttemptStatus {
  return environment === "sandbox" ? "test_succeeded" : "succeeded";
}

export async function verifyDomesticPayment(input: {
  ownerId: string;
  attemptId: string;
  providerPaymentId: string;
}) {
  const attempt = await getPaymentAttempt(input.attemptId, input.ownerId);
  if (!attempt) throw new Error("Payment attempt was not found.");
  if (attempt.providerPaymentId !== input.providerPaymentId) {
    throw new Error("The payment identifier did not match the attempt.");
  }
  if (["test_succeeded", "succeeded"].includes(attempt.status)) return attempt;
  if (attempt.status !== "pending_provider") throw new Error("Payment attempt is not awaiting verification.");

  await transitionPaymentAttempt(attempt.id, "verification_pending");
  const config = getDomesticBillingConfig();
  const gateway = attempt.provider === "portone_kpn_v2"
    ? new PortOneKpnV2Adapter(config)
    : getBillingGateway(config, "existing_subscription", attempt.provider);
  await gateway.verifyPayment({
    providerPaymentId: input.providerPaymentId,
    expectedPaymentId: attempt.providerPaymentId,
    expectedOwnerId: attempt.ownerId,
    expectedMoney: { amount: attempt.expectedAmount, currency: attempt.currency },
    environment: attempt.environment
  });

  if (attempt.environment === "sandbox") {
    return transitionPaymentAttempt(attempt.id, "test_succeeded");
  }
  return transitionPaymentAttempt(attempt.id, verifiedAttemptStatus(attempt.environment));
}

