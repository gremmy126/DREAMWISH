import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";
import type {
  CalendarCandidate,
  ContactCandidate,
  DevicePlatform,
  DeviceStatus,
  PairedDevice,
  PairingChallenge
} from "./device.types";

type StoredDevice = PairedDevice & { secretHash: string };
type StoredChallenge = Omit<PairingChallenge, "code"> & { codeHash: string; usedAt: string | null };
type DeviceDb = {
  devices: StoredDevice[];
  challenges: StoredChallenge[];
  contacts: ContactCandidate[];
  calendars: CalendarCandidate[];
};

const FILE_NAME = "devices.json";
const EMPTY_DB: DeviceDb = { devices: [], challenges: [], contacts: [], calendars: [] };
const PAIRING_TTL_MS = 10 * 60 * 1000;

export async function createPairingChallenge(ownerId: string, platform: DevicePlatform): Promise<PairingChallenge> {
  if (!ownerId.trim()) throw new Error("pairing_owner_required");
  const code = String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
  const challenge: PairingChallenge = {
    id: randomUUID(),
    ownerId,
    platform,
    code,
    expiresAt: new Date(Date.now() + PAIRING_TTL_MS).toISOString()
  };
  await withDb(async (db) => {
    db.challenges = db.challenges.filter((item) => new Date(item.expiresAt).getTime() > Date.now() - PAIRING_TTL_MS);
    db.challenges.push({
      id: challenge.id,
      ownerId,
      platform,
      codeHash: hashSecret(code),
      expiresAt: challenge.expiresAt,
      usedAt: null
    });
  });
  return challenge;
}

export async function pairDevice(input: {
  ownerId?: string;
  challengeId: string;
  code: string;
  platform: DevicePlatform;
  name: string;
}) {
  return withDb(async (db) => {
    const challenge = db.challenges.find((item) => item.id === input.challengeId);
    if (!challenge) throw new Error("pairing_challenge_not_found");
    if (input.ownerId && challenge.ownerId !== input.ownerId) throw new Error("pairing_owner_mismatch");
    if (challenge.platform !== input.platform) throw new Error("pairing_platform_mismatch");
    if (challenge.usedAt) throw new Error("pairing_challenge_used");
    if (new Date(challenge.expiresAt).getTime() <= Date.now()) throw new Error("pairing_challenge_expired");
    if (!safeHashEqual(challenge.codeHash, hashSecret(input.code))) throw new Error("pairing_code_invalid");

    const now = new Date().toISOString();
    const deviceSecret = randomBytes(32).toString("base64url");
    const device: StoredDevice = {
      id: randomUUID(),
      ownerId: challenge.ownerId,
      platform: input.platform,
      name: input.name.trim().slice(0, 80) || (input.platform === "android" ? "Android" : "iPhone"),
      status: "active",
      lastSequence: 0,
      lastSyncAt: null,
      createdAt: now,
      updatedAt: now,
      secretHash: hashSecret(deviceSecret)
    };
    challenge.usedAt = now;
    db.devices.unshift(device);
    return { device: publicDevice(device), deviceSecret };
  });
}

export async function listOwnerDevices(ownerId: string) {
  return (await readDb()).devices.filter((item) => item.ownerId === ownerId).map(publicDevice);
}

export async function setDeviceStatus(ownerId: string, deviceId: string, status: DeviceStatus) {
  return withDb(async (db) => {
    const device = db.devices.find((item) => item.ownerId === ownerId && item.id === deviceId);
    if (!device) return null;
    device.status = status;
    device.updatedAt = new Date().toISOString();
    return publicDevice(device);
  });
}

export function revokeDevice(ownerId: string, deviceId: string) {
  return setDeviceStatus(ownerId, deviceId, "revoked");
}

export async function acceptDeviceEnvelope(deviceId: string, secret: string, sequence: number) {
  return withDb(async (db) => {
    const device = db.devices.find((item) => item.id === deviceId);
    if (!device || !safeHashEqual(device.secretHash, hashSecret(secret))) throw new Error("device_auth_invalid");
    if (device.status === "revoked") throw new Error("device_revoked");
    if (device.status !== "active") throw new Error("device_paused");
    if (!Number.isSafeInteger(sequence) || sequence <= device.lastSequence) throw new Error("device_replay");
    const now = new Date().toISOString();
    device.lastSequence = sequence;
    device.lastSyncAt = now;
    device.updatedAt = now;
    return publicDevice(device);
  });
}

export async function ingestContactCandidates(
  ownerId: string,
  deviceId: string,
  candidates: Array<{ externalId: string; name?: string; phone?: string; email?: string; companyName?: string; position?: string }>
) {
  return withDb(async (db) => {
    assertActiveOwnerDevice(db, ownerId, deviceId);
    const now = new Date().toISOString();
    const saved: ContactCandidate[] = [];
    for (const input of candidates.slice(0, 500)) {
      if (!input.externalId?.trim()) continue;
      let candidate = db.contacts.find((item) => item.ownerId === ownerId && item.deviceId === deviceId && item.externalId === input.externalId);
      if (!candidate) {
        candidate = {
          id: randomUUID(), ownerId, deviceId, externalId: input.externalId,
          name: "", phone: "", email: "", companyName: "", position: "",
          status: "pending", createdAt: now, updatedAt: now
        };
        db.contacts.unshift(candidate);
      }
      if (candidate.status !== "imported") candidate.status = "pending";
      candidate.name = clean(input.name, 120);
      candidate.phone = clean(input.phone, 60);
      candidate.email = clean(input.email, 180);
      candidate.companyName = clean(input.companyName, 160);
      candidate.position = clean(input.position, 100);
      candidate.updatedAt = now;
      saved.push(candidate);
    }
    return saved;
  });
}

export async function ingestCalendarCandidates(
  ownerId: string,
  deviceId: string,
  candidates: Array<{ externalId: string; title?: string; startsAt: string; endsAt: string; timezone?: string; sourceCalendar?: string }>
) {
  return withDb(async (db) => {
    const device = assertActiveOwnerDevice(db, ownerId, deviceId);
    const now = new Date().toISOString();
    const saved: CalendarCandidate[] = [];
    for (const input of candidates.slice(0, 500)) {
      if (!input.externalId?.trim() || !isIsoDate(input.startsAt) || !isIsoDate(input.endsAt)) continue;
      let candidate = db.calendars.find((item) => item.ownerId === ownerId && item.deviceId === deviceId && item.externalId === input.externalId);
      if (!candidate) {
        candidate = {
          id: randomUUID(), ownerId, deviceId, externalId: input.externalId,
          title: "", startsAt: input.startsAt, endsAt: input.endsAt, timezone: "UTC",
          sourceCalendar: "기본", sourceDevice: device.name, status: "pending",
          createdAt: now, updatedAt: now
        };
        db.calendars.unshift(candidate);
      }
      if (candidate.status !== "imported") candidate.status = "pending";
      candidate.title = clean(input.title, 200) || "휴대폰 일정";
      candidate.startsAt = input.startsAt;
      candidate.endsAt = input.endsAt;
      candidate.timezone = clean(input.timezone, 80) || "UTC";
      candidate.sourceCalendar = clean(input.sourceCalendar, 120) || "기본";
      candidate.sourceDevice = device.name;
      candidate.updatedAt = now;
      saved.push(candidate);
    }
    return saved;
  });
}

export async function listContactCandidates(ownerId: string, deviceId?: string) {
  return (await readDb()).contacts.filter((item) => item.ownerId === ownerId && (!deviceId || item.deviceId === deviceId));
}

export async function listCalendarCandidates(ownerId: string, deviceId?: string) {
  return (await readDb()).calendars.filter((item) => item.ownerId === ownerId && (!deviceId || item.deviceId === deviceId));
}

export async function markContactCandidates(ownerId: string, ids: string[], status: ContactCandidate["status"]) {
  return withDb(async (db) => {
    const updated = db.contacts.filter((item) => item.ownerId === ownerId && ids.includes(item.id));
    const now = new Date().toISOString();
    for (const item of updated) { item.status = status; item.updatedAt = now; }
    return updated;
  });
}

export async function markCalendarCandidates(ownerId: string, ids: string[], status: CalendarCandidate["status"]) {
  return withDb(async (db) => {
    const updated = db.calendars.filter((item) => item.ownerId === ownerId && ids.includes(item.id));
    const now = new Date().toISOString();
    for (const item of updated) { item.status = status; item.updatedAt = now; }
    return updated;
  });
}

function assertActiveOwnerDevice(db: DeviceDb, ownerId: string, deviceId: string) {
  const device = db.devices.find((item) => item.ownerId === ownerId && item.id === deviceId);
  if (!device) throw new Error("device_not_found");
  if (device.status !== "active") throw new Error(`device_${device.status}`);
  return device;
}

function publicDevice(device: StoredDevice): PairedDevice {
  const { secretHash: _secretHash, ...safe } = device;
  return safe;
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeHashEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function clean(value: string | undefined, max: number) {
  return String(value || "").trim().slice(0, max);
}

function isIsoDate(value: string) {
  return Number.isFinite(new Date(value).getTime());
}

async function readDb(): Promise<DeviceDb> {
  const raw = await readJsonStore<Partial<DeviceDb>>(FILE_NAME, EMPTY_DB);
  return {
    devices: Array.isArray(raw.devices) ? raw.devices : [],
    challenges: Array.isArray(raw.challenges) ? raw.challenges : [],
    contacts: Array.isArray(raw.contacts) ? raw.contacts : [],
    calendars: Array.isArray(raw.calendars) ? raw.calendars : []
  };
}

function withDb<T>(operation: (db: DeviceDb) => Promise<T> | T): Promise<T> {
  return withJsonStoreLock(FILE_NAME, async () => {
    const db = await readDb();
    const result = await operation(db);
    await writeJsonStore(FILE_NAME, db);
    return result;
  });
}
