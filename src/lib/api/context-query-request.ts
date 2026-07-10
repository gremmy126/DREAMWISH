import { apiFailure, type ApiFailure } from "./api-response";
import { parseJsonRequestBody } from "./json-request";

export type ContextQueryRequest = {
  query: string;
  conversationId?: string;
  limit: number;
};

type ContextQueryBody = {
  query?: unknown;
  conversationId?: unknown;
  limit?: unknown;
};

const MAX_QUERY_LENGTH = 10000;

export async function parseContextQueryRequest(
  request: Request
): Promise<{ ok: true; data: ContextQueryRequest } | ApiFailure> {
  const parsed = await parseJsonRequestBody<ContextQueryBody>(request);
  if (!parsed.ok) return parsed;

  const query = typeof parsed.data.query === "string" ? parsed.data.query.trim() : "";

  if (!query) {
    return apiFailure(400, "QUERY_REQUIRED", "Query is required.");
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return apiFailure(413, "QUERY_TOO_LONG", "Query is too long.");
  }

  return {
    ok: true,
    data: {
      query,
      conversationId:
        typeof parsed.data.conversationId === "string" && parsed.data.conversationId.trim()
          ? parsed.data.conversationId.trim()
          : undefined,
      limit: normalizeLimit(parsed.data.limit)
    }
  };
}

function normalizeLimit(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 12;
  return Math.min(50, Math.max(1, Math.trunc(value)));
}
