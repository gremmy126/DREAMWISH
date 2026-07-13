import type { ConnectorAction } from "@/src/lib/integrations/types";
import {
  calendarConnector,
  gmailConnector,
  slackConnector
} from "@/src/lib/integrations/registry";
import {
  createIntegrationExecutionPreview,
  executeApprovedConnectorAction
} from "@/src/lib/integrations/integration-executor";
import { matchExternalIdentity } from "@/src/lib/integrations/identity-matcher";
import { runManualIntegrationSync } from "@/src/lib/integrations/sync-engine";
import { createOAuthAuthorizationUrl } from "@/src/lib/oauth/oauth.service";
import { encryptToken, decryptToken } from "@/src/lib/oauth/token-encryption";
import { saveOAuthToken, listOAuthTokens } from "@/src/lib/repositories/oauth-token.repository";

async function assertStage9ConnectorContracts() {
  const gmailPermissions = await gmailConnector.getPermissions();
  const calendarPermissions = await calendarConnector.getPermissions();
  const slackPermissions = await slackConnector.getPermissions();

  expectGranted(gmailPermissions, "gmail.readonly");
  expectGranted(gmailPermissions, "gmail.compose");
  expectBlocked(gmailPermissions, "gmail.send");
  expectBlocked(gmailPermissions, "gmail.modify");

  expectGranted(calendarPermissions, "calendar.readonly");
  expectGranted(calendarPermissions, "calendar.events");
  expectBlocked(calendarPermissions, "calendar.delete");

  expectGranted(slackPermissions, "channels.read");
  expectGranted(slackPermissions, "channels.history");
  expectGranted(slackPermissions, "users.read");
  expectBlocked(slackPermissions, "chat.write");

  const action: ConnectorAction = {
    type: "gmail.send",
    connectorId: "gmail",
    goal: "고객에게 메일 발송",
    requiredPermissionKeys: ["gmail.send"],
    payload: { to: "customer@example.com", subject: "hello" }
  };
  const preview = await createIntegrationExecutionPreview(action);
  if (!preview.approvalRequired) {
    throw new Error("Gmail send preview must require approval");
  }
  if (preview.riskLevel !== "high" && preview.riskLevel !== "critical") {
    throw new Error("Gmail send preview must be high or critical risk");
  }

  const blocked = await executeApprovedConnectorAction(action, { approved: false });
  if (blocked.ok) {
    throw new Error("Unapproved external action must be blocked");
  }

  const sync = await runManualIntegrationSync("contract-owner", "gmail", {
    days: 30,
    limit: 10
  });
  sync.status satisfies "success" | "blocked" | "failed";
  sync.readCount satisfies number;

  const match = matchExternalIdentity({
    source: "gmail",
    externalId: "mail_1",
    email: "customer@example.com",
    candidateName: "Customer"
  });
  if (match.status !== "suggested" && match.status !== "auto_matched") {
    throw new Error("New identity matches must not be confirmed without approval");
  }
}

async function assertOAuthContracts() {
  const encrypted = encryptToken("secret-token");
  const plain = decryptToken(encrypted);
  plain satisfies string;

  await saveOAuthToken({
    ownerId: "contract-owner",
    provider: "google",
    accountEmail: "owner@example.com",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: "2026-07-09T00:00:00.000Z",
    scope: ["gmail.readonly", "gmail.compose"]
  });
  const tokens = await listOAuthTokens("contract-owner");
  tokens[0].accessTokenEncrypted satisfies string;
  tokens[0].provider satisfies "google" | "slack" | "github" | "notion" | "discord" | "firebase";

  const googleUrl = createOAuthAuthorizationUrl({
    provider: "google",
    redirectUri: "https://dreamwish.co.kr/api/integrations/google/callback",
    state: "state-1"
  });
  googleUrl.toString() satisfies string;
}

function expectGranted(
  permissions: Awaited<ReturnType<typeof gmailConnector.getPermissions>>,
  key: string
) {
  const permission = permissions.find((item) => item.permissionKey === key);
  if (!permission?.isGranted) {
    throw new Error(`${key} must be granted by default`);
  }
}

function expectBlocked(
  permissions: Awaited<ReturnType<typeof gmailConnector.getPermissions>>,
  key: string
) {
  const permission = permissions.find((item) => item.permissionKey === key);
  if (!permission || permission.isGranted) {
    throw new Error(`${key} must be blocked by default`);
  }
}

void assertStage9ConnectorContracts;
void assertOAuthContracts;
