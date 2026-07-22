export type PrivacyMode = {
  localOnly: boolean;
  allowExternalAI: boolean;
  showExternalWarning: boolean;
};

export function getPrivacyMode(): PrivacyMode {
  const localOnly = readBoolean("PRIVACY_LOCAL_ONLY") === true;
  const explicitExternal =
    readBoolean("ALLOW_EXTERNAL_AI") ?? readBoolean("PRIVACY_ALLOW_EXTERNAL_AI");
  return {
    localOnly,
    allowExternalAI:
      !localOnly && (explicitExternal ?? hasConfiguredExternalProvider()),
    showExternalWarning: process.env.SHOW_EXTERNAL_AI_WARNING !== "false"
  };
}

function readBoolean(key: string): boolean | undefined {
  const value = process.env[key]?.trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function hasConfiguredExternalProvider() {
  return [
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "OPENROUTER_API_KEY",
    "GROQ_API_KEY",
    "HF_TOKEN",
    "HUGGINGFACE_API_KEY",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_API_KEY"
  ].some((key) => Boolean(process.env[key]?.trim()));
}

export function isExternalProvider(providerName: string) {
  return (
    providerName === "claude" ||
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
