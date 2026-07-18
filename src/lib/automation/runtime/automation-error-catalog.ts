export const AUTOMATION_ERROR_CODES = [
  "WORKER_OFFLINE",
  "CONNECTION_REQUIRED",
  "CONNECTION_NOT_FOUND",
  "CONNECTION_APP_MISMATCH",
  "CREDENTIAL_INVALID",
  "SCOPE_INSUFFICIENT",
  "RATE_LIMITED",
  "ADAPTER_UNAVAILABLE",
  "PROVIDER_AUTH_FAILED",
  "PROVIDER_UNAVAILABLE",
  "AUTOMATION_EXECUTION_FAILED"
] as const;

export type AutomationErrorCode = typeof AUTOMATION_ERROR_CODES[number];

export type AutomationErrorDescriptor = {
  title: string;
  safeReason: string;
  recoverySteps: string[];
  retryable: boolean;
};

const CATALOG: Record<AutomationErrorCode, AutomationErrorDescriptor> = {
  WORKER_OFFLINE: {
    title: "자동화 Worker 응답 없음",
    safeReason: "실행을 처리할 호환 Worker의 최근 heartbeat가 없습니다.",
    recoverySteps: ["Worker 복구가 완료될 때까지 기다립니다.", "관리자는 Railway Worker 배포와 PostgreSQL 연결 상태를 확인합니다."],
    retryable: true
  },
  CONNECTION_REQUIRED: {
    title: "연결 계정 필요",
    safeReason: "이 Step에서 사용할 연결 계정 또는 Credential이 선택되지 않았습니다.",
    recoverySteps: ["문제가 표시된 노드를 엽니다.", "검증된 연결 계정을 선택한 뒤 저장합니다."],
    retryable: true
  },
  CONNECTION_NOT_FOUND: {
    title: "연결을 찾을 수 없음",
    safeReason: "선택한 연결이 삭제됐거나 현재 사용자에게 속하지 않습니다.",
    recoverySteps: ["해당 앱의 연결을 새로 만듭니다.", "문제가 표시된 노드에서 새 연결을 선택합니다."],
    retryable: true
  },
  CONNECTION_APP_MISMATCH: {
    title: "잘못된 앱 연결",
    safeReason: "선택한 연결이 이 Action의 앱과 일치하지 않습니다.",
    recoverySteps: ["문제가 표시된 노드를 엽니다.", "같은 앱의 검증된 연결을 선택합니다."],
    retryable: true
  },
  CREDENTIAL_INVALID: {
    title: "Credential 재검증 필요",
    safeReason: "저장된 Credential이 만료됐거나 공급자 검증을 통과하지 못했습니다.",
    recoverySteps: ["연동 화면에서 Credential을 다시 검증합니다.", "필요하면 새 키 또는 Secret으로 교체합니다."],
    retryable: true
  },
  SCOPE_INSUFFICIENT: {
    title: "권한 범위 부족",
    safeReason: "연결은 유효하지만 이 Action에 필요한 Scope가 승인되지 않았습니다.",
    recoverySteps: ["공급자 앱에 필요한 권한을 추가합니다.", "기존 연결을 끊고 다시 동의합니다."],
    retryable: true
  },
  RATE_LIMITED: {
    title: "공급자 호출 제한",
    safeReason: "공급자 API 호출 한도에 도달해 재시도 대기 중입니다.",
    recoverySteps: ["표시된 재시도 시각까지 기다립니다.", "반복되면 자동화 빈도와 공급자 요금제를 확인합니다."],
    retryable: true
  },
  ADAPTER_UNAVAILABLE: {
    title: "Action Adapter 사용 불가",
    safeReason: "고정된 Action 버전을 실행할 서버 Adapter가 없습니다.",
    recoverySteps: ["실행 가능한 다른 Action을 선택합니다.", "업데이트 후 워크플로 버전을 다시 활성화합니다."],
    retryable: false
  },
  PROVIDER_AUTH_FAILED: {
    title: "공급자 인증 실패",
    safeReason: "공급자가 연결 토큰 또는 Credential을 거부했습니다.",
    recoverySteps: ["연동 화면에서 계정을 재연결합니다.", "Client 설정과 공급자 동의 상태를 확인합니다."],
    retryable: false
  },
  PROVIDER_UNAVAILABLE: {
    title: "공급자 일시 장애",
    safeReason: "공급자 API가 일시적으로 요청을 처리하지 못했습니다.",
    recoverySteps: ["자동 재시도를 기다립니다.", "장시간 지속되면 공급자 상태 페이지를 확인합니다."],
    retryable: true
  },
  AUTOMATION_EXECUTION_FAILED: {
    title: "자동화 실행 실패",
    safeReason: "자동화 Step을 안전하게 완료하지 못했습니다.",
    recoverySteps: ["입력값과 연결 상태를 확인합니다.", "문제가 해결된 뒤 재시도합니다."],
    retryable: false
  }
};

export function getAutomationErrorDescriptor(code: string): AutomationErrorDescriptor {
  return CATALOG[toAutomationErrorCode(code)];
}

export function toAutomationErrorCode(code: string, status?: number): AutomationErrorCode {
  if (status === 401 || status === 403) return "PROVIDER_AUTH_FAILED";
  if (status === 429) return "RATE_LIMITED";
  if (code === "ADAPTER_NOT_IMPLEMENTED") return "ADAPTER_UNAVAILABLE";
  if (code === "ACTION_FAILED" && (status === 401 || status === 403)) return "PROVIDER_AUTH_FAILED";
  if (code === "ACTION_FAILED") return "AUTOMATION_EXECUTION_FAILED";
  if ((AUTOMATION_ERROR_CODES as readonly string[]).includes(code)) return code as AutomationErrorCode;
  return "AUTOMATION_EXECUTION_FAILED";
}

export function normalizeAutomationError(error: unknown) {
  const input = error && typeof error === "object"
    ? error as {
        code?: unknown; message?: unknown; retryable?: unknown; retryAfterMs?: unknown; retryAfter?: unknown;
        status?: unknown; apiRequestId?: unknown; rateLimitRemaining?: unknown;
      }
    : {};
  const status = finiteNumber(input.status);
  const code = toAutomationErrorCode(typeof input.code === "string" ? input.code : "AUTOMATION_EXECUTION_FAILED", status ?? undefined);
  const descriptor = getAutomationErrorDescriptor(code);
  const retryAfterMs = finiteNumber(input.retryAfterMs) ?? parseRetryAfter(input.retryAfter);
  return Object.assign(new Error(descriptor.safeReason), {
    code,
    retryable: typeof input.retryable === "boolean" ? input.retryable && descriptor.retryable : descriptor.retryable,
    retryAfterMs: retryAfterMs ?? undefined,
    retryAt: retryAfterMs === null ? null : new Date(Date.now() + retryAfterMs).toISOString(),
    apiRequestId: safeIdentifier(input.apiRequestId),
    rateLimitRemaining: finiteNumber(input.rateLimitRemaining)
  });
}

function safeIdentifier(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:/-]{1,200}$/u.test(value)) return null;
  return value;
}

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function parseRetryAfter(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const date = new Date(value).getTime();
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}
