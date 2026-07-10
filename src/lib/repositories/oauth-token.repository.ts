import type {
  ConnectableOAuthProviderId,
  OAuthServiceId,
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
  const service = input.service || defaultServiceForProvider(input.provider);
  const existingIndex = db.tokens.findIndex(
    (token) =>
      token.provider === input.provider &&
      (token.service || defaultServiceForProvider(token.provider)) === service &&
      (!input.providerAccountId || token.providerAccountId === input.providerAccountId)
  );
  const previous = existingIndex >= 0 ? db.tokens[existingIndex] : null;
  const record: OAuthTokenRecord = {
    id:
      existingIndex >= 0
        ? db.tokens[existingIndex].id
        : `oauth_token_${input.provider}_${service}_${Date.now()}`,
    provider: input.provider,
    service,
    providerAccountId: input.providerAccountId || previous?.providerAccountId || null,
    accountName: input.accountName || previous?.accountName || input.accountEmail,
    accountEmail: input.accountEmail,
    accountAvatarUrl: input.accountAvatarUrl || previous?.accountAvatarUrl || null,
    workspaceId: input.workspaceId || previous?.workspaceId || null,
    workspaceName: input.workspaceName || previous?.workspaceName || null,
    accessTokenEncrypted: encryptToken(input.accessToken),
    refreshTokenEncrypted:
      input.refreshToken === undefined || input.refreshToken === null
        ? previous?.refreshTokenEncrypted || encryptToken("")
        : encryptToken(input.refreshToken),
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

export async function revokeOAuthToken(
  provider: ConnectableOAuthProviderId,
  service?: OAuthServiceId | null
) {
  const db = await readDb();
  const token = db.tokens.find(
    (item) =>
      item.provider === provider &&
      (!service || (item.service || defaultServiceForProvider(item.provider)) === service)
  );
  if (!token) return null;
  token.status = "revoked";
  token.updatedAt = new Date().toISOString();
  await writeDb(db);
  return token;
}

async function readDb() {
  const db = await readJsonStore<OAuthTokenDb>("oauth-tokens.json", EMPTY_DB);
  return { tokens: Array.isArray(db.tokens) ? db.tokens.map(normalizeTokenRecord) : [] };
}

function writeDb(db: OAuthTokenDb) {
  return writeJsonStore("oauth-tokens.json", db);
}

function normalizeTokenRecord(token: OAuthTokenRecord): OAuthTokenRecord {
  return {
    ...token,
    service: token.service || defaultServiceForProvider(token.provider),
    providerAccountId: token.providerAccountId || null,
    accountName: token.accountName || token.accountEmail || null,
    accountAvatarUrl: token.accountAvatarUrl || null,
    workspaceId: token.workspaceId || null,
    workspaceName: token.workspaceName || null
  };
}

function defaultServiceForProvider(provider: OAuthTokenRecord["provider"]) {
  if (provider === "firebase") return null;
  if (provider === "google") return "drive";
  return provider;
}
