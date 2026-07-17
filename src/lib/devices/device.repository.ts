import { randomUUID } from "node:crypto";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";
import { getPairingRepository } from "./pairing.repository";
import type { CalendarCandidate, ContactCandidate, DeviceStatus } from "./device.types";

type CandidateDb = {
  contacts: ContactCandidate[];
  calendars: CalendarCandidate[];
};

const FILE_NAME = "devices.json";
const EMPTY_DB: CandidateDb = { contacts: [], calendars: [] };

export function listOwnerDevices(ownerId: string) {
  return getPairingRepository().listOwnerDevices(ownerId);
}

export function setDeviceStatus(ownerId: string, deviceId: string, status: DeviceStatus) {
  return getPairingRepository().setDeviceStatus(ownerId, deviceId, status, new Date().toISOString());
}

export function revokeDevice(ownerId: string, deviceId: string) {
  return setDeviceStatus(ownerId, deviceId, "revoked");
}

export async function ingestContactCandidates(
  ownerId: string,
  deviceId: string,
  candidates: Array<{ externalId: string; name?: string; phone?: string; email?: string; companyName?: string; position?: string }>
) {
  await requireActiveOwnerDevice(ownerId, deviceId);
  return withDb(async (db) => {
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
  const device = await requireActiveOwnerDevice(ownerId, deviceId);
  return withDb(async (db) => {
    const now = new Date().toISOString();
    const saved: CalendarCandidate[] = [];
    for (const input of candidates.slice(0, 500)) {
      if (!input.externalId?.trim() || !isIsoDate(input.startsAt) || !isIsoDate(input.endsAt)) continue;
      let candidate = db.calendars.find((item) => item.ownerId === ownerId && item.deviceId === deviceId && item.externalId === input.externalId);
      if (!candidate) {
        candidate = {
          id: randomUUID(), ownerId, deviceId, externalId: input.externalId,
          title: "", startsAt: input.startsAt, endsAt: input.endsAt, timezone: "UTC",
          sourceCalendar: "Default", sourceDevice: device.name, status: "pending",
          createdAt: now, updatedAt: now
        };
        db.calendars.unshift(candidate);
      }
      if (candidate.status !== "imported") candidate.status = "pending";
      candidate.title = clean(input.title, 200) || "Untitled event";
      candidate.startsAt = input.startsAt;
      candidate.endsAt = input.endsAt;
      candidate.timezone = clean(input.timezone, 80) || "UTC";
      candidate.sourceCalendar = clean(input.sourceCalendar, 120) || "Default";
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

async function requireActiveOwnerDevice(ownerId: string, deviceId: string) {
  const device = await getPairingRepository().getDevice(deviceId);
  if (!device || device.ownerId !== ownerId) throw new Error("device_not_found");
  if (device.status !== "active") throw new Error(`device_${device.status}`);
  return device;
}

function clean(value: string | undefined, max: number) {
  return String(value || "").trim().slice(0, max);
}

function isIsoDate(value: string) {
  return Number.isFinite(new Date(value).getTime());
}

async function readDb(): Promise<CandidateDb> {
  const raw = await readJsonStore<Partial<CandidateDb>>(FILE_NAME, EMPTY_DB);
  return {
    contacts: Array.isArray(raw.contacts) ? raw.contacts : [],
    calendars: Array.isArray(raw.calendars) ? raw.calendars : []
  };
}

function withDb<T>(operation: (db: CandidateDb) => Promise<T> | T): Promise<T> {
  return withJsonStoreLock(FILE_NAME, async () => {
    const db = await readDb();
    const result = await operation(db);
    await writeJsonStore(FILE_NAME, db);
    return result;
  });
}
