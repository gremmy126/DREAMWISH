export type PrivacyMode = {
  localOnly: boolean;
  allowExternalAI: boolean;
  showExternalWarning: boolean;
};

export function getPrivacyMode(): PrivacyMode {
  return {
    localOnly: process.env.PRIVACY_LOCAL_ONLY === "true",
    allowExternalAI:
      process.env.ALLOW_EXTERNAL_AI === "true" ||
      process.env.PRIVACY_ALLOW_EXTERNAL_AI === "true",
    showExternalWarning: process.env.SHOW_EXTERNAL_AI_WARNING !== "false"
  };
}

export function isExternalProvider(providerName: string) {
  return (
    providerName === "groq" ||
    providerName === "gemini" ||
    providerName === "openrouter" ||
    providerName === "huggingface" ||
    providerName === "cloudflare"
  );
}

export function assertProviderAllowed(providerName: string) {
  const privacyMode = getPrivacyMode();

  if (!isExternalProvider(providerName)) {
    return;
  }

  if (privacyMode.localOnly) {
    throw new Error(
      "개인정보 보호 모드가 localOnly입니다. Ollama 또는 LM Studio 같은 로컬 Provider를 선택해주세요."
    );
  }

  if (!privacyMode.allowExternalAI) {
    throw new Error(
      "외부 무료 AI Provider 사용이 허용되지 않았습니다. 문서 내용이 외부 API로 전송될 수 있으므로 ALLOW_EXTERNAL_AI=true 설정이 필요합니다."
    );
  }
}
