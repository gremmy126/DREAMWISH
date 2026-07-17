import { getOAuthProviderConfig } from "./oauth-provider-registry";
import { createProviderAuthorizationUrl, getOAuthAppTarget } from "./oauth-provider-adapter";
import { getPublicAppUrl } from "./oauth-redirect";
import { createOAuthSecurityParams } from "./oauth-state";
import { createOAuthSession } from "../repositories/oauth-session.repository";
import { hasPostgresStorage } from "../db/postgres";

export async function startOAuthAuthorization(input: {
  ownerId: string;
  appId: string;
  requestUrl: string;
  returnTo?: string | null;
  requestedScopes?: string[];
}) {
  if (!hasPostgresStorage()) throw new Error("DATABASE_URL is required for durable OAuth connections.");
  const target = getOAuthAppTarget(input.appId);
  const security = createOAuthSecurityParams();
  const redirectUri = new URL(
    `/api/integrations/${encodeURIComponent(input.appId)}/oauth/callback`,
    getPublicAppUrl(input.requestUrl)
  ).toString();
  const supportsPkce = getOAuthProviderConfig(target.provider).supportsPkce;

  await createOAuthSession({
    ownerId: input.ownerId,
    provider: target.provider,
    service: target.service,
    appId: target.appId,
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
      redirectUri,
      state: security.state,
      codeChallenge: security.codeChallenge,
      requestedScopes: input.requestedScopes
    })
  };
}

export function normalizeReturnTarget(value?: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/?view=integrations";
  return value.slice(0, 1000);
}
