"use client";

import { useEffect, useState } from "react";
import {
  LANGUAGE_PREFERENCE_EVENT,
  applyDocumentLanguage,
  readStoredLanguagePreference,
  type LanguagePreference
} from "@/src/lib/settings/app-preferences";
import { t, type AppLanguage, type TranslationKey } from "./translations";

export function useAppLanguage() {
  const [language, setLanguage] = useState<AppLanguage>("ko");

  useEffect(() => {
    function sync(next?: string) {
      const resolved = applyDocumentLanguage(
        next || readStoredLanguagePreference(window.localStorage),
        document
      ).language as AppLanguage;
      setLanguage(resolved);
    }

    function syncFromStorage() {
      sync();
    }

    function syncFromEvent(event: Event) {
      const detail = (event as CustomEvent<{ language?: LanguagePreference }>).detail;
      sync(detail?.language);
    }

    sync();
    window.addEventListener("storage", syncFromStorage);
    window.addEventListener(LANGUAGE_PREFERENCE_EVENT, syncFromEvent);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener(LANGUAGE_PREFERENCE_EVENT, syncFromEvent);
    };
  }, []);

  return {
    language,
    t: (key: TranslationKey, values?: Record<string, string>) => t(language, key, values)
  };
}
