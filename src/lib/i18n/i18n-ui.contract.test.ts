import { SIDEBAR_NAV_ORDER } from "@/components/layout/Sidebar";
import { APP_TRANSLATIONS, type AppLanguage, t } from "@/src/lib/i18n/translations";
import { buildPaymentButtonState } from "@/src/lib/payments/payment-state";
import { LANGUAGE_OPTIONS, resolveLanguagePreference } from "@/src/lib/settings/app-preferences";

const languages: AppLanguage[] = ["ko", "en", "ja"];

const expectedSidebarOrder: readonly [
  "chat",
  "memory",
  "crm",
  "automation",
  "calendar",
  "files",
  "integrations",
  "settings"
] = SIDEBAR_NAV_ORDER;

const languageOptions: readonly [
  { readonly value: "ko"; readonly label: "한국어"; readonly shortLabel: "한국어" },
  { readonly value: "en"; readonly label: "English"; readonly shortLabel: "English" },
  { readonly value: "ja"; readonly label: "日本語"; readonly shortLabel: "日本語" }
] = LANGUAGE_OPTIONS;
const paidUserStillSeesUpgrade: false = buildPaymentButtonState(true).hidden;

function assertI18nUiContracts() {
  resolveLanguagePreference("fr").language satisfies "ko";

  for (const language of languages) {
    APP_TRANSLATIONS[language].settings.pageTitle satisfies string;
    APP_TRANSLATIONS[language].settings.languageChanged satisfies string;
    APP_TRANSLATIONS[language].pricing.pageTitle satisfies string;
    APP_TRANSLATIONS[language].billing.successTitle satisfies string;
    APP_TRANSLATIONS[language].storage.title satisfies string;
    APP_TRANSLATIONS[language].sidebar.checkoutNotConfigured satisfies string;
  }

  t("ko", "settings.languageChanged") satisfies string;
  t("en", "settings.languageChanged") satisfies string;
  t("ja", "settings.languageChanged") satisfies string;
}

void expectedSidebarOrder;
void languageOptions;
void assertI18nUiContracts;
