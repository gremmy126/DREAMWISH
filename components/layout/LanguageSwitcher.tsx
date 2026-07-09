"use client";

import { Languages } from "lucide-react";
import { useEffect, useState } from "react";
import {
  LANGUAGE_PREFERENCE_EVENT,
  applyDocumentLanguage,
  emitLanguagePreferenceChange,
  readStoredLanguagePreference,
  writeStoredLanguagePreference,
  type LanguagePreference
} from "@/src/lib/settings/app-preferences";
import { SIDEBAR_LANGUAGE_OPTIONS } from "@/src/lib/settings/sidebar-language";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const [language, setLanguage] = useState<LanguagePreference>("ko");

  useEffect(() => {
    function syncFromStorage() {
      const nextLanguage = readStoredLanguagePreference(window.localStorage);
      setLanguage(nextLanguage);
      applyDocumentLanguage(nextLanguage, document);
    }

    function syncFromEvent(event: Event) {
      const detail = (event as CustomEvent<{ language?: string }>).detail;
      const nextLanguage = applyDocumentLanguage(
        detail?.language || readStoredLanguagePreference(window.localStorage),
        document
      ).language;
      setLanguage(nextLanguage);
    }

    syncFromStorage();
    window.addEventListener("storage", syncFromStorage);
    window.addEventListener(LANGUAGE_PREFERENCE_EVENT, syncFromEvent);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener(LANGUAGE_PREFERENCE_EVENT, syncFromEvent);
    };
  }, []);

  function changeLanguage(nextValue: LanguagePreference) {
    const nextLanguage = writeStoredLanguagePreference(window.localStorage, nextValue);
    setLanguage(nextLanguage);
    applyDocumentLanguage(nextLanguage, document);
    emitLanguagePreferenceChange(nextLanguage);
  }

  return (
    <div
      className={`flex items-center gap-1 rounded-2xl border border-app-border bg-white p-1 shadow-soft ${
        compact ? "w-full justify-between" : "h-10"
      }`}
      aria-label="사이트 언어"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center text-app-muted">
        <Languages size={16} />
      </span>
      <div className={`flex min-w-0 gap-1 ${compact ? "flex-1" : ""}`}>
        {SIDEBAR_LANGUAGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => changeLanguage(option.value)}
            className={`h-8 rounded-xl px-2 text-xs font-semibold transition ${
              compact ? "flex-1" : ""
            } ${
              language === option.value
                ? "bg-app-primary text-white"
                : "text-app-muted hover:bg-app-hover hover:text-app-primary"
            }`}
          >
            {option.shortLabel}
          </button>
        ))}
      </div>
    </div>
  );
}
