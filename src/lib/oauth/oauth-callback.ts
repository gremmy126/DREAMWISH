import { exchangeOAuthCode } from "./oauth.service";
import type { ConnectableOAuthProviderId, OAuthServiceId } from "./oauth.types";
import { saveOAuthToken } from "@/src/lib/repositories/oauth-token.repository";
import { upsertSlackWorkspace } from "@/src/lib/repositories/slack-workspace.repository";

export async function handleOAuthCallback(input: {
  provider: ConnectableOAuthProviderId;
  service: OAuthServiceId;
  code: string;
  redirectUri: string;
  codeVerifier?: string | null;
}) {
  const token = await exchangeOAuthCode(input);
  const record = await saveOAuthToken({
    provider: token.provider,
    service: token.service,
    providerAccountId: token.providerAccountId,
    accountName: token.accountName,
    accountEmail: token.accountEmail,
    accountAvatarUrl: token.accountAvatarUrl,
    workspaceId: token.workspaceId,
    workspaceName: token.workspaceName,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: token.expiresAt,
    scope: token.scope
  });
  if (token.provider === "slack") {
    await upsertSlackWorkspace({
      id: `slack_workspace_${token.workspaceId || token.accountEmail}`,
      teamId: token.workspaceId || token.accountEmail,
      teamName: token.workspaceName || token.accountName || token.accountEmail,
      connectedAt: new Date().toISOString()
    });
  }
  return record;
}
