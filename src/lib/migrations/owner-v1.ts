import fs from "node:fs/promises";
import path from "node:path";
import type { OwnerContext } from "../auth/owner-context";
import {
  getDataDirectory,
  withJsonStorePathLock
} from "../local-db/json-store";

const OWNER_V1_FILES = [
  "chat.json",
  "memory.json",
  "projects.json",
  "knowledge.json",
  "files.json"
] as const;

type OwnerV1FileName = (typeof OWNER_V1_FILES)[number];
type OwnerField = "ownerId" | "owner_id";

export const OWNER_V1_QUARANTINE_ENVELOPE_TYPE = "owner-v1/quarantined-memory";
export const OWNER_V1_QUARANTINE_ENVELOPE_VERSION = 1;

type OwnerV1Marker = {
  migration: "owner-v1";
  ownerId: string;
  completedAt: string;
  files: string[];
};

const OWNER_ARRAYS_BY_FILE: Record<OwnerV1FileName, Array<[string, OwnerField]>> = {
  "chat.json": [
    ["chat_sessions", "owner_id"],
    ["chat_messages", "owner_id"]
  ],
  "memory.json": [
    ["candidates", "ownerId"],
    ["memories", "ownerId"],
    ["quarantinedMemories", "ownerId"],
    ["embeddings", "ownerId"],
    ["changes", "ownerId"],
    ["captureJobs", "ownerId"]
  ],
  "projects.json": [
    ["projects", "ownerId"],
    ["sessionLinks", "ownerId"]
  ],
  "knowledge.json": [["notes", "ownerId"]],
  "files.json": [["files", "ownerId"]]
};

const migrationLocks = new Map<string, Promise<void>>();

export type OwnerV1Result = {
  migration: "owner-v1";
  ownerId: string;
  migrated: boolean;
  files: string[];
};

export class OwnerMigrationError extends Error {
  readonly code = "MIGRATION_FAILED" as const;

  constructor(message = "MIGRATION_FAILED") {
    super(message);
    this.name = "OwnerMigrationError";
  }
}

export async function runOwnerV1Migration(owner: OwnerContext): Promise<OwnerV1Result> {
  if (owner.role !== "admin" || !owner.uid.trim()) {
    throw new OwnerMigrationError("MIGRATION_FAILED");
  }

  const dataDir = path.resolve(getDataDirectory());
  return withMigrationLock(dataDir, () => runOwnerV1MigrationLocked(dataDir, owner));
}

async function runOwnerV1MigrationLocked(
  dataDir: string,
  owner: OwnerContext
): Promise<OwnerV1Result> {
  return withJsonStorePathLock(path.join(dataDir, "memory.json"), () =>
    runOwnerV1MigrationWithStoreLock(dataDir, owner)
  );
}

async function runOwnerV1MigrationWithStoreLock(
  dataDir: string,
  owner: OwnerContext
): Promise<OwnerV1Result> {
  const markerPath = path.join(dataDir, ".migrations", "owner-v1.json");
  const markerRaw = await readOptionalBytes(markerPath);
  if (markerRaw !== null) {
    const marker = parseMarker(markerRaw);
    if (marker.ownerId !== owner.uid) {
      throw new OwnerMigrationError("owner-v1 belongs to a different uid");
    }
    return {
      migration: "owner-v1",
      ownerId: owner.uid,
      migrated: false,
      files: [...marker.files]
    };
  }

  const existing: Array<{
    name: OwnerV1FileName;
    path: string;
    raw: Buffer;
  }> = [];
  for (const name of OWNER_V1_FILES) {
    const filePath = path.join(dataDir, name);
    const raw = await readOptionalBytes(filePath);
    if (raw !== null) existing.push({ name, path: filePath, raw });
  }

  const backupDir = path.join(
    dataDir,
    ".migration-backups",
    "owner-v1",
    new Date().toISOString().replace(/[:.]/gu, "-")
  );
  await fs.mkdir(backupDir, { recursive: true });
  for (const file of existing) {
    await fs.writeFile(path.join(backupDir, file.name), file.raw);
  }

  const parsedFiles = existing.map((file) => ({
    ...file,
    value: parseStore(file.name, file.raw)
  }));
  for (const file of parsedFiles) {
    await writeJsonAtomic(file.path, assignOwner(file.name, file.value, owner.uid));
  }
  const migratedFiles = parsedFiles.map((file) => file.name);
  await writeJsonAtomic(markerPath, {
    migration: "owner-v1",
    ownerId: owner.uid,
    completedAt: new Date().toISOString(),
    files: migratedFiles
  });

  return {
    migration: "owner-v1",
    ownerId: owner.uid,
    migrated: true,
    files: migratedFiles
  };
}

function assignOwner(
  fileName: OwnerV1FileName,
  value: Record<string, unknown>,
  ownerId: string
) {
  const own = (record: unknown, key: OwnerField) => {
    if (!record || typeof record !== "object") return record;
    const current = record as Record<string, unknown>;
    return { ...current, [key]: current[key] || ownerId };
  };
  const next = { ...value };
  for (const [key, ownerKey] of OWNER_ARRAYS_BY_FILE[fileName]) {
    next[key] = Array.isArray(value[key])
      ? (value[key] as unknown[]).map((item) =>
          fileName === "memory.json" && key === "quarantinedMemories"
            ? ownQuarantinedMemory(item, ownerId)
            : own(item, ownerKey)
        )
      : [];
  }
  return next;
}

function ownQuarantinedMemory(value: unknown, ownerId: string) {
  if (isRecord(value)) {
    return { ...value, ownerId: value.ownerId || ownerId };
  }
  return {
    envelopeType: OWNER_V1_QUARANTINE_ENVELOPE_TYPE,
    envelopeVersion: OWNER_V1_QUARANTINE_ENVELOPE_VERSION,
    ownerId,
    raw: value
  };
}

function parseMarker(raw: Buffer): OwnerV1Marker {
  const value = parseJson(raw, "owner-v1 marker is invalid");
  if (!isRecord(value)) throw new OwnerMigrationError("owner-v1 marker is invalid");
  if (
    value.migration !== "owner-v1" ||
    typeof value.ownerId !== "string" ||
    !value.ownerId.trim() ||
    typeof value.completedAt !== "string" ||
    !value.completedAt.trim() ||
    Number.isNaN(Date.parse(value.completedAt)) ||
    !Array.isArray(value.files) ||
    !value.files.every((file) => typeof file === "string")
  ) {
    throw new OwnerMigrationError("owner-v1 marker is invalid");
  }
  return value as OwnerV1Marker;
}

function parseStore(fileName: OwnerV1FileName, raw: Buffer): Record<string, unknown> {
  const value = parseJson(raw, `${fileName} is invalid`);
  if (!isRecord(value)) throw new OwnerMigrationError(`${fileName} is invalid`);
  for (const [key] of OWNER_ARRAYS_BY_FILE[fileName]) {
    if (value[key] !== undefined && !Array.isArray(value[key])) {
      throw new OwnerMigrationError(`${fileName} is invalid`);
    }
  }
  return value;
}

function parseJson(raw: Buffer, errorMessage: string): unknown {
  try {
    return JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    throw new OwnerMigrationError(errorMessage);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readOptionalBytes(filePath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function withMigrationLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = migrationLocks.get(key) || Promise.resolve();
  let release = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  migrationLocks.set(key, current);
  await previous;
  try {
    return await run();
  } finally {
    release();
    if (migrationLocks.get(key) === current) migrationLocks.delete(key);
  }
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}
