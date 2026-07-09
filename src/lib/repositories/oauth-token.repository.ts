import type {
  OAuthProviderId,
  OAuthTokenRecord,
  OAuthTokenSaveInput
} from "@/src/lib/oauth/oauth.types";
import { encryptToken } from "@/src/lib/oauth/token-encryption";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

type OAuthTokenDb = {
  tokens: OAuthTokenRecord[];
};

const EMPTY_DB: OAuthTokenDb = { tokens: [] };

export async function saveOAuthToken(input: OAuthTokenSaveInput) {
  const db = await readDb();
  const now = new Date().toISOString();
  const existingIndex = db.tokens.findIndex((token) => token.provider === input.provider);
  const record: OAuthTokenRecord = {
    id:
      existingIndex >= 0
        ? db.tokens[existingIndex].id
        : `oauth_token_${input.provider}_${Date.now()}`,
    provider: input.provider,
    accountEmail: input.accountEmail,
    accessTokenEncrypted: encryptToken(input.accessToken),
    refreshTokenEncrypted: encryptToken(input.refreshToken || ""),
    expiresAt: input.expiresAt || null,
    scope: input.scope,
    status: "active",
    createdAt: existingIndex >= 0 ? db.tokens[existingIndex].createdAt : now,
    updatedAt: now
  };

  if (existingIndex >= 0) db.tokens[existingIndex] = record;
  else db.tokens.unshift(record);

  await writeDb(db);
  return record;
}

export async function listOAuthTokens() {
  return (await readDb()).tokens;
}

export async function revokeOAuthToken(provider: OAuthProviderId) {
  const db = await readDb();
  const token = db.tokens.find((item) => item.provider === provider);
  if (!token) return null;
  token.status = "revoked";
  token.updatedAt = new Date().toISOString();
  await writeDb(db);
  return token;
}

async function readDb() {
  const db = await readJsonStore<OAuthTokenDb>("oauth-tokens.json", EMPTY_DB);
  return { tokens: Array.isArray(db.tokens) ? db.tokens : [] };
}

function writeDb(db: OAuthTokenDb) {
  return writeJsonStore("oauth-tokens.json", db);
}
