import { PortOneClient } from "@portone/server-sdk";
import type { DomesticBillingConfig } from "../billing-config";
import type {
  BillingGateway,
  BillingMethodResult,
  ChargeInput,
  CreateCheckoutInput,
  IssueBillingMethodInput,
  VerifyPaymentInput,
  CancelSubscriptionInput,
  RefundPaymentInput,
  VerifiedPayment
} from "../billing-gateway.types";
import { MAX_PROVIDER_PAYMENT_ID_LENGTH } from "../payment-id";

type PortOnePaymentClient = ReturnType<typeof PortOneClient>;

export class PortOneKpnV2Adapter implements BillingGateway {
  readonly provider = "portone_kpn_v2" as const;
  private readonly client: PortOnePaymentClient;

  constructor(
    private readonly config: DomesticBillingConfig,
    client?: PortOnePaymentClient
  ) {
    const secret = config.values.v2ApiSecret;
    if (!secret && !client) throw new Error("PORTONE_V2_API_SECRET is required.");
    this.client = client || PortOneClient({ secret: secret! });
  }

  async createCheckout(input: CreateCheckoutInput) {
    const storeId = required(this.config.values.storeId, "PORTONE_V2_STORE_ID");
    const channelKey = required(this.config.values.kpnGeneralChannelKey, "PORTONE_KPN_GENERAL_CHANNEL_KEY");
    return {
      paymentId: input.paymentId,
      provider: this.provider,
      environment: input.environment,
      clientParameters: {
        storeId, channelKey, paymentId: input.paymentId, orderName: input.orderName,
        totalAmount: input.money.amount, currency: input.money.currency, payMethod: "CARD",
        customData: { ownerId: input.ownerId, attemptId: input.attemptId }
      }
    };
  }

  async issueBillingMethod(input: IssueBillingMethodInput): Promise<BillingMethodResult> {
    const reference = required(input.providerReference, "billingKey");
    const info = await this.client.payment.billingKey.getBillingKeyInfo({
      billingKey: reference,
      storeId: required(this.config.values.storeId, "PORTONE_V2_STORE_ID")
    });
    if (info.status !== "ISSUED") throw new Error("The billing key is not active.");
    return { providerReference: reference, issuedAt: "issuedAt" in info ? String(info.issuedAt) : new Date().toISOString() };
  }

  async charge(input: ChargeInput) {
    const request = buildKpnBillingChargeRequest({
      paymentId: input.paymentId,
      storeId: required(this.config.values.storeId, "PORTONE_V2_STORE_ID"),
      channelKey: required(this.config.values.kpnBillingChannelKey, "PORTONE_KPN_BILLING_CHANNEL_KEY"),
      billingKey: input.providerReference,
      orderName: input.orderName,
      amount: input.money.amount,
      ownerId: input.ownerId
    });
    try {
      await this.client.payment.payWithBillingKey(request);
    } catch (error) {
      const existing = await this.client.payment.getPayment({ paymentId: input.paymentId }).catch(() => null);
      if (!existing) throw error;
    }
    return { paymentId: input.paymentId, status: "pending" as const };
  }

  async cancelSubscription(_input: CancelSubscriptionInput) {
    return { canceled: true };
  }

  async refundPayment(input: RefundPaymentInput) {
    if (input.environment !== "live") throw new Error("Sandbox payments cannot be refunded.");
    const response = await this.client.payment.cancelPayment({
      paymentId: input.providerPaymentId,
      storeId: required(this.config.values.storeId, "PORTONE_V2_STORE_ID"),
      amount: input.amount,
      reason: input.reason.slice(0, 200),
      requester: "ADMIN"
    });
    const cancellation = response.cancellation;
    if (cancellation.status === "FAILED" || !("id" in cancellation)) {
      throw new Error("The KPN refund failed.");
    }
    return {
      providerRefundId: cancellation.id,
      amount: "totalAmount" in cancellation ? Number(cancellation.totalAmount) : input.amount,
      status: cancellation.status === "SUCCEEDED" ? "succeeded" as const : "pending" as const
    };
  }

  async revokeBillingReference(providerReference: string) {
    await this.client.payment.billingKey.deleteBillingKey({
      billingKey: providerReference,
      storeId: required(this.config.values.storeId, "PORTONE_V2_STORE_ID"),
      reason: "Sandbox test completed"
    });
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifiedPayment> {
    const payment = await this.client.payment.getPayment({ paymentId: input.providerPaymentId });
    if (!payment) throw new Error("The provider payment was not found.");
    return verifyKpnPaymentRecord(payment, {
      paymentId: input.expectedPaymentId,
      storeId: required(this.config.values.storeId, "PORTONE_V2_STORE_ID"),
      amount: input.expectedMoney.amount,
      currency: input.expectedMoney.currency,
      environment: input.environment,
      ownerId: input.expectedOwnerId
    });
  }
}

export function buildKpnBillingChargeRequest(input: {
  paymentId: string; storeId: string; channelKey: string; billingKey: string;
  orderName: string; amount: number; ownerId: string;
}) {
  assertProviderId(input.paymentId);
  return {
    paymentId: input.paymentId,
    storeId: input.storeId,
    channelKey: input.channelKey,
    billingKey: input.billingKey,
    orderName: input.orderName,
    amount: { total: input.amount },
    currency: "KRW" as const,
    customData: JSON.stringify({ ownerId: input.ownerId })
  };
}

export function verifyKpnPaymentRecord(
  payment: Record<string, any>,
  expected: {
    paymentId: string; storeId: string; amount: number; currency: "KRW";
    environment: "sandbox" | "live"; ownerId?: string;
  }
): VerifiedPayment {
  const channelType = expected.environment === "sandbox" ? "TEST" : "LIVE";
  if (
    payment.status !== "PAID" || payment.id !== expected.paymentId ||
    payment.storeId !== expected.storeId || Number(payment.amount?.total) !== expected.amount ||
    payment.currency !== expected.currency || payment.channel?.type !== channelType
  ) throw new Error("The provider payment did not match the server-owned attempt.");
  if (expected.ownerId && payment.customData) {
    const custom = parseCustomData(payment.customData);
    if (custom.ownerId !== expected.ownerId) throw new Error("The payment owner did not match.");
  }
  return {
    providerPaymentId: payment.id,
    paidAt: String(payment.paidAt),
    money: { amount: Number(payment.amount.total), currency: "KRW" },
    status: "paid"
  };
}

function parseCustomData(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
  }
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
function assertProviderId(value: string) {
  if (!/^[A-Za-z0-9]+$/u.test(value)) throw new Error("Provider IDs must be ASCII alphanumeric.");
  // KPN(MxIssueNO 등)은 가맹점 주문번호를 최대 32바이트로 제한한다. 초과하면
  // PG 결제창에서 9104로 실패하므로, 보내기 전에 서버에서 먼저 막는다.
  if (Buffer.byteLength(value, "utf8") > MAX_PROVIDER_PAYMENT_ID_LENGTH) {
    throw new Error(`Provider payment IDs must be ${MAX_PROVIDER_PAYMENT_ID_LENGTH} bytes or fewer.`);
  }
}
function required(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
