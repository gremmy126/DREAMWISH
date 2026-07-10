"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { CookieSettings } from "./CookieSettings";
import { DEFAULT_CONSENT_DRAFT, getConsentCopy } from "./consent";
import { useConsent } from "./useConsent";
import type { ConsentDraft } from "./types";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";

export function CookieModal() {
  const { language } = useAppLanguage();
  const copy = getConsentCopy(language);
  const {
    isModalOpen,
    preferences,
    closeSettings,
    acceptAll,
    acceptNecessary,
    savePreferences
  } = useConsent();
  const [draft, setDraft] = useState<ConsentDraft>(DEFAULT_CONSENT_DRAFT);

  useEffect(() => {
    if (!isModalOpen) return;
    setDraft({
      analytics: preferences?.analytics ?? DEFAULT_CONSENT_DRAFT.analytics,
      ads: preferences?.ads ?? DEFAULT_CONSENT_DRAFT.ads,
      functionality: preferences?.functionality ?? DEFAULT_CONSENT_DRAFT.functionality
    });
  }, [isModalOpen, preferences]);

  useEffect(() => {
    if (!isModalOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeSettings();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeSettings, isModalOpen]);

  return (
    <AnimatePresence>
      {isModalOpen ? (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/30 px-3 py-4 backdrop-blur-md sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSettings();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-modal-title"
            aria-describedby="cookie-modal-description"
            className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-app border border-app-border bg-app-card p-5 text-app-text shadow-app sm:p-6"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="cookie-modal-title" className="text-lg font-semibold">
                  {copy.modalTitle}
                </h2>
                <p id="cookie-modal-description" className="mt-2 text-sm leading-6 text-app-muted">
                  {copy.modalDescription}
                </p>
              </div>
              <button
                type="button"
                onClick={closeSettings}
                aria-label={copy.close}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-app border border-app-border bg-app-bg text-app-muted transition hover:bg-app-hover focus:outline-none focus:ring-2 focus:ring-app-primary"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5">
              <CookieSettings draft={draft} labels={copy} onChange={setDraft} />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={acceptNecessary}
                className="h-11 rounded-app bg-app-soft px-4 text-sm font-semibold text-app-text transition hover:bg-app-hover focus:outline-none focus:ring-2 focus:ring-app-primary focus:ring-offset-2 focus:ring-offset-app-card"
              >
                {copy.necessaryOnly}
              </button>
              <button
                type="button"
                onClick={() => savePreferences(draft)}
                className="h-11 rounded-app border border-app-border bg-app-card px-4 text-sm font-semibold text-app-text transition hover:bg-app-hover focus:outline-none focus:ring-2 focus:ring-app-primary focus:ring-offset-2 focus:ring-offset-app-card"
              >
                {copy.saveSelected}
              </button>
              <button
                type="button"
                onClick={acceptAll}
                className="h-11 rounded-app bg-blue-600 px-4 text-sm font-semibold text-white shadow-soft transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-app-card"
              >
                {copy.acceptAll}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
