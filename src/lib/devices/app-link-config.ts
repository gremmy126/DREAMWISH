const DEFAULT_ANDROID_PACKAGE = "kr.co.dreamwish.companion";
const DEFAULT_APPLE_BUNDLE_ID = "kr.co.dreamwish.companion";

export const COMPANION_PAIRING_PATHS = ["/pair", "/companion/pair"] as const;

export type AndroidAssetLink = {
  relation: string[];
  target: {
    namespace: "android_app";
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
};

export type AppleAppSiteAssociation = {
  applinks: {
    apps: [];
    details: Array<{ appID: string; paths: string[] }>;
  };
};

export function getAndroidAppLinkConfig() {
  const packageName = process.env.ANDROID_APP_PACKAGE?.trim() || DEFAULT_ANDROID_PACKAGE;
  const fingerprint = normalizeSha256Fingerprint(process.env.ANDROID_APP_SHA256_CERT_FINGERPRINT);
  return { packageName, fingerprint };
}

export function getAppleAppLinkConfig() {
  const teamId = process.env.APPLE_TEAM_ID?.trim() || null;
  const bundleId = process.env.APPLE_BUNDLE_ID?.trim() || DEFAULT_APPLE_BUNDLE_ID;
  return { teamId, bundleId };
}

export function buildAndroidAssetLinks(): AndroidAssetLink[] {
  const { packageName, fingerprint } = getAndroidAppLinkConfig();
  if (!fingerprint) return [];
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: [fingerprint]
      }
    }
  ];
}

export function buildAppleAppSiteAssociation(): AppleAppSiteAssociation {
  const { teamId, bundleId } = getAppleAppLinkConfig();
  return {
    applinks: {
      apps: [],
      details: teamId
        ? [{ appID: `${teamId}.${bundleId}`, paths: [...COMPANION_PAIRING_PATHS] }]
        : []
    }
  };
}

function normalizeSha256Fingerprint(raw: string | undefined) {
  const value = raw?.trim().toUpperCase();
  if (!value) return null;
  if (!/^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/u.test(value)) return null;
  return value;
}
