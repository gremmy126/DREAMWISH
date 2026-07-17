import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getPostgres, hasPostgresStorage } from "../db/postgres";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";
import { ensureAdminSchema } from "../admin/schema";
import type { SocialProvider } from "./social-oauth.types";

export const OAUTH_LOGIN_STATE_COOKIE = "dreamwish-oauth-login-state" as const;
export const OAUTH_LOGIN_STATE_MAX_AGE_SECONDS = 10 * 60;

type OAuthStateRecord = {
  stateHash: string;
  provider: SocialProvider;
  pendingCouponHash: string | null;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
};

type OAuthStateDb = { states: OAuthStateRecord[] };
const STATE_FILE = "oauth-login-states.json";

export async function issueOAuthLoginState(input: {
  provider: SocialProvider;
  pendingCouponHash: string | null;
  now?: Date;
}) {
  const now = input.now || new Date();
  const state = randomBytes(32).toString("base64url");
  const stateHash = hashState(state);
  const expiresAt = new Date(now.getTime() + OAUTH_LOGIN_STATE_MAX_AGE_SECONDS * 1000);
  const record: OAuthStateRecord = {
    stateHash,
    provider: input.provider,
    pendingCouponHash: /^[a-f0-9]{64}$/u.test(input.pendingCouponHash || "") ? input.pendingCouponHash : null,
    expiresAt: expiresAt.toISOString(),
    usedAt: null,
    createdAt: now.toISOString()
  };
  if (hasPostgresStorage()) {
    await ensureAdminSchema();
    await getPostgres()`INSERT INTO oauth_login_states (state_hash, provider, pending_coupon_hash, expires_at, created_at) VALUES (${record.stateHash}, ${record.provider}, ${record.pendingCouponHash}, ${record.expiresAt}, ${record.createdAt})`;
  } else {
    await withJsonStoreLock(STATE_FILE, async () => {
      const db = await readStateDb();
      db.states = [record, ...db.states.filter((item) => new Date(item.expiresAt).getTime() > now.getTime())];
      await writeJsonStore(STATE_FILE, db);
    });
  }
  const payload = Buffer.from(JSON.stringify({ provider: input.provider, stateHash, exp: expiresAt.getTime() }), "utf8").toString("base64url");
  return { state, cookie: `${payload}.${sign(payload)}`, expiresAt: expiresAt.toISOString() };
}

export async function consumeOAuthLoginState(input: {
  provider: SocialProvider;
  state: string;
  cookie: string;
  now?: Date;
}) {
  const now = input.now || new Date();
  const state = input.state.trim();
  if (!/^[A-Za-z0-9_-]{32,128}$/u.test(state)) throw new Error("OAuth state is invalid.");
  const stateHash = hashState(state);
  const cookie = parseSignedCookie(input.cookie);
  if (!cookie || cookie.provider !== input.provider || cookie.stateHash !== stateHash || cookie.exp <= now.getTime()) {
    throw new Error("OAuth state verification failed.");
  }
  if (hasPostgresStorage()) {
    await ensureAdminSchema();
    const sql = getPostgres();
    return sql.begin(async (transaction) => {
      const rows = await transaction`SELECT * FROM oauth_login_states WHERE state_hash = ${stateHash} FOR UPDATE`;
      const row = rows[0];
      if (!row || row.provider !== input.provider || row.used_at || new Date(row.expires_at as Date | string).getTime() <= now.getTime()) {
        throw new Error("OAuth state is expired or already used.");
      }
      await transaction`UPDATE oauth_login_states SET used_at = ${now.toISOString()} WHERE state_hash = ${stateHash}`;
      return { pendingCouponHash: row.pending_coupon_hash ? String(row.pending_coupon_hash) : null };
    });
  }
  return withJsonStoreLock(STATE_FILE, async () => {
    const db = await readStateDb();
    const index = db.states.findIndex((item) => item.stateHash === stateHash);
    const record = db.states[index];
    if (!record || record.provider !== input.provider || record.usedAt || new Date(record.expiresAt).getTime() <= now.getTime()) {
      throw new Error("OAuth state is expired or already used.");
    }
    db.states[index] = { ...record, usedAt: now.toISOString() };
    await writeJsonStore(STATE_FILE, db);
    return { pendingCouponHash: record.pendingCouponHash };
  });
}

export function readOAuthStateCookie(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(";")) {
    const index = pair.indexOf("=");
    if (index < 0 || pair.slice(0, index).trim() !== OAUTH_LOGIN_STATE_COOKIE) continue;
    try { return decodeURIComponent(pair.slice(index + 1).trim()); } catch { return null; }
  }
  return null;
}

function parseSignedCookie(value: string) {
  const [payload, signature] = value.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    return (parsed.provider === "kakao" || parsed.provider === "naver") && typeof parsed.stateHash === "string" && typeof parsed.exp === "number"
      ? { provider: parsed.provider, stateHash: parsed.stateHash, exp: parsed.exp }
      : null;
  } catch { return null; }
}

function hashState(state: string) { return createHmac("sha256", getStateSecret()).update(state).digest("hex"); }
function sign(payload: string) { return createHmac("sha256", getStateSecret()).update(payload).digest("base64url"); }
function safeEqual(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function getStateSecret() { const secret = process.env.AUTH_OAUTH_STATE_SECRET?.trim() || ""; if (secret.length < 32) throw new Error("AUTH_OAUTH_STATE_SECRET must contain at least 32 characters."); return secret; }
async function readStateDb(): Promise<OAuthStateDb> { const db = await readJsonStore<OAuthStateDb>(STATE_FILE, { states: [] }); return { states: Array.isArray(db.states) ? db.states : [] }; }

