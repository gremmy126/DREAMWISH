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

export type PolarCheckoutPayload = {
  products: string[];
  success_url: string;
  return_url: string;
};

export type PolarCheckoutRequestConfig = {
  accessToken: string;
  endpoint: string;
  payload: PolarCheckoutPayload;
};

export type PolarWebhookEvent = {
  type: string;
  data: Record<string, unknown>;
  receivedAt: string;
};

export class PolarCheckoutError extends Error {
  code: string;
  status: number;
  clientMessage: string;

  constructor(input: { code: string; message: string; status?: number; clientMessage?: string }) {
    super(input.message);
    this.name = "PolarCheckoutError";
    this.code = input.code;
    this.status = input.status || 400;
    this.clientMessage = input.clientMessage || "결제창을 만들지 못했습니다.";
  }
}

export function buildPolarCheckoutPayload(input: PolarCheckoutInput = {}): PolarCheckoutPayload {
  void input;
  const productId = getPolarProductId();
  const appUrl = getAppBaseUrl();
  return {
    products: productId ? [productId] : [],
    success_url: `${appUrl}/payment/success?checkout_id={CHECKOUT_ID}`,
    return_url: `${appUrl}/settings/billing`
  };
}

export function getPolarCheckoutRequestConfig(input: PolarCheckoutInput = {}): PolarCheckoutRequestConfig {
  const accessToken = getPolarAccessToken();
  const productId = getPolarProductId();
  const appUrl = getAppBaseUrl();

  if (!accessToken) {
    throw new PolarCheckoutError({
      code: "POLAR_CHECKOUT_CONFIG_ERROR",
      message: "POLAR_ACCESS_TOKEN is not configured.",
      status: 500,
      clientMessage: "결제 설정이 올바르지 않습니다."
    });
  }

  if (!productId) {
    throw new PolarCheckoutError({
      code: "POLAR_CHECKOUT_CONFIG_ERROR",
      message: "POLAR_PRODUCT_ID is not configured.",
      status: 500,
      clientMessage: "결제 상품이 설정되어 있지 않습니다."
    });
  }

  if (!isUuid(productId)) {
    throw new PolarCheckoutError({
      code: "POLAR_CHECKOUT_CONFIG_ERROR",
      message: "POLAR_PRODUCT_ID must be a Polar product UUID.",
      status: 500,
      clientMessage: "결제 상품 설정이 올바르지 않습니다."
    });
  }

  if (!appUrl) {
    throw new PolarCheckoutError({
      code: "POLAR_CHECKOUT_CONFIG_ERROR",
      message: "NEXT_PUBLIC_APP_URL is not configured.",
      status: 500,
      clientMessage: "결제 반환 URL 설정이 올바르지 않습니다."
    });
  }

  return {
    accessToken,
    endpoint: `${getPolarApiBaseUrl()}/checkouts/`,
    payload: buildPolarCheckoutPayload(input)
  };
}

export async function createPolarCheckoutSession(input: PolarCheckoutInput = {}) {
  const config = getPolarCheckoutRequestConfig(input);
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(config.payload),
    cache: "no-store"
  });
  const data = await readPolarJson(response);
  const checkoutUrl = readString(data, "url") || readString(data, "checkout_url");

  if (!response.ok || !checkoutUrl) {
    logPolarCheckoutError(response, data, config.payload);
    throw new PolarCheckoutError({
      code: response.status === 422 ? "POLAR_CHECKOUT_VALIDATION_FAILED" : "POLAR_CHECKOUT_FAILED",
      message: buildPolarCheckoutError(response.status, data),
      status: response.status === 422 ? 422 : 502,
      clientMessage: "결제창을 만들지 못했습니다."
    });
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
  return (process.env.POLAR_PRODUCT_ID || "").trim();
}

function getPolarAccessToken() {
  return (process.env.POLAR_ACCESS_TOKEN || process.env.POLAR_API_KEY || "").trim();
}

function getAppBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/u, "");
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

function logPolarCheckoutError(
  response: Response,
  data: Record<string, unknown>,
  payload: PolarCheckoutPayload
) {
  console.error("[Polar Checkout Error]", {
    status: response.status,
    statusText: response.statusText,
    response: data,
    request: payload
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value
  );
}
