export type AIErrorCode =
  | "INVALID_REQUEST"
  | "EMPTY_MESSAGE"
  | "UNAUTHORIZED"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_AUTH_ERROR"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_TIMEOUT"
  | "MODEL_NOT_FOUND"
  | "MODEL_RESPONSE_EMPTY"
  | "RETRIEVAL_ERROR"
  | "DATABASE_ERROR"
  | "INTERNAL_ERROR";

export class AIProviderError extends Error {
  code: AIErrorCode;
  retryable: boolean;
  status?: number;

  constructor(input: {
    code: AIErrorCode;
    message: string;
    retryable?: boolean;
    status?: number;
  }) {
    super(input.message);
    this.name = "AIProviderError";
    this.code = input.code;
    this.retryable = input.retryable ?? false;
    this.status = input.status;
  }
}

export function classifyProviderHttpError(status: number): Pick<AIProviderError, "code" | "retryable"> {
  if (status === 401 || status === 403) {
    return { code: "PROVIDER_AUTH_ERROR", retryable: false };
  }
  if (status === 404) {
    return { code: "MODEL_NOT_FOUND", retryable: false };
  }
  if (status === 408 || status === 429 || status === 502 || status === 503 || status === 504) {
    return {
      code: status === 408 ? "PROVIDER_TIMEOUT" : "PROVIDER_RATE_LIMIT",
      retryable: true
    };
  }
  return { code: "INTERNAL_ERROR", retryable: false };
}

export function toClientAIError(error: unknown) {
  if (error instanceof AIProviderError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable
    };
  }

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return {
      code: (error as { code: string }).code as AIErrorCode,
      message: (error as { message: string }).message,
      retryable:
        "retryable" in error && typeof (error as { retryable?: unknown }).retryable === "boolean"
          ? (error as { retryable: boolean }).retryable
          : false
    };
  }

  if (error instanceof Error) {
    return {
      code: "INTERNAL_ERROR" as const,
      message: error.message,
      retryable: false
    };
  }

  return {
    code: "INTERNAL_ERROR" as const,
    message: "AI request failed.",
    retryable: false
  };
}
