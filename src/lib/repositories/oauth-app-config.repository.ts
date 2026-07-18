import { randomUUID } from "node:crypto";
import { getAutomationApp } from "../automation/app-registry";
import { ensureAutomationRuntimeSchema } from "../automation/runtime/schema";
import { getPostgres, hasPostgresStorage } from "../db/postgres";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";
import {
  OAuthAppConfigError,
  toPublicOAuthAppConfig,
  type OAuthAppConfigRecord,
  type ResolvedOAuthAppConfig
} from "../oauth/oauth-app-config.types";
import type { ConnectableOAuthProviderId } from "../oauth/oauth.types";
import { decryptToken, encryptToken } from "../oauth/token-encryption";

export { toPublicOAuthAppConfig };

const STORE_FILE = "oauth-app-configs.json";

type ConfigDb = { configs: OAuthAppConfigRecord[] };
const EMPTY_DB: ConfigDb = { configs: [] };

export async function saveOAuthAppConfig(input: {
  ownerId: string;
  appId: string;
  provider: ConnectableOAuthProviderId;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<OAuthAppConfigRecord> {
  const ownerId = input.ownerId.trim();
  const appId = input.appId.trim();
  const clientId = input.clientId.trim();
  const redirectUri = input.redirectUri.trim();
  if (!ownerId || !appId || !clientId || !input.clientSecret || !redirectUri) {
    throw new OAuthAppConfigError("OAUTH_APP_CONFIG_INVALID", "OAuth 앱 설정 값이 올바르지 않습니다.");
  }
  validateOAuthAppContract(appId, input.provider, redirectUri);
  const now = new Date().toISOString();
  const ciphertext = encryptToken(input.clientSecret);

  if (hasPostgresStorage()) {
    await ensureAutomationRuntimeSchema();
    const sql = getPostgres();
    return sql.begin(async (transaction) => {
      const rows = await transaction`
        SELECT id, config_version FROM integration_oauth_app_configs
        WHERE owner_id = ${ownerId} AND app_id = ${appId}
        ORDER BY config_version DESC LIMIT 1
        FOR UPDATE
      `;
      const id = rows[0] ? String(rows[0].id) : randomUUID();
      const version = rows[0] ? Number(rows[0].config_version) + 1 : 1;
      await transaction`
        INSERT INTO integration_oauth_app_configs (
          id, owner_id, app_id, provider, client_id, client_secret_ciphertext,
          redirect_uri, config_version, status, created_at, updated_at
        ) VALUES (
          ${id}, ${ownerId}, ${appId}, ${input.provider}, ${clientId}, ${ciphertext},
          ${redirectUri}, ${version}, 'active', ${now}, ${now}
        )
      `;
      return buildRecord({ id, ownerId, appId, provider: input.provider, clientId, ciphertext, redirectUri, version, now });
    }) as Promise<OAuthAppConfigRecord>;
  }

  return withJsonStoreLock(STORE_FILE, async () => {
    const db = await readDb();
    const versions = db.configs.filter((item) => item.ownerId === ownerId && item.appId === appId);
    const id = versions[0]?.id || randomUUID();
    const version = versions.reduce((max, item) => Math.max(max, item.version), 0) + 1;
    const record = buildRecord({ id, ownerId, appId, provider: input.provider, clientId, ciphertext, redirectUri, version, now });
    db.configs.unshift(record);
    await writeJsonStore(STORE_FILE, db);
    return record;
  });
}

export async function getOAuthAppConfig(
  ownerId: string,
  appId: string
): Promise<ResolvedOAuthAppConfig | null> {
  const latest = await getLatestRecord(ownerId, appId);
  if (!latest || latest.status !== "active") return null;
  return resolve(latest);
}

export async function getOAuthAppConfigRecord(
  ownerId: string,
  appId: string
): Promise<OAuthAppConfigRecord | null> {
  return getLatestRecord(ownerId, appId);
}

export async function getOAuthAppConfigVersion(
  ownerId: string,
  configId: string,
  version: number
): Promise<ResolvedOAuthAppConfig | null> {
  if (hasPostgresStorage()) {
    await ensureAutomationRuntimeSchema();
    const sql = getPostgres();
    const rows = await sql`
      SELECT * FROM integration_oauth_app_configs
      WHERE owner_id = ${ownerId} AND id = ${configId} AND config_version = ${version}
      LIMIT 1
    `;
    return rows[0] ? resolve(mapRow(rows[0])) : null;
  }
  const db = await readDb();
  const record = db.configs.find(
    (item) => item.ownerId === ownerId && item.id === configId && item.version === version
  );
  return record ? resolve(record) : null;
}

export async function getLatestOAuthAppConfigVersionNumber(
  ownerId: string,
  configId: string
): Promise<number | null> {
  if (hasPostgresStorage()) {
    await ensureAutomationRuntimeSchema();
    const sql = getPostgres();
    const rows = await sql`
      SELECT MAX(config_version) AS latest FROM integration_oauth_app_configs
      WHERE owner_id = ${ownerId} AND id = ${configId}
    `;
    return rows[0]?.latest === null || rows[0]?.latest === undefined ? null : Number(rows[0].latest);
  }
  const db = await readDb();
  const versions = db.configs.filter((item) => item.ownerId === ownerId && item.id === configId);
  if (versions.length === 0) return null;
  return versions.reduce((max, item) => Math.max(max, item.version), 0);
}

export async function revokeOAuthAppConfig(ownerId: string, appId: string): Promise<boolean> {
  const now = new Date().toISOString();
  if (hasPostgresStorage()) {
    await ensureAutomationRuntimeSchema();
    const sql = getPostgres();
    const rows = await sql`
      UPDATE integration_oauth_app_configs
      SET status = 'revoked', revoked_at = ${now}, updated_at = ${now}
      WHERE owner_id = ${ownerId} AND app_id = ${appId} AND status != 'revoked'
      RETURNING id
    `;
    return rows.length > 0;
  }
  return withJsonStoreLock(STORE_FILE, async () => {
    const db = await readDb();
    let changed = false;
    for (const record of db.configs) {
      if (record.ownerId === ownerId && record.appId === appId && record.status !== "revoked") {
        record.status = "revoked";
        record.revokedAt = now;
        record.updatedAt = now;
        changed = true;
      }
    }
    if (changed) await writeJsonStore(STORE_FILE, db);
    return changed;
  });
}

export async function listOAuthAppConfigs(ownerId: string): Promise<OAuthAppConfigRecord[]> {
  if (hasPostgresStorage()) {
    await ensureAutomationRuntimeSchema();
    const sql = getPostgres();
    const rows = await sql`
      SELECT DISTINCT ON (app_id) * FROM integration_oauth_app_configs
      WHERE owner_id = ${ownerId}
      ORDER BY app_id, config_version DESC
    `;
    return rows.map(mapRow);
  }
  const db = await readDb();
  const latest = new Map<string, OAuthAppConfigRecord>();
  for (const record of db.configs.filter((item) => item.ownerId === ownerId)) {
    const existing = latest.get(record.appId);
    if (!existing || record.version > existing.version) latest.set(record.appId, record);
  }
  return [...latest.values()];
}

async function getLatestRecord(ownerId: string, appId: string): Promise<OAuthAppConfigRecord | null> {
  if (hasPostgresStorage()) {
    await ensureAutomationRuntimeSchema();
    const sql = getPostgres();
    const rows = await sql`
      SELECT * FROM integration_oauth_app_configs
      WHERE owner_id = ${ownerId} AND app_id = ${appId}
      ORDER BY config_version DESC LIMIT 1
    `;
    return rows[0] ? mapRow(rows[0]) : null;
  }
  const db = await readDb();
  const versions = db.configs
    .filter((item) => item.ownerId === ownerId && item.appId === appId)
    .sort((left, right) => right.version - left.version);
  return versions[0] || null;
}

function resolve(record: OAuthAppConfigRecord): ResolvedOAuthAppConfig {
  const { clientSecretCiphertext, ...safe } = record;
  return { ...safe, clientSecret: decryptToken(clientSecretCiphertext) };
}

function buildRecord(input: {
  id: string;
  ownerId: string;
  appId: string;
  provider: ConnectableOAuthProviderId;
  clientId: string;
  ciphertext: string;
  redirectUri: string;
  version: number;
  now: string;
}): OAuthAppConfigRecord {
  return {
    id: input.id,
    ownerId: input.ownerId,
    appId: input.appId,
    provider: input.provider,
    clientId: input.clientId,
    clientSecretCiphertext: input.ciphertext,
    redirectUri: input.redirectUri,
    version: input.version,
    status: "active",
    createdAt: input.now,
    updatedAt: input.now,
    revokedAt: null
  };
}

function mapRow(row: Record<string, unknown>): OAuthAppConfigRecord {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    appId: String(row.app_id),
    provider: String(row.provider) as ConnectableOAuthProviderId,
    clientId: String(row.client_id),
    clientSecretCiphertext: String(row.client_secret_ciphertext),
    redirectUri: String(row.redirect_uri),
    version: Number(row.config_version),
    status: String(row.status) as OAuthAppConfigRecord["status"],
    createdAt: new Date(row.created_at as Date | string).toISOString(),
    updatedAt: new Date(row.updated_at as Date | string).toISOString(),
    revokedAt: row.revoked_at ? new Date(row.revoked_at as Date | string).toISOString() : null
  };
}

async function readDb(): Promise<ConfigDb> {
  const db = await readJsonStore<ConfigDb>(STORE_FILE, EMPTY_DB);
  return { configs: Array.isArray(db.configs) ? db.configs : [] };
}

function validateOAuthAppContract(
  appId: string,
  provider: ConnectableOAuthProviderId,
  redirectUri: string
) {
  const app = getAutomationApp(appId);
  if (!app?.oauthTarget || app.oauthTarget.provider !== provider) {
    throw new OAuthAppConfigError(
      "OAUTH_APP_CONFIG_INVALID",
      "앱과 OAuth 공급자 설정이 일치하지 않습니다."
    );
  }

  let redirect: URL;
  try {
    redirect = new URL(redirectUri);
  } catch {
    throw new OAuthAppConfigError(
      "OAUTH_APP_CONFIG_INVALID",
      "OAuth Redirect URI가 올바른 절대 URL이 아닙니다."
    );
  }

  const isLocalHttp = redirect.protocol === "http:" && isLocalHostname(redirect.hostname);
  if (
    (redirect.protocol !== "https:" && !isLocalHttp) ||
    redirect.username ||
    redirect.password ||
    redirect.search ||
    redirect.hash ||
    redirect.pathname !== app.connectionGuide.redirectPath
  ) {
    throw new OAuthAppConfigError(
      "OAUTH_APP_CONFIG_INVALID",
      "OAuth Redirect URI가 앱의 Callback 계약과 일치하지 않습니다."
    );
  }

  const configuredOrigin = getConfiguredPublicOrigin();
  if (configuredOrigin && redirect.origin !== configuredOrigin) {
    throw new OAuthAppConfigError(
      "OAUTH_APP_CONFIG_INVALID",
      "OAuth Redirect URI가 현재 공개 앱 주소와 일치하지 않습니다."
    );
  }
}

function getConfiguredPublicOrigin() {
  const configured = [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL
  ].find((value) => value?.trim())?.trim();
  if (!configured) return null;
  try {
    return new URL(configured).origin;
  } catch {
    throw new OAuthAppConfigError(
      "OAUTH_APP_CONFIG_INVALID",
      "공개 앱 주소 설정이 올바르지 않습니다."
    );
  }
}

function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}
