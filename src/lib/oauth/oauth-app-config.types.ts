import type { ConnectableOAuthProviderId } from "./oauth.types";

export type OAuthAppConfigStatus = "active" | "revoked" | "reauthorization_required";

export type OAuthAppConfigRecord = {
  id: string;
  ownerId: string;
  appId: string;
  provider: ConnectableOAuthProviderId;
  clientId: string;
  clientSecretCiphertext: string;
  redirectUri: string;
  version: number;
  status: OAuthAppConfigStatus;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
};

export type ResolvedOAuthAppConfig = Omit<OAuthAppConfigRecord, "clientSecretCiphertext"> & {
  clientSecret: string;
};

export type PublicOAuthAppConfig = Pick<
  OAuthAppConfigRecord,
  "id" | "appId" | "provider" | "clientId" | "redirectUri" | "version" | "status" | "updatedAt"
> & { clientSecretConfigured: boolean };

export type OAuthClientCredentials = {
  clientId: string;
  clientSecret: string;
};

export function toPublicOAuthAppConfig(record: OAuthAppConfigRecord): PublicOAuthAppConfig {
  return {
    id: record.id,
    appId: record.appId,
    provider: record.provider,
    clientId: record.clientId,
    redirectUri: record.redirectUri,
    version: record.version,
    status: record.status,
    updatedAt: record.updatedAt,
    clientSecretConfigured: record.clientSecretCiphertext.length > 0
  };
}

export class OAuthAppConfigError extends Error {
  constructor(
    readonly code:
      | "OAUTH_APP_CONFIG_REQUIRED"
      | "OAUTH_APP_CONFIG_CHANGED"
      | "OAUTH_APP_CONFIG_INVALID",
    message: string
  ) {
    super(message);
    this.name = "OAuthAppConfigError";
  }
}
