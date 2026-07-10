import type {
  ConsentDraft,
  ConsentGrantStatus,
  ConsentLanguage,
  ConsentModeChoice,
  ConsentPreferences,
  GoogleConsentMode
} from "./types";

export const CONSENT_COOKIE_NAME = "cookieConsent";
export const CONSENT_LOCAL_STORAGE_KEY = CONSENT_COOKIE_NAME;
export const CONSENT_VERSION = 1;
export const COOKIE_SETTINGS_EVENT = "dreamwish:open-cookie-settings";
export const CONSENT_DATA_LAYER_EVENT = "cookie_consent_update";

export const DEFAULT_CONSENT_MODE: GoogleConsentMode = {
  ad_storage: "denied",
  analytics_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  functionality_storage: "granted",
  security_storage: "granted"
};

export const DEFAULT_CONSENT_DRAFT: ConsentDraft = {
  analytics: false,
  ads: false,
  functionality: true
};

export function consentPreferencesFromMode(
  mode: ConsentModeChoice,
  input: Partial<ConsentDraft> & { updatedAt?: string } = {}
): ConsentPreferences {
  const updatedAt = input.updatedAt || new Date().toISOString();

  if (mode === "all") {
    return {
      necessary: true,
      analytics: true,
      ads: true,
      functionality: true,
      updatedAt,
      version: CONSENT_VERSION
    };
  }

  if (mode === "necessary") {
    return {
      necessary: true,
      analytics: false,
      ads: false,
      functionality: true,
      updatedAt,
      version: CONSENT_VERSION
    };
  }

  return {
    necessary: true,
    analytics: input.analytics === true,
    ads: input.ads === true,
    functionality: input.functionality !== false,
    updatedAt,
    version: CONSENT_VERSION
  };
}

export function buildGoogleConsentMode(preferences: ConsentPreferences): GoogleConsentMode {
  return {
    ad_storage: toConsentStatus(preferences.ads),
    analytics_storage: toConsentStatus(preferences.analytics),
    ad_user_data: toConsentStatus(preferences.ads),
    ad_personalization: toConsentStatus(preferences.ads),
    functionality_storage: toConsentStatus(preferences.functionality),
    security_storage: "granted"
  };
}

export function serializeConsentPreferences(preferences: ConsentPreferences) {
  return JSON.stringify({
    necessary: true,
    analytics: preferences.analytics === true,
    ads: preferences.ads === true,
    functionality: preferences.functionality !== false,
    updatedAt: preferences.updatedAt,
    version: CONSENT_VERSION
  });
}

export function parseConsentPreferences(raw: string | null | undefined): ConsentPreferences | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ConsentPreferences>;
    if (parsed.version !== CONSENT_VERSION) return null;

    return consentPreferencesFromMode("selected", {
      analytics: parsed.analytics === true,
      ads: parsed.ads === true,
      functionality: parsed.functionality !== false,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString()
    });
  } catch {
    return null;
  }
}

export function applyGoogleConsentUpdate(preferences: ConsentPreferences) {
  if (typeof window === "undefined") return;

  const consentWindow = window as Window & {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  };
  consentWindow.dataLayer = consentWindow.dataLayer || [];
  consentWindow.gtag =
    consentWindow.gtag ||
    function gtag(...args: unknown[]) {
      consentWindow.dataLayer?.push(args);
    };

  const consent = buildGoogleConsentMode(preferences);
  consentWindow.gtag("consent", "update", consent);
  consentWindow.dataLayer.push({
    event: CONSENT_DATA_LAYER_EVENT,
    cookie_consent: consent
  });
}

export function openCookieSettings() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COOKIE_SETTINGS_EVENT));
}

export function buildConsentInitializerScript() {
  const defaultConsent = inlineConsentObject(DEFAULT_CONSENT_MODE, true);
  const cookieName = JSON.stringify(CONSENT_COOKIE_NAME);
  const storageKey = JSON.stringify(CONSENT_LOCAL_STORAGE_KEY);
  const dataLayerEvent = JSON.stringify(CONSENT_DATA_LAYER_EVENT);

  return `
(function() {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(){window.dataLayer.push(arguments);};
  var gtag = window.gtag;

  gtag('consent', 'default', ${defaultConsent});
  gtag('set', 'url_passthrough', true);
  gtag('set', 'ads_data_redaction', true);

  function readCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\\]\\\\/+^])/g, '\\\\$1') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function status(value) {
    return value === true ? 'granted' : 'denied';
  }

  function normalize(raw) {
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== ${CONSENT_VERSION}) return null;
      return {
        'ad_storage': status(parsed.ads),
        'analytics_storage': status(parsed.analytics),
        'ad_user_data': status(parsed.ads),
        'ad_personalization': status(parsed.ads),
        'functionality_storage': parsed.functionality === false ? 'denied' : 'granted',
        'security_storage': 'granted'
      };
    } catch (error) {
      return null;
    }
  }

  var stored = null;
  try {
    stored = window.localStorage ? window.localStorage.getItem(${storageKey}) : null;
  } catch (error) {
    stored = null;
  }
  if (!stored) stored = readCookie(${cookieName});

  var storedConsent = normalize(stored);
  if (storedConsent) {
    gtag('consent', 'update', storedConsent);
    window.dataLayer.push({ event: ${dataLayerEvent}, cookie_consent: storedConsent });
  }
})();
  `.trim();
}

export const CONSENT_COPY = {
  ko: {
    bannerTitle: "🍪 개인정보 및 쿠키",
    bannerDescription:
      "개인두뇌 AI는 서비스 개선, 로그인 유지, 분석을 위해 쿠키를 사용합니다.",
    bannerNote: "언제든지 설정에서 변경할 수 있습니다.",
    settings: "쿠키 설정",
    necessaryOnly: "필수만 허용",
    saveSelected: "선택 허용",
    acceptAll: "모두 허용",
    close: "닫기",
    modalTitle: "쿠키 설정",
    modalDescription:
      "필수 쿠키는 서비스를 안전하게 제공하기 위해 항상 활성화됩니다. 선택 항목은 언제든지 변경할 수 있습니다.",
    necessaryTitle: "필수 쿠키",
    necessaryDescription: "로그인 유지, 보안, 결제 반환 확인 등 서비스 작동에 필요합니다.",
    alwaysActive: "Always Active",
    analyticsTitle: "분석 쿠키",
    analyticsDescription: "Google Analytics로 서비스 사용 흐름과 성능을 측정합니다.",
    adsTitle: "광고 쿠키",
    adsDescription: "Google Ads 전환 측정과 맞춤 광고 동의에 사용될 수 있습니다.",
    functionalityTitle: "기능 쿠키",
    functionalityDescription: "언어, 화면 설정, 편의 기능 선호도를 저장합니다.",
    enabled: "허용됨",
    disabled: "거부됨"
  },
  en: {
    bannerTitle: "🍪 Privacy and cookies",
    bannerDescription:
      "Dreamwish uses cookies to improve the service, keep you signed in, and measure analytics.",
    bannerNote: "You can change your choice in settings at any time.",
    settings: "Cookie settings",
    necessaryOnly: "Necessary only",
    saveSelected: "Allow selected",
    acceptAll: "Allow all",
    close: "Close",
    modalTitle: "Cookie settings",
    modalDescription:
      "Necessary cookies are always active to keep the service secure. Optional categories can be changed at any time.",
    necessaryTitle: "Necessary cookies",
    necessaryDescription: "Required for sign-in, security, payment return checks, and core service operation.",
    alwaysActive: "Always Active",
    analyticsTitle: "Analytics cookies",
    analyticsDescription: "Measure product usage and performance with Google Analytics.",
    adsTitle: "Advertising cookies",
    adsDescription: "May be used for Google Ads conversion measurement and ad personalization consent.",
    functionalityTitle: "Functionality cookies",
    functionalityDescription: "Store language, display, and convenience preferences.",
    enabled: "Allowed",
    disabled: "Denied"
  },
  ja: {
    bannerTitle: "🍪 プライバシーとCookie",
    bannerDescription:
      "個人頭脳AIは、サービス改善、ログイン維持、分析のためにCookieを使用します。",
    bannerNote: "設定からいつでも変更できます。",
    settings: "Cookie設定",
    necessaryOnly: "必須のみ許可",
    saveSelected: "選択を許可",
    acceptAll: "すべて許可",
    close: "閉じる",
    modalTitle: "Cookie設定",
    modalDescription:
      "必須Cookieはサービスを安全に提供するため常に有効です。任意項目はいつでも変更できます。",
    necessaryTitle: "必須Cookie",
    necessaryDescription: "ログイン維持、セキュリティ、決済戻り確認などに必要です。",
    alwaysActive: "Always Active",
    analyticsTitle: "分析Cookie",
    analyticsDescription: "Google Analyticsで利用状況とパフォーマンスを測定します。",
    adsTitle: "広告Cookie",
    adsDescription: "Google Adsのコンバージョン測定と広告パーソナライズ同意に使用される場合があります。",
    functionalityTitle: "機能Cookie",
    functionalityDescription: "言語、表示、便利機能の設定を保存します。",
    enabled: "許可",
    disabled: "拒否"
  }
} as const;

export function getConsentCopy(language: string | undefined) {
  return CONSENT_COPY[resolveConsentLanguage(language)];
}

export function resolveConsentLanguage(language: string | undefined): ConsentLanguage {
  return language === "en" || language === "ja" || language === "ko" ? language : "ko";
}

function toConsentStatus(value: boolean): ConsentGrantStatus {
  return value ? "granted" : "denied";
}

function inlineConsentObject(mode: GoogleConsentMode, includeWaitForUpdate: boolean) {
  const wait = includeWaitForUpdate ? ",\n    'wait_for_update': 500" : "";
  return `{
    'ad_storage': '${mode.ad_storage}',
    'analytics_storage': '${mode.analytics_storage}',
    'ad_user_data': '${mode.ad_user_data}',
    'ad_personalization': '${mode.ad_personalization}',
    'functionality_storage': '${mode.functionality_storage}',
    'security_storage': '${mode.security_storage}'${wait}
  }`;
}
