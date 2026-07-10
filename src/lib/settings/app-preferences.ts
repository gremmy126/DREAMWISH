export type ThemePreference = "system" | "light" | "dark";

export const APP_SETTINGS_STORAGE_KEY = "local-first-ai-settings-v2";
export const LANGUAGE_PREFERENCE_EVENT = "dreamwish-language-preference-change";

export const LANGUAGE_OPTIONS = [
  { value: "ko", label: "한국어", shortLabel: "한국어" },
  { value: "en", label: "English", shortLabel: "English" },
  { value: "ja", label: "日本語", shortLabel: "日本語" }
] as const;

export type LanguagePreference = (typeof LANGUAGE_OPTIONS)[number]["value"];
type ResolveLanguageResult<T extends string> = T extends "en"
  ? { language: "en"; htmlLang: "en" }
  : T extends "ja"
    ? { language: "ja"; htmlLang: "ja" }
    : T extends "ko"
      ? { language: "ko"; htmlLang: "ko" }
      : string extends T
        ? { language: LanguagePreference; htmlLang: LanguagePreference }
        : { language: "ko"; htmlLang: "ko" };
type LanguageLabel<T extends string> = T extends "en"
  ? "English"
  : T extends "ja"
    ? "日本語"
    : "한국어";

export function resolveThemePreference(
  value: string,
  systemPrefersDark = false
): { mode: ThemePreference; dataTheme: "light" | "dark" } {
  const mode: ThemePreference =
    value === "light" || value === "dark" || value === "system" ? value : "system";
  return {
    mode,
    dataTheme: mode === "system" ? (systemPrefersDark ? "dark" : "light") : mode
  };
}

export function resolveLanguagePreference<T extends string>(
  value: T
): ResolveLanguageResult<T> {
  const rawValue = String(value);
  const language: LanguagePreference =
    rawValue === "en" || rawValue === "ja" || rawValue === "ko"
      ? (rawValue as LanguagePreference)
      : "ko";
  return { language, htmlLang: language } as ResolveLanguageResult<T>;
}

export function getLanguageLabel<T extends string>(value: T): LanguageLabel<T> {
  const language = resolveLanguagePreference(value).language;
  return (LANGUAGE_OPTIONS.find((option) => option.value === language)?.label ||
    "한국어") as LanguageLabel<T>;
}

export function applyDocumentLanguage(value: string, documentRef: Document) {
  const language = resolveLanguagePreference(value);
  documentRef.documentElement.lang = language.htmlLang;
  documentRef.documentElement.dataset.language = language.language;
  return language;
}

export function readStoredLanguagePreference(storage: Storage): LanguagePreference {
  try {
    const raw = storage.getItem(APP_SETTINGS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { language?: string }) : null;
    return resolveLanguagePreference(parsed?.language || detectSystemLanguagePreference()).language;
  } catch {
    return detectSystemLanguagePreference();
  }
}

export function writeStoredLanguagePreference(
  storage: Storage,
  value: string
): LanguagePreference {
  const language = resolveLanguagePreference(value).language;
  let parsed: Record<string, unknown> = {};
  try {
    const raw = storage.getItem(APP_SETTINGS_STORAGE_KEY);
    parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    parsed = {};
  }
  storage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({ ...parsed, language }));
  return language;
}

export function emitLanguagePreferenceChange(language: LanguagePreference) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(LANGUAGE_PREFERENCE_EVENT, {
      detail: { language }
    })
  );
}

function detectSystemLanguagePreference(): LanguagePreference {
  const rawLanguage =
    typeof navigator === "undefined"
      ? ""
      : navigator.languages?.[0] || navigator.language || "";
  const baseLanguage = rawLanguage.toLowerCase().split("-")[0];
  return resolveLanguagePreference(baseLanguage).language;
}
