export type AIErrorCode =
  | "INVALID_REQUEST"
  | "EMPTY_MESSAGE"
  | "UNAUTHORIZED"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_AUTH_ERROR"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "MODEL_NOT_FOUND"
  | "MODEL_RESPONSE_EMPTY"
  | "MODEL_USAGE_UNAVAILABLE"
  | "RETRIEVAL_ERROR"
  | "DATABASE_ERROR"
  | "AI_TEXT_CONCURRENCY_LIMIT"
  | "AI_TEXT_DAILY_LIMIT_EXCEEDED"
  | "INTERNAL_ERROR";

export type ClientAIError = {
  code: AIErrorCode;
  message: string;
  retryable: boolean;
};

export class AIProviderError extends Error {
  readonly code: AIErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAfterSeconds?: number;
  readonly cause?: unknown;

  constructor(input: {
    code: AIErrorCode;
    message: string;
    retryable?: boolean;
    status?: number;
    retryAfterSeconds?: number;
    cause?: unknown;
  }) {
    super(input.message);

    this.name = "AIProviderError";
    this.code = input.code;
    this.retryable = input.retryable ?? false;
    this.status = input.status;
    this.retryAfterSeconds = input.retryAfterSeconds;
    this.cause = input.cause;

    /**
     * 일부 JavaScript 실행 환경에서 Error를 상속한 클래스의
     * instanceof 검사가 정상적으로 동작하지 않는 문제를 방지합니다.
     */
    Object.setPrototypeOf(this, AIProviderError.prototype);
  }
}

/**
 * HTTP 상태 코드를 AI 에러 코드로 변환합니다.
 */
export function classifyProviderHttpError(
  status: number,
): Pick<AIProviderError, "code" | "retryable"> {
  if (status === 400 || status === 422) {
    return {
      code: "INVALID_REQUEST",
      retryable: false,
    };
  }

  if (status === 401 || status === 403) {
    return {
      code: "PROVIDER_AUTH_ERROR",
      retryable: false,
    };
  }

  if (status === 404) {
    return {
      code: "MODEL_NOT_FOUND",
      retryable: false,
    };
  }

  if (status === 408 || status === 504) {
    return {
      code: "PROVIDER_TIMEOUT",
      retryable: true,
    };
  }

  if (status === 429) {
    return {
      code: "PROVIDER_RATE_LIMIT",
      retryable: true,
    };
  }

  if (status === 500 || status === 502 || status === 503) {
    return {
      code: "PROVIDER_UNAVAILABLE",
      retryable: true,
    };
  }

  return {
    code: "INTERNAL_ERROR",
    retryable: false,
  };
}

/**
 * 값이 AIErrorCode에 포함되는지 확인합니다.
 *
 * 외부 객체의 code 값을 바로 AIErrorCode로 단언하면
 * 정의되지 않은 문자열도 통과할 수 있으므로 검증합니다.
 */
export function isAIErrorCode(value: unknown): value is AIErrorCode {
  if (typeof value !== "string") {
    return false;
  }

  const errorCodes: ReadonlySet<AIErrorCode> = new Set([
    "INVALID_REQUEST",
    "EMPTY_MESSAGE",
    "UNAUTHORIZED",
    "PROVIDER_NOT_CONFIGURED",
    "PROVIDER_AUTH_ERROR",
    "PROVIDER_RATE_LIMIT",
    "PROVIDER_TIMEOUT",
    "PROVIDER_UNAVAILABLE",
    "MODEL_NOT_FOUND",
    "MODEL_RESPONSE_EMPTY",
    "RETRIEVAL_ERROR",
    "DATABASE_ERROR",
    "AI_TEXT_CONCURRENCY_LIMIT",
    "AI_TEXT_DAILY_LIMIT_EXCEEDED",
    "INTERNAL_ERROR",
  ]);

  return errorCodes.has(value as AIErrorCode);
}

/**
 * 알 수 없는 오류를 클라이언트에 전달할 수 있는 형태로 변환합니다.
 */
export function toClientAIError(error: unknown): ClientAIError {
  if (error instanceof AIProviderError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  }

  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error
  ) {
    const code = (error as { code?: unknown }).code;
    const message = (error as { message?: unknown }).message;
    const retryable = (error as { retryable?: unknown }).retryable;

    if (isAIErrorCode(code) && typeof message === "string") {
      return {
        code,
        message,
        retryable: typeof retryable === "boolean" ? retryable : false,
      };
    }
  }

  if (error instanceof Error) {
    return {
      code: "INTERNAL_ERROR",
      message: error.message || "AI request failed.",
      retryable: false,
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "AI request failed.",
    retryable: false,
  };
}

/**
 * 오류 코드에 맞는 기본 HTTP 상태 코드를 반환합니다.
 */
export function getDefaultHttpStatus(code: AIErrorCode): number {
  switch (code) {
    case "INVALID_REQUEST":
    case "EMPTY_MESSAGE":
      return 400;

    case "UNAUTHORIZED":
    case "PROVIDER_AUTH_ERROR":
      return 401;

    case "MODEL_NOT_FOUND":
      return 404;

    case "AI_TEXT_CONCURRENCY_LIMIT":
    case "AI_TEXT_DAILY_LIMIT_EXCEEDED":
    case "PROVIDER_RATE_LIMIT":
      return 429;

    case "PROVIDER_NOT_CONFIGURED":
    case "PROVIDER_UNAVAILABLE":
      return 503;

    case "PROVIDER_TIMEOUT":
      return 504;

    case "MODEL_RESPONSE_EMPTY":
    case "RETRIEVAL_ERROR":
    case "DATABASE_ERROR":
    case "INTERNAL_ERROR":
    default:
      return 500;
  }
}

/**
 * retryAfterSeconds 값을 안전하게 가져옵니다.
 */
function getRetryAfterSeconds(error: unknown): number | undefined {
  if (
    error !== null &&
    typeof error === "object" &&
    "retryAfterSeconds" in error
  ) {
    const retryAfterSeconds = (
      error as {
        retryAfterSeconds?: unknown;
      }
    ).retryAfterSeconds;

    if (
      typeof retryAfterSeconds === "number" &&
      Number.isFinite(retryAfterSeconds) &&
      retryAfterSeconds > 0
    ) {
      return Math.ceil(retryAfterSeconds);
    }
  }

  return undefined;
}

/**
 * API 응답에 필요한 오류 데이터와 HTTP 상태 코드를 반환합니다.
 */
export function getAIErrorHttpMetadata(error: unknown): {
  error: ClientAIError;
  status: number;
  retryAfterSeconds?: number;
} {
  const clientError = toClientAIError(error);

  const customStatus =
    error instanceof AIProviderError &&
    typeof error.status === "number" &&
    Number.isInteger(error.status) &&
    error.status >= 400 &&
    error.status <= 599
      ? error.status
      : undefined;

  const status = customStatus ?? getDefaultHttpStatus(clientError.code);

  const shouldIncludeRetryAfter =
    clientError.code === "AI_TEXT_CONCURRENCY_LIMIT" ||
    clientError.code === "AI_TEXT_DAILY_LIMIT_EXCEEDED" ||
    clientError.code === "PROVIDER_RATE_LIMIT";

  if (shouldIncludeRetryAfter) {
    const retryAfterSeconds = getRetryAfterSeconds(error) ?? 60;

    return {
      error: clientError,
      status,
      retryAfterSeconds,
    };
  }

  return {
    error: clientError,
    status,
  };
}
