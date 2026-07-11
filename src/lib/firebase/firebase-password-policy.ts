export type PasswordChangeInput = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export function validatePasswordChange(input: PasswordChangeInput): string | null {
  if (!input.currentPassword) return "현재 비밀번호를 입력해주세요.";
  if (input.newPassword.length < 6) return "새 비밀번호는 6자 이상이어야 합니다.";
  if (input.newPassword !== input.confirmPassword) {
    return "새 비밀번호와 비밀번호 확인이 일치하지 않습니다.";
  }
  if (input.currentPassword === input.newPassword) {
    return "새 비밀번호는 현재 비밀번호와 달라야 합니다.";
  }
  return null;
}

export function hasPasswordProvider(
  providerData: ReadonlyArray<{ providerId?: string | null }>
): boolean {
  return providerData.some((provider) => provider.providerId === "password");
}
