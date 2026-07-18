import type { ActionAdapterExecutionInput, ActionAdapterExecutionResult } from "./action-adapter.types";
import { getActionAuthorization } from "../action-credential.service";

export type OAuthBinaryResult = {
  bytes: Buffer;
  contentType: string;
  contentDisposition: string | null;
  apiRequestId: string | null;
  rateLimitRemaining: number | null;
  adapterLatencyMs: number;
};

export async function executeOAuthJson(input: ActionAdapterExecutionInput, request: {
  url: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  idempotencyHeader?: string | null;
}): Promise<ActionAdapterExecutionResult> {
  const response = await executeAuthorizedFetch(input, {
    url: request.url,
    method: request.method,
    headers: {
      Accept: "application/json",
      ...(request.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(request.idempotencyHeader ? { [request.idempotencyHeader]: input.idempotencyKey } : {}),
      ...request.headers
    },
    body: request.body === undefined ? undefined : JSON.stringify(request.body)
  });
  const body = await response.value.text();
  const parsed = body ? safeJson(body) : {};
  assertProviderResponse(input, response.value);
  return {
    output: toOutput(parsed),
    ...telemetry(response.value, response.startedAt)
  };
}

export async function executeOAuthRaw(input: ActionAdapterExecutionInput, request: {
  url: string;
  method?: string;
  body: BodyInit | Uint8Array;
  headers?: Record<string, string>;
  idempotencyHeader?: string | null;
}): Promise<ActionAdapterExecutionResult> {
  const response = await executeAuthorizedFetch(input, {
    url: request.url,
    method: request.method,
    headers: {
      Accept: "application/json",
      ...(request.idempotencyHeader ? { [request.idempotencyHeader]: input.idempotencyKey } : {}),
      ...request.headers
    },
    body: toBodyInit(request.body)
  });
  const body = await response.value.text();
  const parsed = body ? safeJson(body) : {};
  assertProviderResponse(input, response.value);
  return { output: toOutput(parsed), ...telemetry(response.value, response.startedAt) };
}

export async function executeJsonRequest(input: ActionAdapterExecutionInput, request: {
  url: string;
  method?: string;
  body?: unknown;
  rawBody?: BodyInit;
  headers: Record<string, string>;
}): Promise<ActionAdapterExecutionResult> {
  const startedAt = performance.now();
  const response = await fetch(request.url, {
    method: request.method || "GET",
    headers: {
      Accept: "application/json",
      ...(request.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...request.headers
    },
    body: request.rawBody ?? (request.body === undefined ? undefined : JSON.stringify(request.body)),
    redirect: "manual",
    signal: AbortSignal.timeout(30_000)
  });
  if (response.status >= 300 && response.status < 400) {
    throw Object.assign(new Error(`${input.definition.appId} API redirect was blocked.`), {
      code: "PROVIDER_REDIRECT_BLOCKED",
      retryable: false
    });
  }
  const body = await response.text();
  const parsed = body ? safeJson(body) : {};
  assertProviderResponse(input, response);
  return { output: toOutput(parsed), ...telemetry(response, startedAt) };
}

export async function executeOAuthBinary(
  input: ActionAdapterExecutionInput,
  request: { url: string; method?: string; headers?: Record<string, string> },
  maxBytes = 50 * 1024 * 1024
): Promise<OAuthBinaryResult> {
  const response = await executeAuthorizedFetch(input, {
    url: request.url,
    method: request.method,
    headers: { Accept: "application/octet-stream", ...request.headers }
  });
  assertProviderResponse(input, response.value);
  const declaredLength = Number(response.value.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) throw tooLarge();
  const bytes = Buffer.from(await response.value.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw tooLarge();
  return {
    bytes,
    contentType: response.value.headers.get("content-type") || "application/octet-stream",
    contentDisposition: response.value.headers.get("content-disposition"),
    ...telemetry(response.value, response.startedAt)
  };
}

async function executeAuthorizedFetch(
  input: ActionAdapterExecutionInput,
  request: { url: string; method?: string; body?: BodyInit; headers?: Record<string, string> }
) {
  if (!input.connectionId) throw Object.assign(new Error("A connection must be selected for this action."), { code: "CONNECTION_REQUIRED" });
  const startedAt = performance.now();
  const credential = await getActionAuthorization({
    ownerId: input.ownerId,
    connectionId: input.connectionId,
    definition: input.definition
  });
  const response = await fetch(request.url, {
    method: request.method || "GET",
    headers: {
      ...credential.headers,
      ...request.headers
    },
    body: request.body,
    signal: AbortSignal.timeout(30_000)
  });
  return { value: response, startedAt };
}

function assertProviderResponse(input: ActionAdapterExecutionInput, response: Response) {
  if (!response.ok) {
    const error = new Error(`${input.definition.appId} API request failed (${response.status}).`);
    const retryAfter = response.headers.get("retry-after");
    Object.assign(error, {
      code: response.status === 401 || response.status === 403
        ? "PROVIDER_AUTH_FAILED"
        : response.status === 429
          ? "RATE_LIMITED"
          : response.status >= 500
            ? "PROVIDER_UNAVAILABLE"
            : "ACTION_FAILED",
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
      retryAfter,
      retryAfterMs: retryAfter && /^\d+$/u.test(retryAfter) ? Number(retryAfter) * 1_000 : undefined,
      apiRequestId: response.headers.get("x-request-id") || response.headers.get("request-id"),
      rateLimitRemaining: numericHeader(response.headers.get("x-ratelimit-remaining"))
    });
    throw error;
  }
}

function telemetry(response: Response, startedAt: number) {
  return {
    apiRequestId: response.headers.get("x-request-id") || response.headers.get("request-id"),
    rateLimitRemaining: numericHeader(response.headers.get("x-ratelimit-remaining")),
    adapterLatencyMs: Math.round(performance.now() - startedAt)
  };
}

function tooLarge() {
  return Object.assign(new Error("Provider file exceeds the 50 MiB automation limit."), {
    code: "ACTION_OUTPUT_TOO_LARGE",
    retryable: false
  });
}

function toBodyInit(value: BodyInit | Uint8Array): BodyInit {
  if (!(value instanceof Uint8Array)) return value;
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function safeJson(value: string): unknown {
  try { return JSON.parse(value) as unknown; } catch { return { text: value.slice(0, 1_000_000) }; }
}

function toOutput(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return { data: value };
}

function numericHeader(value: string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
