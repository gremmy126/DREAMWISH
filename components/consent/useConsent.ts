"use client";

import { createContext, useContext } from "react";
import type { ConsentDraft, ConsentPreferences } from "./types";

export type ConsentContextValue = {
  preferences: ConsentPreferences | null;
  isBannerOpen: boolean;
  isModalOpen: boolean;
  acceptAll: () => void;
  acceptNecessary: () => void;
  savePreferences: (draft: ConsentDraft) => void;
  openSettings: () => void;
  closeSettings: () => void;
};

export const ConsentContext = createContext<ConsentContextValue | null>(null);

export function useConsent() {
  const context = useContext(ConsentContext);
  if (!context) {
    throw new Error("useConsent must be used inside ConsentProvider");
  }
  return context;
}
