const PORTONE_HOSTS = new Set(["api.portone.io", "api.iamport.kr"]);

export class PortOneHttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(status === 429 ? "The payment provider rate limit was reached." : "The payment provider request failed.");
    this.name = "PortOneHttpError";
  }
}

export async function portOneJson<T>(input: {
  url: string; method?: "GET" | "POST" | "DELETE"; headers?: Record<string, string>;
  body?: Record<string, unknown>; timeoutMs?: number;
}): Promise<T> {
  const url = new URL(input.url);
  if (url.protocol !== "https:" || !PORTONE_HOSTS.has(url.hostname)) {
    throw new Error("Unsupported PortOne API origin.");
  }
  const response = await fetch(url, {
    method: input.method || "GET",
    headers: { Accept: "application/json", ...(input.body ? { "Content-Type": "application/json" } : {}), ...input.headers },
    body: input.body ? JSON.stringify(input.body) : undefined,
    signal: AbortSignal.timeout(Math.max(1_000, Math.min(20_000, input.timeoutMs || 10_000)))
  });
  const text = await response.text();
  if (text.length > 1_000_000) throw new PortOneHttpError(502, "PAYMENT_RESPONSE_TOO_LARGE");
  if (!response.ok) throw new PortOneHttpError(response.status, response.status === 429 ? "PAYMENT_RATE_LIMITED" : "PAYMENT_PROVIDER_FAILED");
  return (text ? JSON.parse(text) : {}) as T;
}

