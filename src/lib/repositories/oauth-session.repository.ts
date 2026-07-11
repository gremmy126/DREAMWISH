import { createHash } from "crypto";
import type {
  ConnectableOAuthProviderId,
  OAuthServiceId
} from "@/src/lib/oauth/oauth.types";
import { readJsonStore, writeJsonStore } from "../local-db/json-store";

export type OAuthSessionRecord = {
  id: string;
  ownerId: string | null;
  provider: ConnectableOAuthProviderId;
  service: OAuthServiceId;
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
  state: string;
  redirectUri: string;
  codeVerifier?: string | null;
  returnTo?: string | null;
}) {
  const db = await readDb();
  const now = new Date();
  const session: OAuthSessionRecord = {
    id: `oauth_session_${input.provider}_${input.service}_${Date.now()}`,
    ownerId: input.ownerId,
    provider: input.provider,
    service: input.service,
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
  const db = await readDb();
  return db.sessions.find((item) => item.stateHash === hashOAuthState(state)) || null;
}

export async function listOAuthSessions() {
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
    stateHash: record.stateHash || (legacy.state ? hashOAuthState(legacy.state) : ""),
    codeVerifier: record.codeVerifier || null,
    returnTo: record.returnTo || null,
    expiresAt:
      record.expiresAt ||
      new Date(new Date(record.createdAt).getTime() + SESSION_TTL_MS).toISOString()
  };
}
