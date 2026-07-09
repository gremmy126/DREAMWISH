export type OAuthProviderId = "google" | "slack" | "github" | "notion" | "firebase";

export type OAuthTokenScope = string;

export type OAuthTokenRecord = {
  id: string;
  provider: OAuthProviderId;
  accountEmail: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  expiresAt: string | null;
  scope: OAuthTokenScope[];
  status: "active" | "expired" | "revoked";
  createdAt: string;
  updatedAt: string;
};

export type OAuthTokenSaveInput = {
  provider: OAuthProviderId;
  accountEmail: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  scope: OAuthTokenScope[];
};

export type OAuthAuthorizationRequest = {
  provider: OAuthProviderId;
  redirectUri: string;
  state: string;
  scopes?: OAuthTokenScope[];
};

export type OAuthTokenExchangeInput = {
  provider: OAuthProviderId;
  code: string;
  redirectUri: string;
};

export type OAuthTokenExchangeResult = {
  provider: OAuthProviderId;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: OAuthTokenScope[];
  accountEmail: string;
};
