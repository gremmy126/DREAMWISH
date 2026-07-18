import { getOAuthProviderConfig } from "./oauth-provider-registry";
import { createProviderAuthorizationUrl, getOAuthAppTarget } from "./oauth-provider-adapter";
import { getOAuthRedirectUri } from "./oauth-redirect";
import { createOAuthSecurityParams } from "./oauth-state";
import { createOAuthSession } from "../repositories/oauth-session.repository";
import type { OAuthSessionRecord } from "../repositories/oauth-session.repository";
import {
  getLatestOAuthAppConfigVersionNumber,
  getOAuthAppConfig,
  getOAuthAppConfigVersion
} from "../repositories/oauth-app-config.repository";
import { hasPostgresStorage } from "../db/postgres";
import {
  OAuthAppConfigError,
  type ResolvedOAuthAppConfig
} from "./oauth-app-config.types";

export async function startOAuthAuthorization(input: {
  ownerId: string;
  appId: string;
  requestUrl: string;
  returnTo?: string | null;
  requestedScopes?: string[];
}) {
  if (!hasPostgresStorage()) throw new Error("DATABASE_URL is required for durable OAuth connections.");
  const target = getOAuthAppTarget(input.appId);
  const oauthAppConfig = await getOAuthAppConfig(input.ownerId, target.appId);
  if (!oauthAppConfig) {
    throw new OAuthAppConfigError(
      "OAUTH_APP_CONFIG_REQUIRED",
      "OAuth 앱의 Client ID와 Client Secret을 먼저 저장해 주세요."
    );
  }
  const security = createOAuthSecurityParams();
  const redirectUri = getOAuthRedirectUri(target.provider, input.requestUrl);
  if (
    oauthAppConfig.provider !== target.provider ||
    oauthAppConfig.redirectUri !== redirectUri
  ) {
    throw new OAuthAppConfigError(
      "OAUTH_APP_CONFIG_CHANGED",
      "OAuth 앱 설정이 현재 Callback 계약과 일치하지 않습니다."
    );
  }
  const supportsPkce = getOAuthProviderConfig(target.provider).supportsPkce;

  await createOAuthSession({
    ownerId: input.ownerId,
    provider: target.provider,
    service: target.service,
    appId: target.appId,
    oauthAppConfigId: oauthAppConfig.id,
    oauthAppConfigVersion: oauthAppConfig.version,
    requestedScopes: input.requestedScopes?.length ? input.requestedScopes : target.scopes,
    state: security.state,
    redirectUri,
    codeVerifier: supportsPkce ? security.codeVerifier : null,
    returnTo: normalizeReturnTarget(input.returnTo)
  });

  return {
    appId: target.appId,
    provider: target.provider,
    service: target.service,
    redirectUri,
    authorizationUrl: createProviderAuthorizationUrl({
      target,
      credentials: oauthAppConfig,
      redirectUri,
      state: security.state,
      codeChallenge: security.codeChallenge,
      requestedScopes: input.requestedScopes
    })
  };
}

export async function resolveOAuthSessionAppConfig(
  session: OAuthSessionRecord
): Promise<ResolvedOAuthAppConfig> {
  if (
    !session.ownerId ||
    !session.appId ||
    !session.oauthAppConfigId ||
    !session.oauthAppConfigVersion
  ) {
    throw changedOAuthAppConfigError();
  }

  const [config, latestVersion] = await Promise.all([
    getOAuthAppConfigVersion(
      session.ownerId,
      session.oauthAppConfigId,
      session.oauthAppConfigVersion
    ),
    getLatestOAuthAppConfigVersionNumber(session.ownerId, session.oauthAppConfigId)
  ]);
  if (
    !config ||
    config.status !== "active" ||
    config.appId !== session.appId ||
    config.provider !== session.provider ||
    config.redirectUri !== session.redirectUri ||
    latestVersion !== session.oauthAppConfigVersion
  ) {
    throw changedOAuthAppConfigError();
  }
  return config;
}

export function normalizeReturnTarget(value?: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/?view=integrations";
  return value.slice(0, 1000);
}

function changedOAuthAppConfigError() {
  return new OAuthAppConfigError(
    "OAUTH_APP_CONFIG_CHANGED",
    "OAuth app configuration changed or was revoked."
  );
}
