import assert from "node:assert/strict";
import {
  CONSENT_COOKIE_NAME,
  DEFAULT_CONSENT_MODE,
  buildConsentInitializerScript,
  buildGoogleConsentMode,
  consentPreferencesFromMode,
  serializeConsentPreferences
} from "../components/consent/consent";

test("Consent Mode v2 default denies analytics and ads while granting required storage", () => {
  assert.deepEqual(DEFAULT_CONSENT_MODE, {
    ad_storage: "denied",
    analytics_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    functionality_storage: "granted",
    security_storage: "granted"
  });
});

test("Consent preferences map to Google Consent Mode v2 update values", () => {
  assert.deepEqual(buildGoogleConsentMode(consentPreferencesFromMode("all")), {
    ad_storage: "granted",
    analytics_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "granted",
    functionality_storage: "granted",
    security_storage: "granted"
  });

  assert.deepEqual(buildGoogleConsentMode(consentPreferencesFromMode("necessary")), {
    ad_storage: "denied",
    analytics_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    functionality_storage: "granted",
    security_storage: "granted"
  });
});

test("Consent preferences are serializable for localStorage and cookies", () => {
  const serialized = serializeConsentPreferences({
    necessary: true,
    analytics: true,
    ads: false,
    functionality: true,
    updatedAt: "2026-07-10T00:00:00.000Z",
    version: 1
  });
  assert.equal(
    serialized,
    '{"necessary":true,"analytics":true,"ads":false,"functionality":true,"updatedAt":"2026-07-10T00:00:00.000Z","version":1}'
  );
});

test("Consent initializer defines dataLayer, default consent, privacy flags, and stored update", () => {
  const script = buildConsentInitializerScript();
  assert.match(script, /window\.dataLayer = window\.dataLayer \|\| \[\]/u);
  assert.match(script, /gtag\('consent', 'default'/u);
  assert.match(script, /'wait_for_update': 500/u);
  assert.match(script, /gtag\('set', 'url_passthrough', true\)/u);
  assert.match(script, /gtag\('set', 'ads_data_redaction', true\)/u);
  assert.match(script, new RegExp(CONSENT_COOKIE_NAME, "u"));
  assert.match(script, /gtag\('consent', 'update'/u);
  assert.doesNotThrow(() => new Function(script));
});
