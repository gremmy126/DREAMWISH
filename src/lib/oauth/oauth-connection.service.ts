import { randomUUID } from "node:crypto";
import { appendAutomationAuditEvent } from "../automation/runtime/audit.repository";
import { enqueueConnectionNotification } from "../automation/queue/notification-outbox";
import {
  acquireConnectionRefreshLease,
  getIntegrationConnection,
  getIntegrationConnectionSecrets,
  listConnectionWorkflowImpact,
  saveRefreshedConnectionTokens,
  softDisconnectConnection,
  updateConnectionStatus,
  upsertIntegrationConnection
} from "../repositories/integration-connection.repository";
import {
  classifyConnectionFailure,
  toPublicIntegrationConnection,
  type IntegrationConnection
} from "./integration-connection.types";
import {
  exchangeProviderAuthorizationCode,
  getOAuthAppTarget,
  refreshProviderToken,
  revokeProviderToken,
  validateProviderToken
} from "./oauth-provider-adapter";
import { missingOAuthScopes } from "./scope-matcher";
import { resumeExecutionsWaitingForConnection } from "../automation/runtime/execution-enqueue.service";
import {
  getLatestOAuthAppConfigVersionNumber,
  getOAuthAppConfigVersion
} from "../repositories/oauth-app-config.repository";
import { OAuthAppConfigError } from "./oauth-app-config.types";

export async function persistOAuthCallbackConnection(input: {
  ownerId: string;
  appId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  oauthAppConfigId: string;
  oauthAppConfigVersion: number;
  credentials: { clientId: string; clientSecret: string };
}) {
  const target = getOAuthAppTarget(input.appId);
  const token = await exchangeProviderAuthorizationCode({
    target,
    credentials: input.credentials,
    code: input.code,
    redirectUri: input.redirectUri,
    codeVerifier: input.codeVerifier
  });
  if (!token.providerAccountId) throw new Error("OAuth provider account identity is missing.");
  const connection = await upsertIntegrationConnection({
    ownerId: input.ownerId,
    userId: input.ownerId,
    appId: input.appId,
    provider: target.provider,
    oauthAppConfigId: input.oauthAppConfigId,
    oauthAppConfigVersion: input.oauthAppConfigVersion,
    providerAccountId: token.providerAccountId,
    providerWorkspaceId: token.workspaceId,
    accountLabel: token.workspaceName || token.accountName,
    accountEmail: token.accountEmail,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: token.expiresAt,
    grantedScopes: token.scope
  });
  await resumeExecutionsWaitingForConnection(input.ownerId, connection.id);
  return connection;
}

export async function validateConnectionForAction(input: {
  ownerId: string;
  connectionId: string | null;
  appId: string;
  requiredScopes: string[];
}) {
  if (!input.connectionId) throw Object.assign(new Error("이 Action에 사용할 연결 계정을 선택해 주세요."), { code: "CONNECTION_REQUIRED" });
  const connection = await getIntegrationConnection(input.ownerId, input.connectionId);
  if (!connection || connection.appId !== input.appId) throw Object.assign(new Error("선택한 연결 계정을 사용할 수 없습니다."), { code: "CONNECTION_NOT_FOUND" });
  if (connection.status !== "connected") throw Object.assign(new Error("연결 계정을 다시 연결해야 합니다."), { code: "CONNECTION_REQUIRED", connectionStatus: connection.status });
  const missingScopes = missingOAuthScopes(connection.grantedScopes, input.requiredScopes, input.appId);
  if (missingScopes.length > 0) {
    await updateConnectionStatus(input.ownerId, input.connectionId, "insufficient_scope", input.ownerId, missingScopes.join(","));
    throw Object.assign(new Error(`필요한 OAuth Scope가 없습니다: ${missingScopes.join(", ")}`), { code: "SCOPE_INSUFFICIENT", missingScopes });
  }
  return {
    accountLabel: connection.accountLabel || connection.accountEmail,
    scopes: connection.grantedScopes,
    credentialStatus: "valid",
    rateLimitRemaining: null
  };
}

export async function getOAuthAccessTokenForConnection(input: {
  ownerId: string;
  connectionId: string;
  appId: string;
  requiredScopes: string[];
}) {
  await validateConnectionForAction(input);
  let secrets = await getIntegrationConnectionSecrets(input.ownerId, input.connectionId);
  if (!secrets) throw Object.assign(new Error("The selected connection has no active credential."), { code: "CREDENTIAL_INVALID" });
  if (secrets.connection.expiresAt && new Date(secrets.connection.expiresAt).getTime() <= Date.now() + 60_000) {
    const refreshed = await refreshOAuthConnection(input.ownerId, input.connectionId);
    if (refreshed.status !== "connected") {
      throw Object.assign(new Error("The selected connection must be reauthorized."), { code: "CONNECTION_REQUIRED" });
    }
    secrets = await getIntegrationConnectionSecrets(input.ownerId, input.connectionId);
    if (!secrets) throw Object.assign(new Error("The refreshed credential is unavailable."), { code: "CREDENTIAL_INVALID" });
  }
  return { accessToken: secrets.accessToken, connection: secrets.connection };
}

export async function testOAuthConnection(ownerId: string, connectionId: string) {
  const secrets = await getIntegrationConnectionSecrets(ownerId, connectionId);
  if (!secrets) throw new Error("Integration connection was not found or has no active token.");
  try {
    const identity = await validateProviderToken(secrets.connection.provider, secrets.accessToken);
    const connection = await updateConnectionStatus(ownerId, connectionId, "connected", ownerId);
    await resumeExecutionsWaitingForConnection(ownerId, connectionId);
    return { connection: toPublicIntegrationConnection(connection), identity };
  } catch (error) {
    const status = classifyConnectionFailure("validation_failed");
    await updateConnectionStatus(ownerId, connectionId, status, ownerId, error instanceof Error ? error.message : "validation_failed");
    throw error;
  }
}

export async function refreshOAuthConnection(ownerId: string, connectionId: string) {
  const workerId = `refresh-${randomUUID()}`;
  const leased = await acquireConnectionRefreshLease(ownerId, connectionId, workerId);
  if (!leased) throw new Error("Connection is already refreshing or unavailable.");
  const secrets = await getIntegrationConnectionSecrets(ownerId, connectionId);
  if (!secrets?.refreshToken) {
    const connection = await updateConnectionStatus(ownerId, connectionId, "reconnect_required", ownerId, "refresh_token_missing");
    await enqueueConnectionNotification({ ownerId, connectionId, eventType: "reconnect_required", safePayload: { appId: connection.appId, status: connection.status } });
    return connection;
  }
  try {
    const oauthAppConfig = await resolveConnectionOAuthAppConfig(secrets.connection);
    const refreshed = await refreshProviderToken({
      provider: secrets.connection.provider,
      credentials: oauthAppConfig,
      refreshToken: secrets.refreshToken,
      scopes: secrets.connection.grantedScopes
    });
    const connection = await saveRefreshedConnectionTokens({
      ownerId, connectionId, workerId, accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken, expiresAt: refreshed.expiresAt,
      grantedScopes: refreshed.scopes || undefined
    });
    await resumeExecutionsWaitingForConnection(ownerId, connectionId);
    return connection;
  } catch (error) {
    const configChanged = error instanceof OAuthAppConfigError;
    const status = configChanged ? "reauthorization_required" : "refresh_failed";
    const connection = await updateConnectionStatus(
      ownerId,
      connectionId,
      status,
      null,
      configChanged ? error.code : "refresh_failed"
    );
    await enqueueConnectionNotification({
      ownerId,
      connectionId,
      eventType: status,
      safePayload: { appId: connection.appId, status: connection.status }
    });
    return connection;
  }
}

async function resolveConnectionOAuthAppConfig(connection: IntegrationConnection) {
  if (!connection.oauthAppConfigId || !connection.oauthAppConfigVersion) {
    throw oauthConfigChanged();
  }
  const [oauthAppConfig, latestVersion] = await Promise.all([
    getOAuthAppConfigVersion(
      connection.ownerId,
      connection.oauthAppConfigId,
      connection.oauthAppConfigVersion
    ),
    getLatestOAuthAppConfigVersionNumber(connection.ownerId, connection.oauthAppConfigId)
  ]);
  if (
    !oauthAppConfig ||
    oauthAppConfig.status !== "active" ||
    oauthAppConfig.appId !== connection.appId ||
    oauthAppConfig.provider !== connection.provider ||
    latestVersion !== connection.oauthAppConfigVersion
  ) {
    throw oauthConfigChanged();
  }
  return oauthAppConfig;
}

function oauthConfigChanged() {
  return new OAuthAppConfigError(
    "OAUTH_APP_CONFIG_CHANGED",
    "OAuth app configuration changed or was revoked."
  );
}

export async function disconnectOAuthConnection(input: {
  ownerId: string;
  connectionId: string;
  actorId: string;
  reason: string;
}) {
  const connection = await getIntegrationConnection(input.ownerId, input.connectionId);
  if (!connection) throw new Error("Integration connection was not found.");
  const affectedWorkflows = await listConnectionWorkflowImpact(input.ownerId, input.connectionId);
  const secrets = await getIntegrationConnectionSecrets(input.ownerId, input.connectionId);
  let revokeResult = "no_active_token";
  let revokedAt: string | null = null;
  let disconnected = connection;
  try {
    if (secrets?.accessToken) {
      const result = await revokeProviderToken(connection.provider, secrets.accessToken);
      revokeResult = result.result;
      if (result.revoked) revokedAt = new Date().toISOString();
    }
  } catch (error) {
    revokeResult = `revoke_failed:${error instanceof Error ? error.message.slice(0, 180) : "unknown"}`;
  } finally {
    disconnected = await softDisconnectConnection({
      ownerId: input.ownerId,
      connectionId: input.connectionId,
      actorId: input.actorId,
      reason: input.reason,
      revokeResult,
      revokedAt
    });
    await appendAutomationAuditEvent({
      ownerId: input.ownerId,
      userId: input.actorId,
      approvalResult: "connection_disconnect_confirmed",
      executionResult: "connection_disconnected",
      safeConnectionIdentity: {
        connectionId: connection.id,
        appId: connection.appId,
        provider: connection.provider,
        accountLabel: connection.accountLabel,
        previousStatus: connection.status,
        previousScopes: connection.grantedScopes,
        revokeResult
      },
      metadata: { affectedWorkflowCount: affectedWorkflows.length }
    });
  }
  return { connection: toPublicIntegrationConnection(disconnected), affectedWorkflows, revokeResult };
}
