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
