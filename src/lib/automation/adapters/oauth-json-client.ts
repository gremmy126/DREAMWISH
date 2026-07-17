import { getOAuthAccessTokenForConnection } from "../../oauth/oauth-connection.service";
import type { ActionAdapterExecutionInput, ActionAdapterExecutionResult } from "./action-adapter.types";

export async function executeOAuthJson(input: ActionAdapterExecutionInput, request: {
  url: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  idempotencyHeader?: string | null;
}): Promise<ActionAdapterExecutionResult> {
  if (!input.connectionId) throw Object.assign(new Error("A connection must be selected for this action."), { code: "CONNECTION_REQUIRED" });
  const startedAt = performance.now();
  const credential = await getOAuthAccessTokenForConnection({
    ownerId: input.ownerId,
    connectionId: input.connectionId,
    appId: input.definition.appId,
    requiredScopes: input.definition.requiredScopes
  });
  const response = await fetch(request.url, {
    method: request.method || "GET",
    headers: {
      Authorization: `Bearer ${credential.accessToken}`,
      Accept: "application/json",
      ...(request.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(request.idempotencyHeader ? { [request.idempotencyHeader]: input.idempotencyKey } : {}),
      ...request.headers
    },
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
    signal: AbortSignal.timeout(30_000)
  });
  const body = await response.text();
  const parsed = body ? safeJson(body) : {};
  if (!response.ok) {
    const error = new Error(`${input.definition.appId} API request failed (${response.status}).`);
    Object.assign(error, {
      code: response.status === 429 ? "RATE_LIMITED" : response.status >= 500 ? "PROVIDER_UNAVAILABLE" : "ACTION_FAILED",
      retryable: response.status === 429 || response.status >= 500,
      retryAfter: response.headers.get("retry-after")
    });
    throw error;
  }
  return {
    output: toOutput(parsed),
    apiRequestId: response.headers.get("x-request-id") || response.headers.get("request-id"),
    rateLimitRemaining: numericHeader(response.headers.get("x-ratelimit-remaining")),
    adapterLatencyMs: Math.round(performance.now() - startedAt)
  };
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
