import type { AccessState } from "./access-control";

export class AuthSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthSessionError";
  }
}

export function getAuthSessionFailureMessage(status: number): string {
  if (status === 401 || status === 403) {
    return "로그인 세션을 확인하지 못했습니다. 다시 로그인해주세요.";
  }
  if (status === 429) {
    return "로그인 요청이 많습니다. 잠시 후 다시 시도해주세요.";
  }
  if (status >= 500) {
    return "로그인 서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해주세요.";
  }
  return "로그인 처리를 완료하지 못했습니다. 다시 시도해주세요.";
}

export async function readAuthSessionAccess(
  response: Response,
  missingAccessMessage?: string
): Promise<AccessState> {
  if (!response.ok) {
    throw new AuthSessionError(getAuthSessionFailureMessage(response.status));
  }

  const body: unknown = await response.json().catch(() => null);
  if (!isRecord(body) || !isAccessState(body.access)) {
    throw new AuthSessionError(
      missingAccessMessage ?? getAuthSessionFailureMessage(response.status)
    );
  }
  return body.access;
}

function isAccessState(value: unknown): value is AccessState {
  return (
    isRecord(value) &&
    typeof value.email === "string" &&
    (value.role === "admin" || value.role === "user") &&
    typeof value.paid === "boolean" &&
    typeof value.adminBypass === "boolean" &&
    typeof value.canUseApp === "boolean" &&
    typeof value.requiresPayment === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
