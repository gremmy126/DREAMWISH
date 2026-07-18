import type { DomesticBillingConfig } from "../billing-config";
import type {
  BillingGateway, ChargeInput, CreateCheckoutInput, IssueBillingMethodInput,
  VerifyPaymentInput, VerifiedPayment, CancelSubscriptionInput, RefundPaymentInput
} from "../billing-gateway.types";
import { getPortOneV1AccessToken } from "./v1-access-token";
import { portOneJson } from "./portone-http";

type V1Envelope<T> = { code: number; message?: string; response?: T };

export class PortOneKcpV1Adapter implements BillingGateway {
  readonly provider = "portone_kcp_v1" as const;
  constructor(private readonly config: DomesticBillingConfig) {}

  async createCheckout(input: CreateCheckoutInput) {
    const customerUid = customerUidFromOwner(input.ownerId, input.attemptId);
    return {
      paymentId: input.paymentId,
      provider: this.provider,
      environment: input.environment,
      clientParameters: buildKcpBillingKeyRequest({
        channelKey: required(this.config.values.kcpBillingChannelKey, "PORTONE_KCP_V1_BILLING_CHANNEL_KEY"),
        customerUid,
        merchantUid: input.paymentId,
        buyerEmail: "",
        redirectUrl: `${process.env.APP_URL || "http://localhost:3100"}/billing/success`
      })
    };
  }

  async issueBillingMethod(input: IssueBillingMethodInput) {
    const customerUid = required(input.providerReference, "customer_uid");
    const token = await this.token();
    const response = await portOneJson<V1Envelope<Record<string, unknown>>>({
      url: `https://api.iamport.kr/subscribe/customers/${encodeURIComponent(customerUid)}`,
      headers: { Authorization: token }
    });
    if (response.code !== 0 || !response.response) throw new Error("The KCP billing reference could not be verified.");
    return { providerReference: customerUid, issuedAt: new Date().toISOString() };
  }

  async charge(input: ChargeInput) {
    const token = await this.token();
    const response = await portOneJson<V1Envelope<{ imp_uid?: string; merchant_uid?: string; status?: string }>>({
      url: "https://api.iamport.kr/subscribe/payments/again",
      method: "POST",
      headers: { Authorization: token },
      body: {
        customer_uid: input.providerReference,
        merchant_uid: input.paymentId,
        amount: input.money.amount,
        name: input.orderName,
        custom_data: JSON.stringify({ ownerId: input.ownerId })
      }
    });
    let payment = response.response;
    if (response.code !== 0 || !payment?.imp_uid) {
      const recovered = await portOneJson<V1Envelope<{ imp_uid?: string; merchant_uid?: string; status?: string }>>({
        url: `https://api.iamport.kr/payments/find/${encodeURIComponent(input.paymentId)}`,
        headers: { Authorization: token }
      });
      payment = recovered.code === 0 && recovered.response?.merchant_uid === input.paymentId ? recovered.response : undefined;
    }
    if (!payment?.imp_uid) throw new Error("The KCP recurring charge failed.");
    return { paymentId: payment.imp_uid, status: payment.status === "paid" ? "paid" as const : "pending" as const };
  }

  async cancelSubscription(_input: CancelSubscriptionInput) { return { canceled: true }; }

  async refundPayment(input: RefundPaymentInput) {
    if (input.environment !== "live") throw new Error("Sandbox payments cannot be refunded.");
    const token = await this.token();
    const response = await portOneJson<V1Envelope<Record<string, any>>>(
      {
        url: "https://api.iamport.kr/payments/cancel",
        method: "POST",
        headers: { Authorization: token },
        body: {
          imp_uid: input.providerPaymentId,
          amount: input.amount,
          reason: input.reason.slice(0, 200)
        }
      }
    );
    const payment = response.response;
    if (response.code !== 0 || !payment || !["paid", "cancelled"].includes(String(payment.status))) {
      throw new Error("The KCP refund failed.");
    }
    const cancellation = Array.isArray(payment.cancel_history)
      ? payment.cancel_history[payment.cancel_history.length - 1]
      : null;
    return {
      providerRefundId: String(cancellation?.pg_tid || cancellation?.receipt_url || `${input.providerPaymentId}:${input.amount}`),
      amount: Number(cancellation?.amount || input.amount),
      status: "succeeded" as const
    };
  }

  async revokeBillingReference(providerReference: string) {
    const token = await this.token();
    await portOneJson<V1Envelope<Record<string, unknown>>>({
      url: `https://api.iamport.kr/subscribe/customers/${encodeURIComponent(providerReference)}`,
      method: "DELETE",
      headers: { Authorization: token }
    });
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifiedPayment> {
    const token = await this.token();
    const response = await portOneJson<V1Envelope<Record<string, any>>>({
      url: `https://api.iamport.kr/payments/${encodeURIComponent(input.providerPaymentId)}`,
      headers: { Authorization: token }
    });
    const payment = response.response;
    if (
      response.code !== 0 || !payment || payment.status !== "paid" ||
      payment.imp_uid !== input.providerPaymentId || payment.merchant_uid !== input.expectedPaymentId ||
      Number(payment.amount) !== input.expectedMoney.amount || payment.currency !== input.expectedMoney.currency ||
      !String(payment.pg_provider || "").toLowerCase().includes("kcp")
    ) throw new Error("The KCP payment did not match the server-owned attempt.");
    const custom = parseCustomData(payment.custom_data);
    if (custom.ownerId !== input.expectedOwnerId) throw new Error("The KCP payment owner did not match.");
    return {
      providerPaymentId: String(payment.imp_uid),
      paidAt: new Date(Number(payment.paid_at) * 1000).toISOString(),
      money: { amount: Number(payment.amount), currency: "KRW" },
      status: "paid"
    };
  }

  private async token() {
    return getPortOneV1AccessToken({
      apiKey: required(this.config.values.v1ApiKey, "PORTONE_V1_API_KEY"),
      apiSecret: required(this.config.values.v1ApiSecret, "PORTONE_V1_API_SECRET")
    });
  }
}

export function buildKcpBillingKeyRequest(input: {
  channelKey: string; customerUid: string; merchantUid: string;
  buyerEmail: string; redirectUrl: string;
}) {
  return {
    channelKey: input.channelKey,
    pay_method: "card",
    merchant_uid: input.merchantUid,
    name: "DREAMWISH 정기결제",
    amount: 0,
    customer_uid: input.customerUid,
    buyer_email: input.buyerEmail,
    buyer_name: "DREAMWISH 사용자",
    m_redirect_url: input.redirectUrl
  };
}

function customerUidFromOwner(ownerId: string, suffix: string) {
  return `dw${ownerId}${suffix}`.replace(/[^A-Za-z0-9]/gu, "").slice(0, 60);
}
function required(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
function parseCustomData(value: unknown): Record<string, unknown> {
  if (typeof value === "string") { try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; } }
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
