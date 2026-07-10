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

type AppUrlConfig = {
  origin: string;
  source: string;
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
  const appUrl = getAppUrlConfig().origin;
  const urls = buildCheckoutUrls(appUrl);
  return {
    products: productId ? [productId] : [],
    success_url: urls.successUrl,
    return_url: urls.returnUrl
  };
}

export function getPolarCheckoutRequestConfig(input: PolarCheckoutInput = {}): PolarCheckoutRequestConfig {
  const accessToken = getPolarAccessToken();
  const productId = getPolarProductId();
  getAppUrlConfig();

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

  return {
    accessToken,
    endpoint: `${getPolarApiBaseUrl()}/checkouts/`,
    payload: buildPolarCheckoutPayload(input)
  };
}

export async function createPolarCheckoutSession(input: PolarCheckoutInput = {}) {
  const config = getPolarCheckoutRequestConfig(input);
  logPolarCheckoutUrls(config.payload);
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

function getAppUrlConfig(): AppUrlConfig {
  const configured = getConfiguredAppUrl();
  if (!configured) {
    throw new PolarCheckoutError({
      code: "INVALID_CHECKOUT_RETURN_URL",
      message: "APP_URL is not configured. Set APP_URL or NEXT_PUBLIC_APP_URL.",
      status: 500,
      clientMessage: "결제 반환 URL 설정이 올바르지 않습니다."
    });
  }

  const origin = normalizeAppOrigin(configured.value, configured.source);
  const hostname = new URL(origin).hostname;
  if (isHostedRuntime() && isLocalHostname(hostname)) {
    throw new PolarCheckoutError({
      code: "INVALID_CHECKOUT_RETURN_URL",
      message: `${configured.source} must be a public URL in hosted deployments.`,
      status: 500,
      clientMessage: "결제 반환 URL 설정이 올바르지 않습니다."
    });
  }

  return {
    origin,
    source: configured.source
  };
}

function getConfiguredAppUrl() {
  for (const source of [
    "APP_URL",
    "NEXT_PUBLIC_APP_URL",
    "PUBLIC_APP_URL",
    "NEXT_PUBLIC_SITE_URL",
    "SITE_URL"
  ]) {
    const value = process.env[source]?.trim();
    if (value) return { source, value };
  }

  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railwayDomain) {
    return {
      source: "RAILWAY_PUBLIC_DOMAIN",
      value: railwayDomain.startsWith("http") ? railwayDomain : `https://${railwayDomain}`
    };
  }

  return null;
}

function normalizeAppOrigin(value: string, source: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw invalidAppUrlError(source);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw invalidAppUrlError(source);
  }

  return parsed.origin;
}

function buildCheckoutUrls(appOrigin: string) {
  const successUrl = `${appOrigin}/payment/success?checkout_id={CHECKOUT_ID}`;
  const returnUrl = `${appOrigin}/settings/billing`;
  validateCheckoutUrl(successUrl, "success_url");
  validateCheckoutUrl(returnUrl, "return_url");
  return { successUrl, returnUrl };
}

function validateCheckoutUrl(value: string, fieldName: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new PolarCheckoutError({
      code: "INVALID_CHECKOUT_RETURN_URL",
      message: `${fieldName} must be an absolute URL.`,
      status: 500,
      clientMessage: "결제 반환 URL 설정이 올바르지 않습니다."
    });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PolarCheckoutError({
      code: "INVALID_CHECKOUT_RETURN_URL",
      message: `${fieldName} must be an http or https URL.`,
      status: 500,
      clientMessage: "결제 반환 URL 설정이 올바르지 않습니다."
    });
  }
}

function invalidAppUrlError(source: string) {
  return new PolarCheckoutError({
    code: "INVALID_CHECKOUT_RETURN_URL",
    message: `${source} must be an absolute http or https URL.`,
    status: 500,
    clientMessage: "결제 반환 URL 설정이 올바르지 않습니다."
  });
}

function isHostedRuntime() {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_SERVICE_ID ||
      process.env.VERCEL ||
      process.env.RENDER ||
      process.env.FLY_APP_NAME
  );
}

function isLocalHostname(hostname: string) {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname.toLowerCase());
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

function logPolarCheckoutUrls(payload: PolarCheckoutPayload) {
  if (process.env.NODE_ENV === "production") return;
  console.log("[Polar Checkout URLs]", {
    successUrl: payload.success_url,
    returnUrl: payload.return_url,
    appUrl: new URL(payload.return_url).origin
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value
  );
}
