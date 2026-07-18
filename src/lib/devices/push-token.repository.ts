import { createHash, randomUUID } from "node:crypto";
import { getPostgres, hasPostgresStorage } from "../db/postgres";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";
import { decryptToken, encryptToken } from "../oauth/token-encryption";
import { ensureDeviceSchema } from "./device.schema";
import type { DevicePlatform } from "./device.types";

type TokenRow = { id: string; deviceId: string; ownerId: string; platform: DevicePlatform; tokenCiphertext: string; tokenDigest: string; status: "active" | "revoked"; createdAt: string; updatedAt: string; revokedAt: string | null };
const FILE = "device-push-tokens.json";

export async function registerDevicePushToken(input: { deviceId: string; ownerId: string; platform: DevicePlatform; token: string }) {
  const digest = tokenDigest(input.token); const ciphertext = encryptToken(input.token); const now = new Date().toISOString();
  if (hasPostgresStorage()) {
    await ensureDeviceSchema();
    const rows = await getPostgres()`
      INSERT INTO device_push_tokens (id, device_id, owner_id, platform, token_ciphertext, token_digest, status)
      VALUES (${randomUUID()}, ${input.deviceId}, ${input.ownerId}, ${input.platform}, ${ciphertext}, ${digest}, 'active')
      ON CONFLICT (token_digest) WHERE status = 'active' DO UPDATE SET
        device_id = EXCLUDED.device_id, owner_id = EXCLUDED.owner_id, platform = EXCLUDED.platform,
        token_ciphertext = EXCLUDED.token_ciphertext, updated_at = NOW()
      RETURNING id, device_id, owner_id, platform, status, created_at, updated_at
    `;
    return publicRow(rows[0]!);
  }
  return withJsonStoreLock(FILE, async () => {
    const db = await readJsonStore<{tokens: TokenRow[]}>(FILE, {tokens: []}); const previous = db.tokens.find(row => row.tokenDigest === digest && row.status === "active");
    const row: TokenRow = previous ? {...previous, deviceId: input.deviceId, ownerId: input.ownerId, platform: input.platform, tokenCiphertext: ciphertext, updatedAt: now} : {id: randomUUID(), deviceId: input.deviceId, ownerId: input.ownerId, platform: input.platform, tokenCiphertext: ciphertext, tokenDigest: digest, status: "active", createdAt: now, updatedAt: now, revokedAt: null};
    db.tokens = [row, ...db.tokens.filter(item => item.id !== row.id)]; await writeJsonStore(FILE, db); return publicRow(row);
  });
}

export async function revokeDevicePushToken(input: { deviceId: string; ownerId: string; token: string }) {
  const digest = tokenDigest(input.token); const now = new Date().toISOString();
  if (hasPostgresStorage()) { await ensureDeviceSchema(); const rows = await getPostgres()`UPDATE device_push_tokens SET status = 'revoked', revoked_at = NOW(), updated_at = NOW() WHERE device_id = ${input.deviceId} AND owner_id = ${input.ownerId} AND token_digest = ${digest} AND status = 'active' RETURNING id, device_id, owner_id, platform, status, created_at, updated_at, revoked_at`; return rows[0] ? publicRow(rows[0]) : null; }
  return withJsonStoreLock(FILE, async () => { const db = await readJsonStore<{tokens: TokenRow[]}>(FILE, {tokens: []}); const row = db.tokens.find(item => item.deviceId === input.deviceId && item.ownerId === input.ownerId && item.tokenDigest === digest && item.status === "active"); if (!row) return null; row.status = "revoked"; row.revokedAt = now; row.updatedAt = now; await writeJsonStore(FILE, db); return publicRow(row); });
}

export async function revokeDevicePushTokens(deviceId: string, ownerId: string) {
  if (hasPostgresStorage()) { await ensureDeviceSchema(); await getPostgres()`UPDATE device_push_tokens SET status = 'revoked', revoked_at = NOW(), updated_at = NOW() WHERE device_id = ${deviceId} AND owner_id = ${ownerId} AND status = 'active'`; return; }
  await withJsonStoreLock(FILE, async () => { const db = await readJsonStore<{tokens: TokenRow[]}>(FILE, {tokens: []}); const now = new Date().toISOString(); for (const row of db.tokens) if (row.deviceId === deviceId && row.ownerId === ownerId && row.status === "active") { row.status = "revoked"; row.revokedAt = now; row.updatedAt = now; } await writeJsonStore(FILE, db); });
}

export async function listActivePushTokens(ownerId: string) {
  return (await listActivePushTokenRecords(ownerId)).map((row) => row.token);
}

export async function listActivePushTokenRecords(ownerId: string) {
  if (hasPostgresStorage()) {
    await ensureDeviceSchema();
    const rows = await getPostgres()`SELECT device_id, owner_id, platform, token_ciphertext FROM device_push_tokens WHERE owner_id = ${ownerId} AND status = 'active'`;
    return rows.map((row) => ({ deviceId: String(row.device_id), ownerId: String(row.owner_id), platform: String(row.platform) as DevicePlatform, token: decryptToken(String(row.token_ciphertext)) }));
  }
  const db = await readJsonStore<{tokens: TokenRow[]}>(FILE, {tokens: []});
  return db.tokens.filter(row => row.ownerId === ownerId && row.status === "active")
    .map(row => ({ deviceId: row.deviceId, ownerId: row.ownerId, platform: row.platform, token: decryptToken(row.tokenCiphertext) }));
}

function tokenDigest(value: string) { return createHash("sha256").update(value).digest("hex"); }
function publicRow(row: Record<string, unknown> | TokenRow) { return { id: String("id" in row ? row.id : ""), deviceId: String("deviceId" in row ? row.deviceId : row.device_id), ownerId: String("ownerId" in row ? row.ownerId : row.owner_id), platform: String("platform" in row ? row.platform : "") as DevicePlatform, status: String("status" in row ? row.status : "active") }; }
