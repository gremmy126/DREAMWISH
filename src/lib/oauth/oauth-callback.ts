import { exchangeOAuthCode } from "./oauth.service";
import type { OAuthProviderId } from "./oauth.types";
import { saveOAuthToken } from "@/src/lib/repositories/oauth-token.repository";
import { upsertSlackWorkspace } from "@/src/lib/repositories/slack-workspace.repository";

export async function handleOAuthCallback(input: {
  provider: OAuthProviderId;
  code: string;
  redirectUri: string;
}) {
  const token = await exchangeOAuthCode(input);
  const record = await saveOAuthToken({
    provider: token.provider,
    accountEmail: token.accountEmail,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: token.expiresAt,
    scope: token.scope
  });
  if (token.provider === "slack") {
    await upsertSlackWorkspace({
      id: `slack_workspace_${token.accountEmail}`,
      teamId: token.accountEmail,
      teamName: token.accountEmail,
      connectedAt: new Date().toISOString()
    });
  }
  return record;
}
