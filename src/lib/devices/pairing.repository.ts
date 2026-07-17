import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { getPostgres, hasPostgresStorage } from "../db/postgres";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";
import { safeDigestEqual } from "../security/keyed-digest";
import { DeviceProtocolError, PAIRING_MAX_CODE_ATTEMPTS } from "./device-contract";
import { ensureDeviceSchema } from "./device.schema";
import type { DevicePlatform, DeviceStatus, PairedDevice } from "./device.types";

export type PairingSessionState =
  | "awaiting_device"
  | "awaiting_confirmation"
  | "confirmed"
  | "expired"
  | "locked";

export type PairingSessionRecord = {
  id: string;
  ownerId: string;
  platform: DevicePlatform;
  tokenDigest: string;
  state: PairingSessionState;
  confirmationCodeDigest: string | null;
  confirmationAttempts: number;
  keyAlgorithm: "ES256" | null;
  publicKeySpki: string | null;
  appVersion: string | null;
  deviceId: string | null;
  expiresAt: string;
  registeredAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PairingStatusResult = { state: PairingSessionState; deviceId: string | null; expiresAt: string };

type StoredSyncEvent = {
  id: string;
  ownerId: string;
  deviceId: string;
  eventId: string;
  sequence: number;
  payloadType: string;
  acceptedAt: string;
};

type DeviceAuditEvent = {
  id: string;
  ownerId: string;
  deviceId: string | null;
  pairingSessionId: string | null;
  action: string;
  safeMetadata: Record<string, string | number>;
  createdAt: string;
};

type PairingDb = {
  sessions: PairingSessionRecord[];
  devices: PairedDevice[];
  syncEvents: StoredSyncEvent[];
  auditEvents: DeviceAuditEvent[];
};

export interface PairingRepository {
  createSession(session: PairingSessionRecord): Promise<void>;
  registerSession(input: {
    sessionId: string;
    tokenDigest: string;
    platform: DevicePlatform;
    keyAlgorithm: "ES256";
    publicKeySpki: string;
    appVersion: string;
    confirmationCodeDigest: string;
    now: string;
  }): Promise<PairingSessionRecord>;
  confirmSession(input: {
    ownerId: string;
    sessionId: string;
    confirmationCodeDigest: string;
    now: string;
  }): Promise<PairedDevice>;
  getSessionStatus(input: {
    sessionId: string;
    tokenDigest: string;
    now: string;
  }): Promise<{ state: PairingSessionState; deviceId: string | null; expiresAt: string }>;
  getDevice(deviceId: string): Promise<PairedDevice | null>;
  listOwnerDevices(ownerId: string): Promise<PairedDevice[]>;
  setDeviceStatus(ownerId: string, deviceId: string, status: DeviceStatus, now: string): Promise<PairedDevice | null>;
  acceptSyncEvent(input: {
    deviceId: string;
    eventId: string;
    sequence: number;
    payloadType: string;
    now: string;
  }): Promise<PairedDevice>;
}

const FILE_NAME = "device-pairing.json";
const EMPTY_DB: PairingDb = { sessions: [], devices: [], syncEvents: [], auditEvents: [] };

export function getPairingRepository(): PairingRepository {
  return hasPostgresStorage() ? new PostgresPairingRepository() : new JsonPairingRepository();
}

export class JsonPairingRepository implements PairingRepository {
  async createSession(session: PairingSessionRecord) {
    await mutateJson(async (db) => {
      if (db.sessions.some((item) => item.id === session.id ||
        (item.tokenDigest === session.tokenDigest && isActivePairing(item.state)))) {
        throw new DeviceProtocolError("PAIRING_REQUEST_INVALID");
      }
      db.sessions.push(structuredClone(session));
      db.auditEvents.push(audit(session.ownerId, "pairing_created", session.createdAt, {
        platform: session.platform,
        expiresAt: session.expiresAt
      }, session.id));
    });
  }

  async registerSession(input: Parameters<PairingRepository["registerSession"]>[0]): Promise<PairingSessionRecord> {
    const outcome = await mutateJson(async (db) => {
      const session = db.sessions.find((item) => item.id === input.sessionId);
      if (!session) return { error: "PAIRING_SESSION_NOT_FOUND" as const };
      if (!safeDigestEqual(session.tokenDigest, input.tokenDigest)) return { error: "PAIRING_AUTH_INVALID" as const };
      if (session.state === "confirmed") return { error: "PAIRING_ALREADY_CONFIRMED" as const };
      if (session.state === "locked") return { error: "PAIRING_CODE_ATTEMPTS_EXCEEDED" as const };
      if (session.state === "expired" || Date.parse(session.expiresAt) <= Date.parse(input.now)) {
        expireSession(db, session, input.now);
        return { error: "PAIRING_SESSION_EXPIRED" as const };
      }
      if (session.state === "awaiting_confirmation") return { error: "PAIRING_ALREADY_REGISTERED" as const };
      if (session.platform !== input.platform) return { error: "PAIRING_PLATFORM_MISMATCH" as const };
      session.state = "awaiting_confirmation";
      session.keyAlgorithm = input.keyAlgorithm;
      session.publicKeySpki = input.publicKeySpki;
      session.appVersion = input.appVersion;
      session.confirmationCodeDigest = input.confirmationCodeDigest;
      session.registeredAt = input.now;
      session.updatedAt = input.now;
      db.auditEvents.push(audit(session.ownerId, "pairing_registered", input.now, {
        platform: session.platform,
        keyAlgorithm: input.keyAlgorithm
      }, session.id));
      return { value: structuredClone(session) };
    });
    return unwrap<PairingSessionRecord>(outcome);
  }

  async confirmSession(input: Parameters<PairingRepository["confirmSession"]>[0]): Promise<PairedDevice> {
    const outcome = await mutateJson(async (db) => {
      const session = db.sessions.find((item) => item.id === input.sessionId && item.ownerId === input.ownerId);
      if (!session) return { error: "PAIRING_SESSION_NOT_FOUND" as const };
      if (session.state === "confirmed") return { error: "PAIRING_ALREADY_CONFIRMED" as const };
      if (session.state === "locked") return { error: "PAIRING_CODE_ATTEMPTS_EXCEEDED" as const };
      if (session.state === "expired" || Date.parse(session.expiresAt) <= Date.parse(input.now)) {
        expireSession(db, session, input.now);
        return { error: "PAIRING_SESSION_EXPIRED" as const };
      }
      if (session.state !== "awaiting_confirmation" || !session.confirmationCodeDigest ||
          !session.publicKeySpki || !session.keyAlgorithm || !session.appVersion) {
        return { error: "PAIRING_NOT_REGISTERED" as const };
      }
      if (!safeDigestEqual(session.confirmationCodeDigest, input.confirmationCodeDigest)) {
        session.confirmationAttempts = Math.min(PAIRING_MAX_CODE_ATTEMPTS, session.confirmationAttempts + 1);
        session.updatedAt = input.now;
        if (session.confirmationAttempts >= PAIRING_MAX_CODE_ATTEMPTS) session.state = "locked";
        db.auditEvents.push(audit(session.ownerId, "pairing_confirmation_rejected", input.now, {
          reason: session.state === "locked" ? "locked" : "invalid",
          attempt: session.confirmationAttempts
        }, session.id));
        return { error: session.state === "locked" ? "PAIRING_CODE_ATTEMPTS_EXCEEDED" as const : "PAIRING_CODE_INVALID" as const };
      }
      const device = createDevice(session, input.now);
      session.state = "confirmed";
      session.confirmedAt = input.now;
      session.updatedAt = input.now;
      session.deviceId = device.id;
      session.confirmationCodeDigest = null;
      db.devices.unshift(device);
      db.auditEvents.push(audit(session.ownerId, "pairing_confirmed", input.now, {
        platform: session.platform
      }, session.id, device.id));
      return { value: structuredClone(device) };
    });
    return unwrap<PairedDevice>(outcome);
  }

  async getSessionStatus(input: Parameters<PairingRepository["getSessionStatus"]>[0]): Promise<PairingStatusResult> {
    const outcome = await mutateJson(async (db) => {
      const session = db.sessions.find((item) => item.id === input.sessionId);
      if (!session) return { error: "PAIRING_SESSION_NOT_FOUND" as const };
      if (!safeDigestEqual(session.tokenDigest, input.tokenDigest)) return { error: "PAIRING_AUTH_INVALID" as const };
      if (isActivePairing(session.state) && Date.parse(session.expiresAt) <= Date.parse(input.now)) {
        expireSession(db, session, input.now);
      }
      return { value: { state: session.state, deviceId: session.deviceId, expiresAt: session.expiresAt } };
    });
    return unwrap<PairingStatusResult>(outcome);
  }

  async getDevice(deviceId: string) {
    return structuredClone((await readJsonDb()).devices.find((item) => item.id === deviceId) || null);
  }

  async listOwnerDevices(ownerId: string) {
    return structuredClone((await readJsonDb()).devices.filter((item) => item.ownerId === ownerId));
  }

  async setDeviceStatus(ownerId: string, deviceId: string, status: DeviceStatus, now: string) {
    return mutateJson(async (db) => {
      const device = db.devices.find((item) => item.ownerId === ownerId && item.id === deviceId);
      if (!device) return null;
      if (device.status === "revoked" && status !== "revoked") return structuredClone(device);
      device.status = status;
      device.updatedAt = now;
      db.auditEvents.push(audit(ownerId, "device_status_changed", now, { status }, null, deviceId));
      return structuredClone(device);
    });
  }

  async acceptSyncEvent(input: Parameters<PairingRepository["acceptSyncEvent"]>[0]): Promise<PairedDevice> {
    const outcome = await mutateJson(async (db) => {
      const device = db.devices.find((item) => item.id === input.deviceId);
      if (!device) return { error: "DEVICE_NOT_FOUND" as const };
      if (device.status === "revoked") return { error: "DEVICE_REVOKED" as const };
      if (device.status === "paused") return { error: "DEVICE_PAUSED" as const };
      if (db.syncEvents.some((item) => item.deviceId === device.id && item.eventId === input.eventId)) {
        return { error: "DEVICE_EVENT_DUPLICATE" as const };
      }
      if (!Number.isSafeInteger(input.sequence) || input.sequence <= device.lastSequence) {
        return { error: "DEVICE_SEQUENCE_REPLAY" as const };
      }
      db.syncEvents.push({
        id: randomUUID(), ownerId: device.ownerId, deviceId: device.id,
        eventId: input.eventId, sequence: input.sequence,
        payloadType: input.payloadType, acceptedAt: input.now
      });
      device.lastSequence = input.sequence;
      device.lastSyncAt = input.now;
      device.updatedAt = input.now;
      db.auditEvents.push(audit(device.ownerId, "device_sync_accepted", input.now, {
        payloadType: input.payloadType,
        sequence: input.sequence
      }, null, device.id));
      return { value: structuredClone(device) };
    });
    return unwrap<PairedDevice>(outcome);
  }
}

export class PostgresPairingRepository implements PairingRepository {
  async createSession(session: PairingSessionRecord) {
    await ensureDeviceSchema();
    const sql = getPostgres();
    await sql.begin(async (transaction) => {
      await transaction`
        INSERT INTO device_pairing_sessions (
          id, owner_id, platform, token_digest, state, confirmation_code_digest,
          confirmation_attempts, key_algorithm, public_key_spki, app_version, device_id,
          expires_at, registered_at, confirmed_at, created_at, updated_at
        ) VALUES (
          ${session.id}, ${session.ownerId}, ${session.platform}, ${session.tokenDigest}, ${session.state},
          NULL, 0, NULL, NULL, NULL, NULL, ${session.expiresAt}, NULL, NULL,
          ${session.createdAt}, ${session.updatedAt}
        )
      `;
      await insertPostgresAudit(transaction, audit(session.ownerId, "pairing_created", session.createdAt, {
        platform: session.platform,
        expiresAt: session.expiresAt
      }, session.id));
    });
  }

  async registerSession(input: Parameters<PairingRepository["registerSession"]>[0]): Promise<PairingSessionRecord> {
    await ensureDeviceSchema();
    const sql = getPostgres();
    const outcome = await sql.begin(async (transaction) => {
      const rows = await transaction`SELECT * FROM device_pairing_sessions WHERE id = ${input.sessionId} FOR UPDATE`;
      const session = rows[0] ? mapSession(rows[0]) : null;
      if (!session) return { error: "PAIRING_SESSION_NOT_FOUND" as const };
      if (!safeDigestEqual(session.tokenDigest, input.tokenDigest)) return { error: "PAIRING_AUTH_INVALID" as const };
      if (session.state === "confirmed") return { error: "PAIRING_ALREADY_CONFIRMED" as const };
      if (session.state === "locked") return { error: "PAIRING_CODE_ATTEMPTS_EXCEEDED" as const };
      if (session.state === "expired" || Date.parse(session.expiresAt) <= Date.parse(input.now)) {
        await transaction`UPDATE device_pairing_sessions SET state = 'expired', updated_at = ${input.now} WHERE id = ${session.id}`;
        if (session.state !== "expired") await insertPostgresAudit(transaction, audit(session.ownerId, "pairing_expired", input.now, {}, session.id));
        return { error: "PAIRING_SESSION_EXPIRED" as const };
      }
      if (session.state === "awaiting_confirmation") return { error: "PAIRING_ALREADY_REGISTERED" as const };
      if (session.platform !== input.platform) return { error: "PAIRING_PLATFORM_MISMATCH" as const };
      await transaction`
        UPDATE device_pairing_sessions SET
          state = 'awaiting_confirmation', confirmation_code_digest = ${input.confirmationCodeDigest},
          key_algorithm = ${input.keyAlgorithm}, public_key_spki = ${input.publicKeySpki},
          app_version = ${input.appVersion}, registered_at = ${input.now}, updated_at = ${input.now}
        WHERE id = ${session.id}
      `;
      await insertPostgresAudit(transaction, audit(session.ownerId, "pairing_registered", input.now, {
        platform: session.platform,
        keyAlgorithm: input.keyAlgorithm
      }, session.id));
      return { value: { ...session, state: "awaiting_confirmation" as const, confirmationCodeDigest: input.confirmationCodeDigest,
        keyAlgorithm: input.keyAlgorithm, publicKeySpki: input.publicKeySpki, appVersion: input.appVersion,
        registeredAt: input.now, updatedAt: input.now } };
    });
    return unwrap<PairingSessionRecord>(outcome);
  }

  async confirmSession(input: Parameters<PairingRepository["confirmSession"]>[0]): Promise<PairedDevice> {
    await ensureDeviceSchema();
    const sql = getPostgres();
    const outcome = await sql.begin(async (transaction) => {
      const rows = await transaction`
        SELECT * FROM device_pairing_sessions
        WHERE id = ${input.sessionId} AND owner_id = ${input.ownerId}
        FOR UPDATE
      `;
      const session = rows[0] ? mapSession(rows[0]) : null;
      if (!session) return { error: "PAIRING_SESSION_NOT_FOUND" as const };
      if (session.state === "confirmed") return { error: "PAIRING_ALREADY_CONFIRMED" as const };
      if (session.state === "locked") return { error: "PAIRING_CODE_ATTEMPTS_EXCEEDED" as const };
      if (session.state === "expired" || Date.parse(session.expiresAt) <= Date.parse(input.now)) {
        await transaction`UPDATE device_pairing_sessions SET state = 'expired', updated_at = ${input.now} WHERE id = ${session.id}`;
        if (session.state !== "expired") await insertPostgresAudit(transaction, audit(session.ownerId, "pairing_expired", input.now, {}, session.id));
        return { error: "PAIRING_SESSION_EXPIRED" as const };
      }
      if (session.state !== "awaiting_confirmation" || !session.confirmationCodeDigest ||
          !session.publicKeySpki || !session.keyAlgorithm || !session.appVersion) {
        return { error: "PAIRING_NOT_REGISTERED" as const };
      }
      if (!safeDigestEqual(session.confirmationCodeDigest, input.confirmationCodeDigest)) {
        const attempts = Math.min(PAIRING_MAX_CODE_ATTEMPTS, session.confirmationAttempts + 1);
        const locked = attempts >= PAIRING_MAX_CODE_ATTEMPTS;
        await transaction`
          UPDATE device_pairing_sessions SET
            confirmation_attempts = ${attempts}, state = ${locked ? "locked" : "awaiting_confirmation"},
            updated_at = ${input.now}
          WHERE id = ${session.id}
        `;
        await insertPostgresAudit(transaction, audit(session.ownerId, "pairing_confirmation_rejected", input.now, {
          reason: locked ? "locked" : "invalid",
          attempt: attempts
        }, session.id));
        return { error: locked ? "PAIRING_CODE_ATTEMPTS_EXCEEDED" as const : "PAIRING_CODE_INVALID" as const };
      }
      const device = createDevice(session, input.now);
      await transaction`
        INSERT INTO paired_devices (
          id, owner_id, pairing_session_id, platform, name, status, key_algorithm,
          public_key_spki, app_version, last_sequence, last_sync_at, created_at, updated_at
        ) VALUES (
          ${device.id}, ${device.ownerId}, ${session.id}, ${device.platform}, ${device.name},
          ${device.status}, ${device.keyAlgorithm}, ${device.publicKeySpki}, ${device.appVersion},
          0, NULL, ${device.createdAt}, ${device.updatedAt}
        )
      `;
      await transaction`
        UPDATE device_pairing_sessions SET
          state = 'confirmed', device_id = ${device.id}, confirmation_code_digest = NULL,
          confirmed_at = ${input.now}, updated_at = ${input.now}
        WHERE id = ${session.id}
      `;
      await insertPostgresAudit(transaction, audit(session.ownerId, "pairing_confirmed", input.now, {
        platform: session.platform
      }, session.id, device.id));
      return { value: device };
    });
    return unwrap<PairedDevice>(outcome);
  }

  async getSessionStatus(input: Parameters<PairingRepository["getSessionStatus"]>[0]): Promise<PairingStatusResult> {
    await ensureDeviceSchema();
    const sql = getPostgres();
    const outcome = await sql.begin(async (transaction) => {
      const rows = await transaction`SELECT * FROM device_pairing_sessions WHERE id = ${input.sessionId} FOR UPDATE`;
      const session = rows[0] ? mapSession(rows[0]) : null;
      if (!session) return { error: "PAIRING_SESSION_NOT_FOUND" as const };
      if (!safeDigestEqual(session.tokenDigest, input.tokenDigest)) return { error: "PAIRING_AUTH_INVALID" as const };
      if (isActivePairing(session.state) && Date.parse(session.expiresAt) <= Date.parse(input.now)) {
        await transaction`UPDATE device_pairing_sessions SET state = 'expired', updated_at = ${input.now} WHERE id = ${session.id}`;
        await insertPostgresAudit(transaction, audit(session.ownerId, "pairing_expired", input.now, {}, session.id));
        session.state = "expired";
      }
      return { value: { state: session.state, deviceId: session.deviceId, expiresAt: session.expiresAt } };
    });
    return unwrap<PairingStatusResult>(outcome);
  }

  async getDevice(deviceId: string) {
    await ensureDeviceSchema();
    const rows = await getPostgres()`SELECT * FROM paired_devices WHERE id = ${deviceId} LIMIT 1`;
    return rows[0] ? mapDevice(rows[0]) : null;
  }

  async listOwnerDevices(ownerId: string) {
    await ensureDeviceSchema();
    const rows = await getPostgres()`SELECT * FROM paired_devices WHERE owner_id = ${ownerId} ORDER BY created_at DESC`;
    return rows.map(mapDevice);
  }

  async setDeviceStatus(ownerId: string, deviceId: string, status: DeviceStatus, now: string) {
    await ensureDeviceSchema();
    const sql = getPostgres();
    return sql.begin(async (transaction) => {
      const rows = await transaction`
        UPDATE paired_devices SET status = ${status}, updated_at = ${now}
        WHERE owner_id = ${ownerId} AND id = ${deviceId} AND (status <> 'revoked' OR ${status} = 'revoked')
        RETURNING *
      `;
      if (!rows[0]) return null;
      await insertPostgresAudit(transaction, audit(ownerId, "device_status_changed", now, { status }, null, deviceId));
      return mapDevice(rows[0]);
    });
  }

  async acceptSyncEvent(input: Parameters<PairingRepository["acceptSyncEvent"]>[0]): Promise<PairedDevice> {
    await ensureDeviceSchema();
    const sql = getPostgres();
    const outcome = await sql.begin(async (transaction) => {
      const rows = await transaction`SELECT * FROM paired_devices WHERE id = ${input.deviceId} FOR UPDATE`;
      const device = rows[0] ? mapDevice(rows[0]) : null;
      if (!device) return { error: "DEVICE_NOT_FOUND" as const };
      if (device.status === "revoked") return { error: "DEVICE_REVOKED" as const };
      if (device.status === "paused") return { error: "DEVICE_PAUSED" as const };
      const duplicate = await transaction`
        SELECT 1 FROM device_sync_events WHERE device_id = ${device.id} AND event_id = ${input.eventId} LIMIT 1
      `;
      if (duplicate.length > 0) return { error: "DEVICE_EVENT_DUPLICATE" as const };
      if (!Number.isSafeInteger(input.sequence) || input.sequence <= device.lastSequence) {
        return { error: "DEVICE_SEQUENCE_REPLAY" as const };
      }
      await transaction`
        INSERT INTO device_sync_events (id, owner_id, device_id, event_id, sequence, payload_type, accepted_at)
        VALUES (${randomUUID()}, ${device.ownerId}, ${device.id}, ${input.eventId}, ${input.sequence}, ${input.payloadType}, ${input.now})
      `;
      const updatedRows = await transaction`
        UPDATE paired_devices SET last_sequence = ${input.sequence}, last_sync_at = ${input.now}, updated_at = ${input.now}
        WHERE id = ${device.id}
        RETURNING *
      `;
      await insertPostgresAudit(transaction, audit(device.ownerId, "device_sync_accepted", input.now, {
        payloadType: input.payloadType,
        sequence: input.sequence
      }, null, device.id));
      return { value: mapDevice(updatedRows[0]) };
    });
    return unwrap<PairedDevice>(outcome);
  }
}

type Outcome<T> = { value: T } | { error: ConstructorParameters<typeof DeviceProtocolError>[0] };

function unwrap<T>(outcome: Outcome<T>): T {
  if ("error" in outcome) throw new DeviceProtocolError(outcome.error);
  return outcome.value;
}

function createDevice(session: PairingSessionRecord, now: string): PairedDevice {
  if (!session.publicKeySpki || !session.keyAlgorithm || !session.appVersion) {
    throw new DeviceProtocolError("PAIRING_NOT_REGISTERED");
  }
  return {
    id: randomUUID(), ownerId: session.ownerId, platform: session.platform,
    name: session.platform === "android" ? "Android" : "iPhone",
    status: "active", keyAlgorithm: session.keyAlgorithm,
    publicKeySpki: session.publicKeySpki, appVersion: session.appVersion,
    lastSequence: 0, lastSyncAt: null, createdAt: now, updatedAt: now
  };
}

function expireSession(db: PairingDb, session: PairingSessionRecord, now: string) {
  if (session.state === "expired") return;
  session.state = "expired";
  session.confirmationCodeDigest = null;
  session.updatedAt = now;
  db.auditEvents.push(audit(session.ownerId, "pairing_expired", now, {}, session.id));
}

function isActivePairing(state: PairingSessionState) {
  return state === "awaiting_device" || state === "awaiting_confirmation";
}

function audit(
  ownerId: string,
  action: string,
  createdAt: string,
  safeMetadata: Record<string, string | number>,
  pairingSessionId: string | null = null,
  deviceId: string | null = null
): DeviceAuditEvent {
  return { id: randomUUID(), ownerId, deviceId, pairingSessionId, action, safeMetadata, createdAt };
}

async function readJsonDb(): Promise<PairingDb> {
  const raw = await readJsonStore<Partial<PairingDb>>(FILE_NAME, EMPTY_DB);
  return {
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    devices: Array.isArray(raw.devices) ? raw.devices : [],
    syncEvents: Array.isArray(raw.syncEvents) ? raw.syncEvents : [],
    auditEvents: Array.isArray(raw.auditEvents) ? raw.auditEvents : []
  };
}

function mutateJson<T>(mutate: (db: PairingDb) => T | Promise<T>) {
  return withJsonStoreLock(FILE_NAME, async () => {
    const db = await readJsonDb();
    const result = await mutate(db);
    await writeJsonStore(FILE_NAME, db);
    return result;
  });
}

function mapSession(row: Record<string, unknown>): PairingSessionRecord {
  return {
    id: String(row.id), ownerId: String(row.owner_id), platform: parsePlatform(row.platform),
    tokenDigest: String(row.token_digest), state: parseSessionState(row.state),
    confirmationCodeDigest: row.confirmation_code_digest ? String(row.confirmation_code_digest) : null,
    confirmationAttempts: Number(row.confirmation_attempts),
    keyAlgorithm: row.key_algorithm === "ES256" ? "ES256" : null,
    publicKeySpki: row.public_key_spki ? String(row.public_key_spki) : null,
    appVersion: row.app_version ? String(row.app_version) : null,
    deviceId: row.device_id ? String(row.device_id) : null,
    expiresAt: toIso(row.expires_at), registeredAt: row.registered_at ? toIso(row.registered_at) : null,
    confirmedAt: row.confirmed_at ? toIso(row.confirmed_at) : null,
    createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at)
  };
}

function mapDevice(row: Record<string, unknown>): PairedDevice {
  return {
    id: String(row.id), ownerId: String(row.owner_id), platform: parsePlatform(row.platform),
    name: String(row.name), status: parseStatus(row.status), keyAlgorithm: "ES256",
    publicKeySpki: String(row.public_key_spki), appVersion: String(row.app_version),
    lastSequence: Number(row.last_sequence), lastSyncAt: row.last_sync_at ? toIso(row.last_sync_at) : null,
    createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at)
  };
}

function parsePlatform(value: unknown): DevicePlatform {
  if (value === "android" || value === "ios") return value;
  throw new Error("Invalid persisted device platform");
}

function parseStatus(value: unknown): DeviceStatus {
  if (value === "active" || value === "paused" || value === "revoked") return value;
  throw new Error("Invalid persisted device status");
}

function parseSessionState(value: unknown): PairingSessionState {
  if (value === "awaiting_device" || value === "awaiting_confirmation" || value === "confirmed" || value === "expired" || value === "locked") return value;
  throw new Error("Invalid persisted pairing state");
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

async function insertPostgresAudit(
  transaction: postgres.TransactionSql,
  event: DeviceAuditEvent
) {
  await transaction`
    INSERT INTO device_audit_events (
      id, owner_id, device_id, pairing_session_id, action, safe_metadata, created_at
    ) VALUES (
      ${event.id}, ${event.ownerId}, ${event.deviceId}, ${event.pairingSessionId},
      ${event.action}, ${transaction.json(event.safeMetadata as never)}, ${event.createdAt}
    )
  `;
}
