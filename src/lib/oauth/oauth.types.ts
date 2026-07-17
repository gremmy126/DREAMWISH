export type OAuthProviderId =
  | "google"
  | "slack"
  | "github"
  | "notion"
  | "discord"
  | "microsoft"
  | "dropbox"
  | "firebase";

export type ConnectableOAuthProviderId = Exclude<OAuthProviderId, "firebase">;

export type GoogleOAuthService = "drive" | "gmail" | "calendar" | "sheets" | "youtube";

export type OAuthServiceId =
  | GoogleOAuthService
  | "slack"
  | "github"
  | "notion"
  | "discord"
  | "outlook"
  | "microsoft-teams"
  | "onedrive"
  | "dropbox";

export type OAuthTokenScope = string;

export type OAuthConnectionState =
  | "connected"
  | "configured_unverified"
  | "configuration_only"
  | "expired"
  | "revoked"
  | "error"
  | "not_connected";

export type OAuthTokenRecord = {
  id: string;
  ownerId: string | null;
  provider: OAuthProviderId;
  service: OAuthServiceId | null;
  providerAccountId: string | null;
  accountName: string | null;
  accountEmail: string;
  accountAvatarUrl: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  expiresAt: string | null;
  scope: OAuthTokenScope[];
  status: "active" | "expired" | "revoked";
  verifiedAt: string | null;
  lastVerificationError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OAuthTokenSaveInput = {
  ownerId: string;
  provider: ConnectableOAuthProviderId;
  service?: OAuthServiceId | null;
  providerAccountId?: string | null;
  accountName?: string | null;
  accountEmail: string;
  accountAvatarUrl?: string | null;
  workspaceId?: string | null;
  workspaceName?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  scope: OAuthTokenScope[];
  verifiedAt?: string | null;
  lastVerificationError?: string | null;
};

export type OAuthAuthorizationRequest = {
  provider: ConnectableOAuthProviderId;
  service?: OAuthServiceId;
  redirectUri: string;
  state: string;
  codeChallenge?: string;
  scopes?: OAuthTokenScope[];
};

export type OAuthTokenExchangeInput = {
  provider: ConnectableOAuthProviderId;
  service?: OAuthServiceId | null;
  code: string;
  redirectUri: string;
  codeVerifier?: string | null;
};

export type OAuthTokenExchangeResult = {
  provider: ConnectableOAuthProviderId;
  service: OAuthServiceId | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: OAuthTokenScope[];
  providerAccountId: string | null;
  accountName: string | null;
  accountEmail: string;
  accountAvatarUrl: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
};
