export type BillingProvider =
  | "polar"
  | "portone_kpn_v2"
  | "portone_kcp_v1";

export type BillingEnvironment = "sandbox" | "live";
export type PaymentPurpose =
  | "general"
  | "subscription_setup"
  | "subscription_charge";
export type PaymentAttemptStatus =
  | "created"
  | "pending_provider"
  | "verification_pending"
  | "test_succeeded"
  | "succeeded"
  | "failed"
  | "expired";

export type Money = { amount: number; currency: "KRW" };

export type CreateCheckoutInput = {
  attemptId: string;
  ownerId: string;
  paymentId: string;
  purpose: PaymentPurpose;
  money: Money;
  orderName: string;
  environment: BillingEnvironment;
};

export type CheckoutSession = {
  paymentId: string;
  provider: BillingProvider;
  environment: BillingEnvironment;
  clientParameters: Record<string, unknown>;
};

export type IssueBillingMethodInput = {
  ownerId: string;
  issueId: string;
  environment: BillingEnvironment;
  providerReference?: string;
};

export type BillingMethodResult = {
  providerReference: string;
  issuedAt: string;
  card?: { brand?: string; last4?: string };
};

export type ChargeInput = {
  ownerId: string;
  paymentId: string;
  providerReference: string;
  money: Money;
  orderName: string;
  environment: BillingEnvironment;
};

export type ChargeResult = {
  paymentId: string;
  status: "pending" | "paid" | "failed";
};

export type CancelSubscriptionInput = {
  ownerId: string;
  subscriptionId: string;
  environment: BillingEnvironment;
};

export type CancelResult = { canceled: boolean };

export type RefundPaymentInput = {
  providerPaymentId: string;
  amount: number;
  reason: string;
  environment: BillingEnvironment;
};

export type RefundPaymentResult = {
  providerRefundId: string;
  amount: number;
  status: "succeeded" | "pending";
};

export type VerifyPaymentInput = {
  providerPaymentId: string;
  expectedPaymentId: string;
  expectedOwnerId: string;
  expectedMoney: Money;
  environment: BillingEnvironment;
};

export type VerifiedPayment = {
  providerPaymentId: string;
  paidAt: string;
  money: Money;
  status: "paid";
};

export interface BillingGateway {
  readonly provider: BillingProvider;
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;
  issueBillingMethod(input: IssueBillingMethodInput): Promise<BillingMethodResult>;
  charge(input: ChargeInput): Promise<ChargeResult>;
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;
  cancelSubscription(input: CancelSubscriptionInput): Promise<CancelResult>;
  verifyPayment(input: VerifyPaymentInput): Promise<VerifiedPayment>;
}
