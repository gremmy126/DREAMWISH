import type { OAuthProviderId } from "@/src/lib/oauth/oauth.types";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

export type OAuthSessionRecord = {
  id: string;
  provider: OAuthProviderId;
  state: string;
  redirectUri: string;
  status: "created" | "completed" | "expired";
  createdAt: string;
  completedAt: string | null;
};

type OAuthSessionDb = {
  sessions: OAuthSessionRecord[];
};

const EMPTY_DB: OAuthSessionDb = { sessions: [] };

export async function createOAuthSession(input: {
  provider: OAuthProviderId;
  state: string;
  redirectUri: string;
}) {
  const db = await readDb();
  const session: OAuthSessionRecord = {
    id: `oauth_session_${input.provider}_${Date.now()}`,
    provider: input.provider,
    state: input.state,
    redirectUri: input.redirectUri,
    status: "created",
    createdAt: new Date().toISOString(),
    completedAt: null
  };
  db.sessions.unshift(session);
  await writeDb(db);
  return session;
}

export async function completeOAuthSession(state: string) {
  const db = await readDb();
  const session = db.sessions.find((item) => item.state === state);
  if (!session) return null;
  session.status = "completed";
  session.completedAt = new Date().toISOString();
  await writeDb(db);
  return session;
}

export async function listOAuthSessions() {
  return (await readDb()).sessions;
}

async function readDb() {
  const db = await readJsonStore<OAuthSessionDb>("oauth-sessions.json", EMPTY_DB);
  return { sessions: Array.isArray(db.sessions) ? db.sessions : [] };
}

function writeDb(db: OAuthSessionDb) {
  return writeJsonStore("oauth-sessions.json", db);
}
