const FIREBASE_AUTH_MESSAGES: Record<string, string> = {
  "auth/invalid-email": "올바른 이메일 주소를 입력해주세요.",
  "auth/user-not-found": "이메일 또는 비밀번호가 올바르지 않습니다.",
  "auth/wrong-password": "이메일 또는 비밀번호가 올바르지 않습니다.",
  "auth/email-already-in-use": "이미 가입된 이메일입니다. 로그인하거나 비밀번호를 재설정해주세요.",
  "auth/weak-password": "비밀번호는 6자 이상이어야 합니다.",
  "auth/user-disabled": "비활성화된 계정입니다. 관리자에게 문의해주세요.",
  "auth/too-many-requests": "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
  "auth/network-request-failed": "네트워크 연결을 확인한 후 다시 시도해주세요.",
  "auth/operation-not-allowed": "Firebase Console에서 이 로그인 방법이 활성화되지 않았습니다.",
  "auth/popup-closed-by-user": "로그인 팝업이 취소되었습니다.",
  "auth/cancelled-popup-request": "다른 로그인 팝업이 이미 열려 있습니다.",
  "auth/popup-blocked": "브라우저가 로그인 팝업을 차단했습니다. 팝업을 허용해주세요.",
  "auth/account-exists-with-different-credential":
    "같은 이메일이 다른 로그인 방법으로 가입되어 있습니다. 기존 로그인 방법을 사용해주세요.",
  "auth/credential-already-in-use": "이 로그인 정보는 이미 다른 계정에서 사용 중입니다.",
  "auth/requires-recent-login": "보안을 위해 다시 로그인한 후 비밀번호를 변경해주세요.",
  "auth/unauthorized-domain": "현재 주소는 Firebase에서 허용되지 않은 도메인입니다.",
  "auth/provider-already-linked": "이미 연결된 로그인 방법입니다."
};

const DEFAULT_AUTH_MESSAGE = "인증 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";

export type FirebaseAuthMethod = "password" | "generic";

export function getFirebaseAuthErrorMessage(
  error: unknown,
  method: FirebaseAuthMethod = "generic"
): string {
  const code = getFirebaseErrorCode(error);
  if (code === "auth/invalid-credential") {
    if (method === "password") {
      return "이메일 또는 비밀번호가 올바르지 않습니다.";
    }
    return "로그인 정보가 유효하지 않습니다. 다시 로그인해주세요.";
  }
  return (code && FIREBASE_AUTH_MESSAGES[code]) || DEFAULT_AUTH_MESSAGE;
}

function getFirebaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}
