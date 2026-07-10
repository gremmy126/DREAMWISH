export type ConsentGrantStatus = "granted" | "denied";

export type ConsentLanguage = "ko" | "en" | "ja";

export type ConsentModeChoice = "necessary" | "selected" | "all";

export type GoogleConsentMode = {
  ad_storage: ConsentGrantStatus;
  analytics_storage: ConsentGrantStatus;
  ad_user_data: ConsentGrantStatus;
  ad_personalization: ConsentGrantStatus;
  functionality_storage: ConsentGrantStatus;
  security_storage: ConsentGrantStatus;
};

export type ConsentPreferences = {
  necessary: true;
  analytics: boolean;
  ads: boolean;
  functionality: boolean;
  updatedAt: string;
  version: 1;
};

export type ConsentDraft = Pick<ConsentPreferences, "analytics" | "ads" | "functionality">;
