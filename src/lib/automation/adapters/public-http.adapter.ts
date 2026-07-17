import { assertPublicDns, assertSafeUrlFormat } from "../../deep-research/safe-fetch";
import type { ActionAdapter } from "./action-adapter.types";
import { objectValue, text } from "./adapter-utils";

export const publicHttpAdapter: ActionAdapter = {
  adapterVersion: 1,
  supports(adapterKey, adapterVersion) {
    return adapterVersion === 1 && (adapterKey === "webhook.send" || /^http\.(get|post|put|patch|delete)$/u.test(adapterKey));
  },
  async execute(input) {
    const startedAt = performance.now();
    const url = assertSafeUrlFormat(text(input.normalizedInput, "url"));
    await assertPublicDns(url.hostname);
    const method = input.definition.appId === "http" ? input.definition.id.toUpperCase() : text(input.normalizedInput, "method", "POST").toUpperCase();
    const timeout = Math.max(100, Math.min(120_000, Number(input.normalizedInput.timeout) || 30_000));
    const suppliedHeaders = objectValue(input.normalizedInput, "headers");
    const headers = new Headers();
    for (const [key, value] of Object.entries(suppliedHeaders)) {
      if (/^(host|connection|content-length|cookie)$/iu.test(key)) continue;
      if (typeof value === "string") headers.set(key, value);
    }
    headers.set("Accept", "application/json, text/plain;q=0.9");
    if (method !== "GET") {
      headers.set("Content-Type", "application/json");
      headers.set("Idempotency-Key", input.idempotencyKey);
    }
    const response = await fetch(url, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(input.normalizedInput.body ?? {}),
      redirect: "manual",
      signal: AbortSignal.timeout(timeout)
    });
    if (response.status >= 300 && response.status < 400) throw new Error("HTTP redirects are blocked; use the final verified HTTPS URL.");
    const raw = (await response.text()).slice(0, 1_000_000);
    if (!response.ok) {
      const error = new Error(`HTTP action failed (${response.status}).`);
      Object.assign(error, { code: response.status === 429 ? "RATE_LIMITED" : "ACTION_FAILED", retryable: response.status === 429 || response.status >= 500 });
      throw error;
    }
    return {
      output: { status: response.status, headers: safeResponseHeaders(response.headers), body: parseBody(raw) },
      apiRequestId: response.headers.get("x-request-id"),
      rateLimitRemaining: finiteNumber(response.headers.get("x-ratelimit-remaining")),
      adapterLatencyMs: Math.round(performance.now() - startedAt)
    };
  }
};

function parseBody(value: string) { try { return JSON.parse(value) as unknown; } catch { return value; } }
function finiteNumber(value: string | null) { const parsed = Number(value); return value !== null && Number.isFinite(parsed) ? parsed : null; }
function safeResponseHeaders(headers: Headers) {
  return Object.fromEntries(["content-type", "etag", "last-modified", "x-request-id", "x-ratelimit-remaining"].map((key) => [key, headers.get(key)]).filter(([, value]) => value));
}
