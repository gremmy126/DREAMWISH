import { exchangeOAuthCode } from "./oauth.service";
import type { ConnectableOAuthProviderId, OAuthServiceId } from "./oauth.types";
import { saveOAuthToken } from "@/src/lib/repositories/oauth-token.repository";
import { upsertSlackWorkspace } from "@/src/lib/repositories/slack-workspace.repository";
import { verifyProviderAccessToken } from "./provider-verification";

export async function handleOAuthCallback(input: {
  ownerId: string;
  provider: ConnectableOAuthProviderId;
  service: OAuthServiceId;
  code: string;
  redirectUri: string;
  codeVerifier?: string | null;
}) {
  const token = await exchangeOAuthCode(input);
  const verification = await verifyProviderAccessToken({
    provider: token.provider,
    accessToken: token.accessToken
  });
  if (!verification.ok) throw new Error(verification.error);

  const identity = verification.identity;
  const verifiedAt = new Date().toISOString();
  const record = await saveOAuthToken({
    ownerId: input.ownerId,
    provider: token.provider,
    service: token.service,
    providerAccountId: identity.providerAccountId,
    accountName: identity.accountName || token.accountName,
    accountEmail: identity.accountEmail || token.accountEmail,
    accountAvatarUrl: identity.accountAvatarUrl || token.accountAvatarUrl,
    workspaceId: identity.workspaceId || token.workspaceId,
    workspaceName: identity.workspaceName || token.workspaceName,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: token.expiresAt,
    scope: token.scope,
    verifiedAt: verifiedAt,
    lastVerificationError: null
  });
  if (token.provider === "slack") {
    await upsertSlackWorkspace(input.ownerId, {
      id: `slack_workspace_${token.workspaceId || token.accountEmail}`,
      teamId: token.workspaceId || token.accountEmail,
      teamName: token.workspaceName || token.accountName || token.accountEmail,
      connectedAt: new Date().toISOString()
    });
  }
  return record;
}
