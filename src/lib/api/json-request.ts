import { apiFailure, type ApiFailure } from "./api-response";

export type JsonRequestParseResult<T> =
  | { ok: true; data: T }
  | ApiFailure;

export async function parseJsonRequestBody<T>(
  request: Request
): Promise<JsonRequestParseResult<T>> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return apiFailure(
      415,
      "INVALID_CONTENT_TYPE",
      "Content-Type must be application/json."
    );
  }

  const rawBody = await request.text();

  if (!rawBody.trim()) {
    return apiFailure(400, "EMPTY_REQUEST_BODY", "Request body is empty.");
  }

  try {
    return { ok: true, data: JSON.parse(rawBody) as T };
  } catch {
    return apiFailure(400, "INVALID_JSON", "Request body must contain valid JSON.");
  }
}
