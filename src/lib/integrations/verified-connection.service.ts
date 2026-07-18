import { AUTOMATION_APPS } from "../automation/app-registry";

type CredentialLike = {
  id: string;
  appId: string;
  label: string;
  masked: string;
  accountLabel?: string | null;
  verificationStatus?: "verified" | "needs_reconnect";
  verifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type OAuthLike = {
  status: string;
  accountLabel?: string | null;
  verifiedAt?: string | null;
  connectionState?: string;
  canConnect?: boolean;
};

type SyncLike = { connectorId: string; enabled: boolean };
type OAuthAppConfigLike = { appId: string; status: string };

export type VerifiedConnectionState = {
  connectorId: string;
  label: string;
  logoPath: string;
  status: "connected" | "not_connected" | "needs_reconnect";
  authMode: "oauth" | "credential" | null;
  accountLabel: string | null;
  verifiedAt: string | null;
  canConnect: boolean;
  operatorSetupRequired: boolean;
  userOAuthSetupRequired: boolean;
};

export function mergeVerifiedConnectionStates(
  credentials: CredentialLike[],
  oauthStates: Record<string, OAuthLike | undefined>,
  _syncSettings: SyncLike[] = [],
  oauthAppConfigs: OAuthAppConfigLike[] = [],
): VerifiedConnectionState[] {
  const activeOAuthAppIds = new Set(
    oauthAppConfigs.filter((config) => config.status === "active").map((config) => config.appId)
  );
  return AUTOMATION_APPS.map((app) => {
    const appCredentials = credentials.filter((item) => item.appId === app.id);
    const verifiedCredential = appCredentials.find((item) => item.verificationStatus === "verified" && Boolean(item.verifiedAt));
    const oauth = oauthStates[app.id];
    const ownerOAuthConfigured = activeOAuthAppIds.has(app.id);
    const canConnect = Boolean(app.credentialFields.length || ownerOAuthConfigured);
    const userOAuthSetupRequired = Boolean(app.oauthTarget && !ownerOAuthConfigured);
    if (oauth?.status === "connected" && oauth.verifiedAt && ownerOAuthConfigured) {
      return state(app, "connected", "oauth", oauth.accountLabel || app.label, oauth.verifiedAt, canConnect, userOAuthSetupRequired);
    }
    if (verifiedCredential) {
      return state(app, "connected", "credential", verifiedCredential.accountLabel || verifiedCredential.label, verifiedCredential.verifiedAt || null, true, userOAuthSetupRequired);
    }
    const oauthNeedsReconnect = oauth && (
      ["configured_unverified", "expired", "revoked", "error"].includes(oauth.connectionState || "") ||
      (oauth.status === "connected" && !ownerOAuthConfigured)
    );
    if (appCredentials.length || oauthNeedsReconnect) {
      return state(app, "needs_reconnect", null, null, null, canConnect, userOAuthSetupRequired);
    }
    return state(app, "not_connected", null, null, null, canConnect, userOAuthSetupRequired);
  });
}

export async function getVerifiedConnectionStates(ownerId: string, requestUrl?: string) {
  const [{ listCredentials }, { getConnectorAuthState }, { listIntegrationSyncSettings }, { listOAuthAppConfigs }] = await Promise.all([
    import("../automation/credential.repository"),
    import("./connection-status"),
    import("./integration-settings.repository"),
    import("../repositories/oauth-app-config.repository"),
  ]);
  const [credentials, syncSettings, oauthEntries, oauthAppConfigs] = await Promise.all([
    listCredentials(ownerId),
    listIntegrationSyncSettings(ownerId),
    Promise.all(AUTOMATION_APPS.filter((app) => app.oauthTarget).map(async (app) => [app.id, await getConnectorAuthState(ownerId, app.id, requestUrl)] as const)),
    listOAuthAppConfigs(ownerId),
  ]);
  return mergeVerifiedConnectionStates(
    credentials,
    Object.fromEntries(oauthEntries),
    syncSettings,
    oauthAppConfigs.map((config) => ({ appId: config.appId, status: config.status }))
  );
}

function state(
  app: (typeof AUTOMATION_APPS)[number],
  status: VerifiedConnectionState["status"],
  authMode: VerifiedConnectionState["authMode"],
  accountLabel: string | null,
  verifiedAt: string | null,
  canConnect: boolean,
  userOAuthSetupRequired: boolean,
): VerifiedConnectionState {
  return {
    connectorId: app.id,
    label: app.label,
    logoPath: app.logoPath,
    status,
    authMode,
    accountLabel,
    verifiedAt,
    canConnect,
    operatorSetupRequired: app.supportedAuthModes.includes("oauth") && !app.oauthTarget && app.credentialFields.length === 0,
    userOAuthSetupRequired,
  };
}
