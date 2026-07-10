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
    throw new Error("Privacy mode is localOnly. External AI providers are disabled.");
  }

  if (!privacyMode.allowExternalAI) {
    throw new Error("External AI providers are disabled. Set ALLOW_EXTERNAL_AI=true to use connected AI.");
  }
}
