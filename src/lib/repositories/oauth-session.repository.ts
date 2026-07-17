import { createHash, randomUUID } from "crypto";
import type {
  ConnectableOAuthProviderId,
  OAuthServiceId
} from "@/src/lib/oauth/oauth.types";
import { readJsonStore, writeJsonStore } from "../local-db/json-store";
import { getPostgres, hasPostgresStorage } from "../db/postgres";
import { ensureAutomationRuntimeSchema } from "../automation/runtime/schema";
import { decryptToken, encryptToken } from "../oauth/token-encryption";

export type OAuthSessionRecord = {
  id: string;
  ownerId: string | null;
  provider: ConnectableOAuthProviderId;
  service: OAuthServiceId;
  appId?: string;
  requestedScopes?: string[];
  stateHash: string;
  redirectUri: string;
  codeVerifier: string | null;
  returnTo: string | null;
  status: "created" | "completed" | "expired";
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
};

type OAuthSessionDb = {
  sessions: OAuthSessionRecord[];
};

const EMPTY_DB: OAuthSessionDb = { sessions: [] };
const SESSION_TTL_MS = 10 * 60 * 1000;

export async function createOAuthSession(input: {
  ownerId: string;
  provider: ConnectableOAuthProviderId;
  service: OAuthServiceId;
  appId?: string;
  requestedScopes?: string[];
  state: string;
  redirectUri: string;
  codeVerifier?: string | null;
  returnTo?: string | null;
}) {
  if (hasPostgresStorage()) {
    await ensureAutomationRuntimeSchema();
    const sql = getPostgres();
    const now = new Date();
    const session: OAuthSessionRecord = {
      id: randomUUID(), ownerId: input.ownerId, provider: input.provider, service: input.service,
      appId: input.appId || input.service, requestedScopes: input.requestedScopes || [],
      stateHash: hashOAuthState(input.state), redirectUri: input.redirectUri,
      codeVerifier: input.codeVerifier || null, returnTo: input.returnTo || null, status: "created",
      createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(), completedAt: null
    };
    await sql`
      INSERT INTO oauth_authorization_sessions (
        id, owner_id, provider, app_id, service_id, state_hash, pkce_verifier_ciphertext,
        requested_scopes, redirect_uri, return_target, expires_at
      ) VALUES (
        ${session.id}, ${input.ownerId}, ${input.provider}, ${session.appId!}, ${input.service},
        ${session.stateHash}, ${input.codeVerifier ? encryptToken(input.codeVerifier) : null},
        ${session.requestedScopes || []}, ${input.redirectUri}, ${input.returnTo || null}, ${session.expiresAt}
      )
    `;
    return session;
  }
  const db = await readDb();
  const now = new Date();
  const session: OAuthSessionRecord = {
    id: `oauth_session_${input.provider}_${input.service}_${Date.now()}`,
    ownerId: input.ownerId,
    provider: input.provider,
    service: input.service,
    appId: input.appId || input.service,
    requestedScopes: input.requestedScopes || [],
    stateHash: hashOAuthState(input.state),
    redirectUri: input.redirectUri,
    codeVerifier: input.codeVerifier || null,
    returnTo: input.returnTo || null,
    status: "created",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    completedAt: null
  };
  db.sessions.unshift(session);
  await writeDb(pruneExpiredSessions(db));
  return session;
}

export async function completeOAuthSession(state: string) {
  if (hasPostgresStorage()) {
    await ensureAutomationRuntimeSchema();
    const sql = getPostgres();
    const rows = await sql`
      UPDATE oauth_authorization_sessions SET completed_at = NOW()
      WHERE state_hash = ${hashOAuthState(state)} AND completed_at IS NULL AND expires_at > NOW()
      RETURNING *
    `;
    return rows[0] ? mapPostgresSession(rows[0]) : null;
  }
  const db = await readDb();
  const session = db.sessions.find((item) => item.stateHash === hashOAuthState(state));
  if (!session) return null;
  session.status = "completed";
  session.completedAt = new Date().toISOString();
  await writeDb(db);
  return session;
}

export async function consumeOAuthSession(input: {
  ownerId: string;
  state: string;
  provider: ConnectableOAuthProviderId;
}) {
  if (hasPostgresStorage()) {
    await ensureAutomationRuntimeSchema();
    const sql = getPostgres();
    return sql.begin(async (transaction) => {
      const rows = await transaction`
        SELECT * FROM oauth_authorization_sessions
        WHERE owner_id = ${input.ownerId} AND state_hash = ${hashOAuthState(input.state)}
        FOR UPDATE
      `;
      if (!rows[0]) throw new Error("OAuth state is invalid or expired.");
      if (String(rows[0].provider) !== input.provider) throw new Error("OAuth provider does not match state.");
      if (rows[0].completed_at) throw new Error("OAuth state has already been used.");
      if (new Date(rows[0].expires_at as Date | string).getTime() <= Date.now()) throw new Error("OAuth state is expired.");
      const completed = await transaction`
        UPDATE oauth_authorization_sessions SET completed_at = NOW()
        WHERE id = ${String(rows[0].id)} AND completed_at IS NULL
        RETURNING *
      `;
      if (!completed[0]) throw new Error("OAuth state has already been used.");
      return mapPostgresSession(completed[0]);
    }) as Promise<OAuthSessionRecord>;
  }
  const db = await readDb();
  const session = db.sessions.find(
    (item) =>
      item.ownerId === input.ownerId && item.stateHash === hashOAuthState(input.state)
  );
  if (!session) throw new Error("OAuth state is invalid or expired.");
  if (session.status !== "created") throw new Error("OAuth state has already been used.");
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    session.status = "expired";
    await writeDb(db);
    throw new Error("OAuth state is expired.");
  }
  if (session.provider !== input.provider) throw new Error("OAuth provider does not match state.");

  session.status = "completed";
  session.completedAt = new Date().toISOString();
  await writeDb(db);
  return session;
}

export async function findOAuthSession(state: string) {
  if (hasPostgresStorage()) {
    await ensureAutomationRuntimeSchema();
    const sql = getPostgres();
    const rows = await sql`SELECT * FROM oauth_authorization_sessions WHERE state_hash = ${hashOAuthState(state)} LIMIT 1`;
    return rows[0] ? mapPostgresSession(rows[0]) : null;
  }
  const db = await readDb();
  return db.sessions.find((item) => item.stateHash === hashOAuthState(state)) || null;
}

export async function listOAuthSessions() {
  if (hasPostgresStorage()) {
    await ensureAutomationRuntimeSchema();
    const sql = getPostgres();
    const rows = await sql`SELECT * FROM oauth_authorization_sessions ORDER BY created_at DESC`;
    return rows.map(mapPostgresSession);
  }
  return (await readDb()).sessions;
}

export function hashOAuthState(state: string) {
  return createHash("sha256").update(state).digest("base64url");
}

async function readDb() {
  const db = await readJsonStore<OAuthSessionDb>("oauth-sessions.json", EMPTY_DB);
  return {
    sessions: Array.isArray(db.sessions) ? db.sessions.map(normalizeSessionRecord) : []
  };
}

function writeDb(db: OAuthSessionDb) {
  return writeJsonStore("oauth-sessions.json", db);
}

function pruneExpiredSessions(db: OAuthSessionDb) {
  const now = Date.now();
  return {
    sessions: db.sessions.map((session) =>
      session.status === "created" && new Date(session.expiresAt).getTime() <= now
        ? { ...session, status: "expired" as const }
        : session
    )
  };
}

function normalizeSessionRecord(record: OAuthSessionRecord): OAuthSessionRecord {
  const legacy = record as OAuthSessionRecord & {
    ownerId?: string;
    state?: string;
    service?: OAuthServiceId;
    expiresAt?: string;
  };
  return {
    ...record,
    ownerId: legacy.ownerId || null,
    service: legacy.service || (record.provider === "google" ? "drive" : record.provider),
    appId: record.appId || legacy.service || record.provider,
    requestedScopes: record.requestedScopes || [],
    stateHash: record.stateHash || (legacy.state ? hashOAuthState(legacy.state) : ""),
    codeVerifier: record.codeVerifier || null,
    returnTo: record.returnTo || null,
    expiresAt:
      record.expiresAt ||
      new Date(new Date(record.createdAt).getTime() + SESSION_TTL_MS).toISOString()
  };
}

function mapPostgresSession(row: Record<string, unknown>): OAuthSessionRecord {
  return {
    id: String(row.id), ownerId: String(row.owner_id),
    provider: String(row.provider) as ConnectableOAuthProviderId,
    service: String(row.service_id || row.app_id) as OAuthServiceId,
    appId: String(row.app_id), requestedScopes: Array.isArray(row.requested_scopes) ? row.requested_scopes.map(String) : [],
    stateHash: String(row.state_hash), redirectUri: String(row.redirect_uri),
    codeVerifier: row.pkce_verifier_ciphertext ? decryptToken(String(row.pkce_verifier_ciphertext)) : null,
    returnTo: row.return_target ? String(row.return_target) : null,
    status: row.completed_at ? "completed" : new Date(row.expires_at as Date | string).getTime() <= Date.now() ? "expired" : "created",
    createdAt: new Date(row.created_at as Date | string).toISOString(),
    expiresAt: new Date(row.expires_at as Date | string).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at as Date | string).toISOString() : null
  };
}
