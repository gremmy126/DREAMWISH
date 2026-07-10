"use client";

import Cookies from "js-cookie";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CookieBanner } from "./CookieBanner";
import { CookieModal } from "./CookieModal";
import {
  CONSENT_COOKIE_NAME,
  CONSENT_LOCAL_STORAGE_KEY,
  COOKIE_SETTINGS_EVENT,
  applyGoogleConsentUpdate,
  consentPreferencesFromMode,
  parseConsentPreferences,
  serializeConsentPreferences
} from "./consent";
import { ConsentContext } from "./useConsent";
import type { ConsentDraft, ConsentPreferences } from "./types";

const CONSENT_COOKIE_DAYS = 180;

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<ConsentPreferences | null>(null);
  const [isBannerOpen, setIsBannerOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const persistPreferences = useCallback((next: ConsentPreferences) => {
    const serialized = serializeConsentPreferences(next);
    setPreferences(next);

    try {
      window.localStorage.setItem(CONSENT_LOCAL_STORAGE_KEY, serialized);
    } catch {
      // localStorage can be blocked in strict privacy contexts; cookie storage remains available.
    }

    Cookies.set(CONSENT_COOKIE_NAME, serialized, {
      expires: CONSENT_COOKIE_DAYS,
      sameSite: "lax",
      secure: window.location.protocol === "https:"
    });

    applyGoogleConsentUpdate(next);
    setIsBannerOpen(false);
  }, []);

  const acceptAll = useCallback(() => {
    persistPreferences(consentPreferencesFromMode("all"));
    setIsModalOpen(false);
  }, [persistPreferences]);

  const acceptNecessary = useCallback(() => {
    persistPreferences(consentPreferencesFromMode("necessary"));
    setIsModalOpen(false);
  }, [persistPreferences]);

  const savePreferences = useCallback(
    (draft: ConsentDraft) => {
      persistPreferences(consentPreferencesFromMode("selected", draft));
      setIsModalOpen(false);
    },
    [persistPreferences]
  );

  const openSettings = useCallback(() => setIsModalOpen(true), []);
  const closeSettings = useCallback(() => setIsModalOpen(false), []);

  useEffect(() => {
    const storedPreferences = readStoredPreferences();
    if (storedPreferences) {
      setPreferences(storedPreferences);
      applyGoogleConsentUpdate(storedPreferences);
    } else {
      setIsBannerOpen(true);
    }
    setIsReady(true);
  }, []);

  useEffect(() => {
    window.addEventListener(COOKIE_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, openSettings);
  }, [openSettings]);

  const contextValue = useMemo(
    () => ({
      preferences,
      isBannerOpen,
      isModalOpen,
      acceptAll,
      acceptNecessary,
      savePreferences,
      openSettings,
      closeSettings
    }),
    [
      acceptAll,
      acceptNecessary,
      closeSettings,
      isBannerOpen,
      isModalOpen,
      openSettings,
      preferences,
      savePreferences
    ]
  );

  return (
    <ConsentContext.Provider value={contextValue}>
      {children}
      {isReady ? (
        <>
          <CookieBanner />
          <CookieModal />
        </>
      ) : null}
    </ConsentContext.Provider>
  );
}

function readStoredPreferences() {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(CONSENT_LOCAL_STORAGE_KEY);
  } catch {
    raw = null;
  }

  return parseConsentPreferences(raw) || parseConsentPreferences(Cookies.get(CONSENT_COOKIE_NAME));
}
