export type LoginMode = "signin" | "signup";

export type LoginFieldErrors = {
  email?: string;
  password?: string;
};

export type LoginSubmissionDecision = {
  action: LoginMode | null;
  canSubmit: boolean;
  fieldErrors: LoginFieldErrors;
};

export type PasswordResetDecision = {
  action: "reset" | null;
  canSubmit: boolean;
  emailError: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function validateLoginForm(input: {
  email: string;
  password: string;
  mode: LoginMode;
}): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  const email = input.email.trim();

  if (!email) errors.email = "이메일을 입력해주세요.";
  else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "올바른 이메일 주소를 입력해주세요.";
  }

  if (!input.password) errors.password = "비밀번호를 입력해주세요.";
  else if (input.mode === "signup" && input.password.length < 6) {
    errors.password = "비밀번호는 6자 이상이어야 합니다.";
  }

  return errors;
}

export function validatePasswordResetEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return "비밀번호를 재설정할 이메일을 입력해주세요.";
  if (!EMAIL_PATTERN.test(value)) return "올바른 이메일 주소를 입력해주세요.";
  return null;
}

export function decideLoginSubmission(input: {
  email: string;
  password: string;
  mode: LoginMode;
}): LoginSubmissionDecision {
  const fieldErrors = validateLoginForm(input);
  const canSubmit = Object.keys(fieldErrors).length === 0;

  return {
    action: canSubmit ? input.mode : null,
    canSubmit,
    fieldErrors
  };
}

export function decidePasswordReset(email: string): PasswordResetDecision {
  const emailError = validatePasswordResetEmail(email);
  const canSubmit = emailError === null;

  return {
    action: canSubmit ? "reset" : null,
    canSubmit,
    emailError
  };
}
