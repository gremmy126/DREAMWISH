"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Settings2 } from "lucide-react";
import { getConsentCopy } from "./consent";
import { useConsent } from "./useConsent";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";

export function CookieBanner() {
  const { language } = useAppLanguage();
  const copy = getConsentCopy(language);
  const { isBannerOpen, acceptAll, acceptNecessary, openSettings } = useConsent();

  return (
    <AnimatePresence>
      {isBannerOpen ? (
        <motion.section
          aria-labelledby="cookie-banner-title"
          aria-live="polite"
          className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-6 sm:pb-6"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 28 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-4 rounded-app border border-app-border bg-app-card/95 p-4 text-app-text shadow-app backdrop-blur-xl sm:p-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h2 id="cookie-banner-title" className="text-base font-semibold">
                {copy.bannerTitle}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-app-muted">
                {copy.bannerDescription}
              </p>
              <p className="mt-1 text-xs leading-5 text-app-muted">{copy.bannerNote}</p>
              <button
                type="button"
                onClick={openSettings}
                className="mt-3 inline-flex items-center gap-2 rounded-app border border-app-border bg-app-bg px-3 py-2 text-xs font-semibold text-app-text transition hover:bg-app-hover focus:outline-none focus:ring-2 focus:ring-app-primary focus:ring-offset-2 focus:ring-offset-app-card"
              >
                <Settings2 size={15} aria-hidden="true" />
                {copy.settings}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:min-w-[420px]">
              <button
                type="button"
                onClick={acceptNecessary}
                className="h-11 rounded-app bg-app-soft px-4 text-sm font-semibold text-app-text transition hover:bg-app-hover focus:outline-none focus:ring-2 focus:ring-app-primary focus:ring-offset-2 focus:ring-offset-app-card"
              >
                {copy.necessaryOnly}
              </button>
              <button
                type="button"
                onClick={openSettings}
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
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
