export type OAuthProviderId =
  | "google"
  | "slack"
  | "github"
  | "notion"
  | "discord"
  | "firebase";

export type ConnectableOAuthProviderId = Exclude<OAuthProviderId, "firebase">;

export type GoogleOAuthService = "drive" | "gmail" | "calendar";

export type OAuthServiceId =
  | GoogleOAuthService
  | "slack"
  | "github"
  | "notion"
  | "discord";

export type OAuthTokenScope = string;

export type OAuthTokenRecord = {
  id: string;
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
  createdAt: string;
  updatedAt: string;
};

export type OAuthTokenSaveInput = {
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
