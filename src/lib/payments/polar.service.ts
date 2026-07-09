import {
  buildPolarCheckoutBrand,
  POLAR_CHECKOUT_SETTINGS
} from "./polar.config";

export { buildPolarCheckoutBrand, POLAR_CHECKOUT_SETTINGS };

export type PolarCheckoutInput = {
  customerEmail?: string;
  customerName?: string;
  externalCustomerId?: string;
  customerIpAddress?: string;
};

export type PolarWebhookEvent = {
  type: string;
  data: Record<string, unknown>;
  receivedAt: string;
};

export function buildPolarCheckoutPayload(input: PolarCheckoutInput = {}) {
  const productId = getPolarProductId();
  const brand = buildPolarCheckoutBrand();
  return compactObject({
    products: productId ? [productId] : [],
    success_url: POLAR_CHECKOUT_SETTINGS.successUrl,
    return_url: POLAR_CHECKOUT_SETTINGS.returnUrl,
    customer_email: input.customerEmail,
    customer_name: input.customerName,
    external_customer_id: input.externalCustomerId,
    customer_ip_address: input.customerIpAddress,
    metadata: {
      provider: POLAR_CHECKOUT_SETTINGS.provider,
      plan: POLAR_CHECKOUT_SETTINGS.planName,
      amount_usd: POLAR_CHECKOUT_SETTINGS.amountUsd,
      brand_name: brand.name,
      customer_email: input.customerEmail || input.externalCustomerId || ""
    }
  });
}

export async function createPolarCheckoutSession(input: PolarCheckoutInput = {}) {
  const accessToken = process.env.POLAR_ACCESS_TOKEN || process.env.POLAR_API_KEY || "";
  const productId = getPolarProductId();
  if (!accessToken) throw new Error("POLAR_ACCESS_TOKEN is not configured.");
  if (!productId) throw new Error("POLAR_PRODUCT_ID is not configured.");

  const response = await fetch(`${getPolarApiBaseUrl()}/checkouts/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildPolarCheckoutPayload(input))
  });
  const data = await readPolarJson(response);
  const checkoutUrl = readString(data, "url") || readString(data, "checkout_url");

  if (!response.ok || !checkoutUrl) {
    throw new Error(buildPolarCheckoutError(response.status, data));
  }

  return {
    ...data,
    url: checkoutUrl
  } as {
    id?: string;
    url: string;
    success_url?: string;
    return_url?: string;
    amount?: number;
    currency?: string;
  };
}

export function parsePolarWebhookEvent(payload: unknown): PolarWebhookEvent {
  const event = payload as { type?: string; data?: Record<string, unknown> };
  return {
    type: event.type || "unknown",
    data: event.data || {},
    receivedAt: new Date().toISOString()
  };
}

function getPolarProductId() {
  return process.env.POLAR_PRODUCT_ID || process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID || "";
}

export function getPolarApiBaseUrl() {
  return "https://api.polar.sh/v1" as const;
}

async function readPolarJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { detail: text.slice(0, 300) };
  }
}

function buildPolarCheckoutError(status: number, data: Record<string, unknown>) {
  const detail = readString(data, "detail") || readString(data, "message") || readString(data, "error");
  if (detail) return `Polar Checkout Session 생성에 실패했습니다. (${status}) ${detail}`;
  return `Polar Checkout Session 생성에 실패했습니다. (${status})`;
}

function readString(source: Record<string, unknown>, key: string) {
  const value = source[key];
  return typeof value === "string" ? value : "";
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== "")
  ) as T;
}
