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

export type PolarCheckoutVerification = {
  id: string;
  paid: boolean;
  status: string;
  customerEmail: string | null;
  raw: Record<string, unknown>;
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
    this.clientMessage = input.clientMessage || "Payment checkout could not be created.";
  }
}

export function buildPolarCheckoutPayload(input: PolarCheckoutInput = {}): PolarCheckoutPayload {
  void input;
  const productId = getPolarProductId();
  const urls = buildCheckoutUrls();
  return {
    products: productId ? [productId] : [],
    success_url: urls.successUrl,
    return_url: urls.cancelUrl
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
      clientMessage: "Payment configuration is invalid."
    });
  }

  if (!productId) {
    throw new PolarCheckoutError({
      code: "POLAR_CHECKOUT_CONFIG_ERROR",
      message: "POLAR_PRODUCT_ID is not configured.",
      status: 500,
      clientMessage: "Payment product is not configured."
    });
  }

  if (!isUuid(productId)) {
    throw new PolarCheckoutError({
      code: "POLAR_CHECKOUT_CONFIG_ERROR",
      message: "POLAR_PRODUCT_ID must be a Polar product UUID.",
      status: 500,
      clientMessage: "Payment product configuration is invalid."
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
      clientMessage: "Payment checkout could not be created."
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

export async function verifyPolarCheckoutSession(checkoutId: string): Promise<PolarCheckoutVerification> {
  const id = checkoutId.trim();
  if (!/^[a-z0-9_-]{8,80}$/iu.test(id)) {
    throw new PolarCheckoutError({
      code: "POLAR_CHECKOUT_INVALID_ID",
      message: "checkout_id is invalid.",
      status: 400,
      clientMessage: "Payment verification ID is invalid."
    });
  }

  const accessToken = getPolarAccessToken();
  if (!accessToken) {
    throw new PolarCheckoutError({
      code: "POLAR_CHECKOUT_CONFIG_ERROR",
      message: "POLAR_ACCESS_TOKEN is not configured.",
      status: 500,
      clientMessage: "Payment configuration is invalid."
    });
  }

  const response = await fetch(`${getPolarApiBaseUrl()}/checkouts/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });
  const data = await readPolarJson(response);

  if (!response.ok) {
    throw new PolarCheckoutError({
      code: "POLAR_CHECKOUT_VERIFY_FAILED",
      message: buildPolarCheckoutError(response.status, data),
      status: response.status === 404 ? 404 : 502,
      clientMessage: "Payment status could not be verified."
    });
  }

  return parsePolarCheckoutVerification(id, data);
}

export function parsePolarCheckoutVerification(
  checkoutId: string,
  data: Record<string, unknown>
): PolarCheckoutVerification {
  const status = String(
    data.status ||
      data.payment_status ||
      data.checkout_status ||
      data.order_status ||
      "unknown"
  ).toLowerCase();
  const paid =
    data.paid === true ||
    data.is_paid === true ||
    ["paid", "succeeded", "success", "completed", "complete", "confirmed"].includes(status);

  return {
    id: readString(data, "id") || checkoutId,
    paid,
    status,
    customerEmail: extractCheckoutCustomerEmail(data),
    raw: data
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
  const configured = getConfiguredAppUrl() || {
    source: "NEXT_PUBLIC_APP_URL",
    value: "http://localhost:3000"
  };
  const origin = normalizeAppOrigin(configured.value, configured.source);
  const hostname = new URL(origin).hostname;

  if (isProductionRuntime() && isLocalHostname(hostname)) {
    throw new PolarCheckoutError({
      code: "INVALID_CHECKOUT_RETURN_URL",
      message: `${configured.source} cannot use localhost in production.`,
      status: 500,
      clientMessage: "Payment return URL configuration is invalid."
    });
  }

  assertCanonicalDreamwishHost(origin, configured.source);

  return {
    origin,
    source: configured.source
  };
}

function getConfiguredAppUrl() {
  for (const source of [
    "NEXT_PUBLIC_APP_URL",
    "APP_URL",
    "PUBLIC_APP_URL",
    "NEXT_PUBLIC_SITE_URL",
    "SITE_URL"
  ]) {
    const value = process.env[source];
    if (value) return { source, value };
  }

  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railwayDomain) {
    return {
      source: "RAILWAY_PUBLIC_DOMAIN",
      value: railwayDomain.startsWith("http") ? railwayDomain : `https://${railwayDomain}`
    };
  }

  return null;
}

function normalizeAppOrigin(value: string, source: string) {
  return new URL(validateHttpUrl(value, source)).origin;
}

function buildCheckoutUrls() {
  const appOrigin = getAppUrlConfig().origin;
  const successBase = normalizeCheckoutBaseUrl(
    process.env.POLAR_SUCCESS_URL || `${appOrigin}/payment/success`,
    "POLAR_SUCCESS_URL",
    "/payment/success"
  );
  const cancelUrl = normalizeCheckoutBaseUrl(
    process.env.POLAR_CANCEL_URL || `${appOrigin}/pricing?payment=cancelled`,
    "POLAR_CANCEL_URL",
    "/pricing"
  );
  const successUrl = appendCheckoutIdPlaceholder(successBase);
  validateCheckoutUrl(successUrl, "success_url");
  validateCheckoutUrl(cancelUrl, "return_url");
  return { successUrl, cancelUrl };
}

export function validateHttpUrl(value: string, name: string) {
  try {
    if (value !== value.trim() || /["'\r\n\t]/u.test(value)) {
      throw new Error(`${name} contains quotes or whitespace`);
    }

    const url = new URL(value);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error(`${name} must use http or https`);
    }

    if (url.protocol === "http:" && !isLocalHostname(url.hostname)) {
      throw new Error(`${name} must use https outside localhost`);
    }

    if (isProductionRuntime() && isLocalHostname(url.hostname)) {
      throw new PolarCheckoutError({
        code: "INVALID_CHECKOUT_RETURN_URL",
        message: `${name} cannot use localhost in production.`,
        status: 500,
        clientMessage: "Payment return URL configuration is invalid."
      });
    }

    if (/https?:\/\//iu.test(`${url.pathname}${url.search}${url.hash}`)) {
      throw new Error(`${name} contains a nested URL`);
    }

    assertCanonicalDreamwishHost(url.origin, name);

    return url.toString().replace(/\/$/u, "");
  } catch (error) {
    if (error instanceof PolarCheckoutError) throw error;
    throw new PolarCheckoutError({
      code: "INVALID_CHECKOUT_RETURN_URL",
      message: `Invalid ${name}: ${value}`,
      status: 500,
      clientMessage: "Payment return URL configuration is invalid."
    });
  }
}

function normalizeCheckoutBaseUrl(value: string, name: string, expectedPath: string) {
  const normalized = validateHttpUrl(value, name);
  const parsed = new URL(normalized);
  if (parsed.pathname.replace(/\/$/u, "") !== expectedPath) {
    throw new PolarCheckoutError({
      code: "INVALID_CHECKOUT_RETURN_URL",
      message: `${name} must use ${expectedPath}.`,
      status: 500,
      clientMessage: "Payment return URL configuration is invalid."
    });
  }
  return normalized;
}

function validateCheckoutUrl(value: string, fieldName: string) {
  validateHttpUrl(value.replace("{CHECKOUT_ID}", "checkout_test_id"), fieldName);
}

function appendCheckoutIdPlaceholder(successBase: string) {
  const withoutExistingCheckoutId = successBase
    .replace(/([?&])checkout_id=[^&]*/u, "$1")
    .replace(/[?&]$/u, "");
  const separator = withoutExistingCheckoutId.includes("?") ? "&" : "?";
  return `${withoutExistingCheckoutId}${separator}checkout_id={CHECKOUT_ID}`;
}

function assertCanonicalDreamwishHost(value: string, name: string) {
  const hostname = new URL(value).hostname.toLowerCase();
  if (isProductionRuntime() && hostname !== "dreamwish.co.kr") {
    throw new PolarCheckoutError({
      code: "INVALID_CHECKOUT_RETURN_URL",
      message: `${name} must use dreamwish.co.kr.`,
      status: 500,
      clientMessage: "Payment return URL configuration is invalid."
    });
  }
}

function isProductionRuntime() {
  return Boolean(
    process.env.NODE_ENV === "production" ||
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
  if (detail) return `Polar Checkout Session could not be created. (${status}) ${detail}`;
  return `Polar Checkout Session could not be created. (${status})`;
}

function readString(source: Record<string, unknown>, key: string) {
  const value = source[key];
  return typeof value === "string" ? value : "";
}

function extractCheckoutCustomerEmail(data: Record<string, unknown>) {
  const customer = data.customer as { email?: unknown } | undefined;
  const metadata = data.metadata as { customer_email?: unknown; email?: unknown } | undefined;
  const user = data.user as { email?: unknown } | undefined;
  return (
    stringOrNull(data.customer_email) ||
    stringOrNull(customer?.email) ||
    stringOrNull(metadata?.customer_email) ||
    stringOrNull(metadata?.email) ||
    stringOrNull(user?.email)
  );
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.includes("@") ? value : null;
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
  console.log("[Polar Checkout]", {
    successUrl: payload.success_url,
    cancelUrl: payload.return_url,
    environment: process.env.NODE_ENV
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value
  );
}
