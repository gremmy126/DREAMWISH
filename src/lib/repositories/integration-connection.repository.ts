import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { getPostgres } from "../db/postgres";
import { decryptToken, encryptToken } from "../oauth/token-encryption";
import type {
  IntegrationConnection,
  IntegrationConnectionProvider,
  IntegrationConnectionStatus
} from "../oauth/integration-connection.types";
import { ensureAutomationRuntimeSchema } from "../automation/runtime/schema";

export async function upsertIntegrationConnection(input: {
  ownerId: string;
  userId: string;
  appId: string;
  provider: IntegrationConnectionProvider;
  providerAccountId: string;
  providerWorkspaceId?: string | null;
  accountLabel?: string | null;
  accountEmail?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  grantedScopes: string[];
}) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  return sql.begin(async (transaction) => {
    const existingRows = await transaction`
      SELECT * FROM integration_connections
      WHERE owner_id = ${input.ownerId}
        AND app_id = ${input.appId}
        AND provider = ${input.provider}
        AND provider_account_id = ${input.providerAccountId}
        AND provider_workspace_id IS NOT DISTINCT FROM ${input.providerWorkspaceId || null}
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
    `;
    const previous = existingRows[0] ? mapConnection(existingRows[0]) : null;
    const id = previous?.id || randomUUID();
    const accessTokenCiphertext = encryptToken(input.accessToken);
    const refreshTokenCiphertext = input.refreshToken === undefined || input.refreshToken === null
      ? previous?.refreshTokenCiphertext || null
      : encryptToken(input.refreshToken);
    const rows = previous
      ? await transaction`
          UPDATE integration_connections
          SET user_id = ${input.userId}, account_label = ${input.accountLabel || null},
              account_email = ${input.accountEmail || null}, token_ciphertext = ${accessTokenCiphertext},
              refresh_token_ciphertext = ${refreshTokenCiphertext}, token_key_version = 1,
              expires_at = ${input.expiresAt || null}, granted_scopes = ${uniqueScopes(input.grantedScopes)},
              status = 'connected', connected_at = COALESCE(connected_at, NOW()), validated_at = NOW(),
              disconnected_at = NULL, revoked_at = NULL, disconnect_actor_id = NULL,
              disconnect_reason = NULL, revoke_result = NULL, updated_at = NOW()
          WHERE owner_id = ${input.ownerId} AND id = ${id}
          RETURNING *
        `
      : await transaction`
          INSERT INTO integration_connections (
            id, owner_id, user_id, app_id, provider, provider_account_id, provider_workspace_id,
            account_label, account_email, token_ciphertext, refresh_token_ciphertext,
            token_key_version, expires_at, granted_scopes, status, connected_at, validated_at
          ) VALUES (
            ${id}, ${input.ownerId}, ${input.userId}, ${input.appId}, ${input.provider},
            ${input.providerAccountId}, ${input.providerWorkspaceId || null}, ${input.accountLabel || null},
            ${input.accountEmail || null}, ${accessTokenCiphertext}, ${refreshTokenCiphertext}, 1,
            ${input.expiresAt || null}, ${uniqueScopes(input.grantedScopes)}, 'connected', NOW(), NOW()
          ) RETURNING *
        `;
    await appendConnectionEvent(transaction, input.ownerId, id, previous ? "reconnected" : "connected", input.userId, {
      appId: input.appId,
      scopes: uniqueScopes(input.grantedScopes)
    });
    return mapConnection(rows[0]!);
  }) as Promise<IntegrationConnection>;
}

export async function listIntegrationConnections(ownerId: string, appId?: string | null) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = appId
    ? await sql`SELECT * FROM integration_connections WHERE owner_id = ${ownerId} AND app_id = ${appId} ORDER BY created_at DESC`
    : await sql`SELECT * FROM integration_connections WHERE owner_id = ${ownerId} ORDER BY created_at DESC`;
  return rows.map(mapConnection);
}

export async function getIntegrationConnection(ownerId: string, connectionId: string) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    SELECT * FROM integration_connections
    WHERE owner_id = ${ownerId} AND id = ${connectionId}
    LIMIT 1
  `;
  return rows[0] ? mapConnection(rows[0]) : null;
}

export async function getIntegrationConnectionSecrets(ownerId: string, connectionId: string) {
  const connection = await getIntegrationConnection(ownerId, connectionId);
  if (!connection || connection.status === "disconnected" || connection.status === "revoked") return null;
  if (!connection.accessTokenCiphertext) return null;
  return {
    connection,
    accessToken: decryptToken(connection.accessTokenCiphertext),
    refreshToken: connection.refreshTokenCiphertext ? decryptToken(connection.refreshTokenCiphertext) : null
  };
}

export async function updateConnectionStatus(
  ownerId: string,
  connectionId: string,
  status: Exclude<IntegrationConnectionStatus, "disconnected" | "revoked">,
  actorId: string | null,
  safeReason?: string
) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  return sql.begin(async (transaction) => {
    const rows = await transaction`
      UPDATE integration_connections
      SET status = ${status}, refresh_locked_until = NULL, refresh_worker_id = NULL, updated_at = NOW()
      WHERE owner_id = ${ownerId} AND id = ${connectionId} AND status NOT IN ('disconnected', 'revoked')
      RETURNING *
    `;
    if (!rows[0]) throw new Error("Integration connection was not found.");
    await appendConnectionEvent(transaction, ownerId, connectionId, status, actorId, { reason: safeReason || null });
    return mapConnection(rows[0]);
  }) as Promise<IntegrationConnection>;
}

export async function acquireConnectionRefreshLease(ownerId: string, connectionId: string, workerId: string, leaseMs = 30_000) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    UPDATE integration_connections
    SET refresh_worker_id = ${workerId},
        refresh_locked_until = NOW() + (${Math.max(5_000, Math.min(120_000, Math.trunc(leaseMs)))} * INTERVAL '1 millisecond'),
        updated_at = NOW()
    WHERE owner_id = ${ownerId} AND id = ${connectionId}
      AND status NOT IN ('disconnected', 'revoked')
      AND (refresh_locked_until IS NULL OR refresh_locked_until < NOW())
    RETURNING *
  `;
  return rows[0] ? mapConnection(rows[0]) : null;
}

export async function saveRefreshedConnectionTokens(input: {
  ownerId: string;
  connectionId: string;
  workerId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  grantedScopes?: string[];
}) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  return sql.begin(async (transaction) => {
    const rows = await transaction`
      UPDATE integration_connections
      SET token_ciphertext = ${encryptToken(input.accessToken)},
          refresh_token_ciphertext = CASE
            WHEN ${input.refreshToken || null} IS NULL THEN refresh_token_ciphertext
            ELSE ${input.refreshToken ? encryptToken(input.refreshToken) : null}
          END,
          expires_at = ${input.expiresAt || null},
          granted_scopes = COALESCE(${input.grantedScopes ? uniqueScopes(input.grantedScopes) : null}, granted_scopes),
          status = 'connected', refreshed_at = NOW(), validated_at = NOW(),
          refresh_locked_until = NULL, refresh_worker_id = NULL, updated_at = NOW()
      WHERE owner_id = ${input.ownerId} AND id = ${input.connectionId}
        AND refresh_worker_id = ${input.workerId} AND refresh_locked_until > NOW()
      RETURNING *
    `;
    if (!rows[0]) throw new Error("Connection refresh lease was lost.");
    await appendConnectionEvent(transaction, input.ownerId, input.connectionId, "refreshed", input.workerId, {});
    return mapConnection(rows[0]);
  }) as Promise<IntegrationConnection>;
}

export async function listConnectionWorkflowImpact(ownerId: string, connectionId: string) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    SELECT DISTINCT workflow.id, workflow.name, workflow.status, node.node_id, node.action_id
    FROM automation_nodes AS node
    JOIN automation_workflows AS workflow
      ON workflow.id = node.workflow_id AND workflow.active_version = node.workflow_version
    WHERE node.owner_id = ${ownerId}
      AND workflow.owner_id = ${ownerId}
      AND node.integration_connection_id = ${connectionId}
    ORDER BY workflow.name, node.node_id
  `;
  return rows.map((row) => ({
    workflowId: String(row.id), workflowName: String(row.name), workflowStatus: String(row.status),
    nodeId: String(row.node_id), actionId: row.action_id ? String(row.action_id) : null
  }));
}

export async function softDisconnectConnection(input: {
  ownerId: string;
  connectionId: string;
  actorId: string;
  reason: string;
  revokeResult: string;
  revokedAt?: string | null;
}) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  return sql.begin(async (transaction) => {
    const rows = await transaction`
      UPDATE integration_connections
      SET status = 'disconnected', token_ciphertext = NULL, refresh_token_ciphertext = NULL,
          token_key_version = NULL, disconnected_at = NOW(), disconnect_actor_id = ${input.actorId},
          disconnect_reason = ${input.reason.slice(0, 500)}, revoke_result = ${input.revokeResult.slice(0, 500)},
          revoked_at = ${input.revokedAt || null}, refresh_locked_until = NULL, refresh_worker_id = NULL,
          updated_at = NOW()
      WHERE owner_id = ${input.ownerId} AND id = ${input.connectionId}
        AND status NOT IN ('disconnected', 'revoked')
      RETURNING *
    `;
    if (!rows[0]) throw new Error("Integration connection was not found or already disconnected.");
    await appendConnectionEvent(transaction, input.ownerId, input.connectionId, "disconnected", input.actorId, {
      reason: input.reason,
      revokeResult: input.revokeResult
    });
    return mapConnection(rows[0]);
  }) as Promise<IntegrationConnection>;
}

async function appendConnectionEvent(
  query: postgres.TransactionSql,
  ownerId: string,
  connectionId: string,
  eventType: string,
  actorId: string | null,
  metadata: Record<string, unknown>
) {
  await query`
    INSERT INTO integration_connection_events (
      id, owner_id, connection_id, event_type, actor_type, actor_id, safe_metadata
    ) VALUES (
      ${randomUUID()}, ${ownerId}, ${connectionId}, ${eventType}, ${actorId ? "user" : "system"},
      ${actorId}, ${query.json(metadata as never)}
    )
  `;
}

function mapConnection(row: Record<string, unknown>): IntegrationConnection {
  return {
    id: String(row.id), ownerId: String(row.owner_id), userId: String(row.user_id), appId: String(row.app_id),
    provider: String(row.provider) as IntegrationConnectionProvider,
    providerAccountId: String(row.provider_account_id),
    providerWorkspaceId: nullableString(row.provider_workspace_id), accountLabel: nullableString(row.account_label),
    accountEmail: nullableString(row.account_email), accessTokenCiphertext: nullableString(row.token_ciphertext),
    refreshTokenCiphertext: nullableString(row.refresh_token_ciphertext),
    tokenKeyVersion: row.token_key_version === null ? null : Number(row.token_key_version),
    expiresAt: nullableIso(row.expires_at), grantedScopes: Array.isArray(row.granted_scopes) ? row.granted_scopes.map(String) : [],
    status: String(row.status) as IntegrationConnectionStatus, connectedAt: nullableIso(row.connected_at),
    refreshedAt: nullableIso(row.refreshed_at), validatedAt: nullableIso(row.validated_at),
    disconnectedAt: nullableIso(row.disconnected_at), revokedAt: nullableIso(row.revoked_at),
    disconnectActorId: nullableString(row.disconnect_actor_id), disconnectReason: nullableString(row.disconnect_reason),
    revokeResult: nullableString(row.revoke_result), createdAt: nullableIso(row.created_at)!, updatedAt: nullableIso(row.updated_at)!
  };
}

function uniqueScopes(scopes: string[]) { return [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))].sort(); }
function nullableString(value: unknown) { return value === null || value === undefined ? null : String(value); }
function nullableIso(value: unknown) { return value ? new Date(value as Date | string).toISOString() : null; }
