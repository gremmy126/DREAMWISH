export type ApiSuccess<T> = {
  ok: true;
  data: T;
  requestId?: string;
};

export type ApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type ApiFailure = {
  ok: false;
  status: number;
  error: ApiError["error"];
};

export function apiSuccess<T>(data: T, requestId?: string): ApiSuccess<T> {
  return requestId ? { ok: true, data, requestId } : { ok: true, data };
}

export function apiFailure(
  status: number,
  code: string,
  message: string,
  details?: unknown
): ApiFailure {
  return {
    ok: false,
    status,
    error: details === undefined ? { code, message } : { code, message, details }
  };
}

export async function readApiResponse<T>(response: Response): Promise<T> {
  let payload: unknown;
  const raw = await response.text();

  if (!raw.trim()) {
    throw createClientError(
      response.ok ? "EMPTY_RESPONSE" : "INTERNAL_SERVER_ERROR",
      response.ok ? "Response body is empty." : `Request failed with status ${response.status}`,
      response.status
    );
  }

  try {
    payload = JSON.parse(raw);
  } catch {
    throw createClientError(
      response.ok ? "INVALID_JSON" : "INTERNAL_SERVER_ERROR",
      response.ok ? "Response body must contain valid JSON." : `Request failed with status ${response.status}`,
      response.status
    );
  }

  if (isApiResponse<T>(payload)) {
    if (response.ok && payload.ok) return payload.data;
    const error = payload.ok
      ? createClientError("INTERNAL_SERVER_ERROR", `Request failed with status ${response.status}`, response.status)
      : createClientError(payload.error.code, payload.error.message, response.status, payload.error.details);
    throw error;
  }

  if (!response.ok) {
    const fallback = extractLegacyError(payload);
    throw createClientError(fallback.code, fallback.message, response.status);
  }

  return payload as T;
}

export function createClientError(
  code: string,
  message: string,
  status?: number,
  details?: unknown
) {
  const error = new Error(message) as Error & {
    code: string;
    status?: number;
    details?: unknown;
  };
  error.code = code;
  if (status !== undefined) error.status = status;
  if (details !== undefined) error.details = details;
  return error;
}

export function getErrorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" && code ? code : null;
  }

  return null;
}

function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  if (typeof value !== "object" || value === null || !("ok" in value)) return false;
  const ok = (value as { ok?: unknown }).ok;
  return ok === true || ok === false;
}

function extractLegacyError(value: unknown) {
  if (typeof value === "object" && value !== null && "error" in value) {
    const error = (value as { error?: unknown }).error;
    if (typeof error === "string" && error) {
      return { code: "INTERNAL_SERVER_ERROR", message: error };
    }

    if (typeof error === "object" && error !== null) {
      const code = (error as { code?: unknown }).code;
      const message = (error as { message?: unknown }).message;
      return {
        code: typeof code === "string" ? code : "INTERNAL_SERVER_ERROR",
        message: typeof message === "string" ? message : "Request failed."
      };
    }
  }

  return { code: "INTERNAL_SERVER_ERROR", message: "Request failed." };
}
