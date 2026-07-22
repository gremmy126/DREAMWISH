import type { OwnerContext } from "../auth/owner-context";
import { OwnerContextError, requireOwnerContext } from "../auth/owner-context";
import { CsrfValidationError } from "../security/csrf";
import type { AdminAction, OperationalAccount } from "./account-admin.types";

export class AdminAccessError extends Error {
  readonly status = 403 as const;
  readonly code = "ADMIN_REQUIRED" as const;

  constructor(message = "Administrator access is required.") {
    super(message);
    this.name = "AdminAccessError";
  }
}

export async function requireAdminContext(request: Request): Promise<OwnerContext> {
  const owner = await requireOwnerContext(request);
  if (owner.role !== "admin") throw new AdminAccessError();
  return owner;
}

export type AdminErrorInfo = { status: number; code: string; message: string };

// 관리자 API 공통 오류 → 상태 코드 매핑. 인증 실패(401)와 권한/CSRF 실패
// (403)를 정확히 구분해, 값 검증 실패를 403으로 뭉뚱그리는 문제를 막는다.
export function classifyAdminAuthError(error: unknown): AdminErrorInfo | null {
  if (error instanceof OwnerContextError) {
    return { status: 401, code: error.code, message: "로그인이 필요합니다." };
  }
  if (error instanceof AdminAccessError) {
    return { status: 403, code: error.code, message: "관리자 권한이 필요합니다." };
  }
  if (error instanceof CsrfValidationError) {
    return { status: 403, code: error.code, message: "요청 출처를 확인할 수 없습니다." };
  }
  return null;
}

export function assertAdminMutationAllowed(
  actor: OperationalAccount,
  target: OperationalAccount,
  action: AdminAction,
  activeAdministratorCount: number
) {
  if (actor.role !== "admin" || actor.status !== "active") {
    throw new AdminAccessError();
  }
  const selfDestructive = ["suspend", "demote", "schedule_delete", "delete"].includes(action);
  const removesActiveAdmin =
    target.role === "admin" && target.status === "active" && selfDestructive;
  if (removesActiveAdmin && activeAdministratorCount <= 1) {
    throw new AdminAccessError("The last active administrator cannot be removed.");
  }
  if (actor.id === target.id && selfDestructive) {
    throw new AdminAccessError("You cannot modify your own administrator account this way.");
  }
}
