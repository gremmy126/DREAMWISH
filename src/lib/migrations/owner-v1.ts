import fs from "node:fs/promises";
import path from "node:path";
import type { OwnerContext } from "../auth/owner-context";
import { getDataDirectory } from "../local-db/json-store";

const OWNER_V1_FILES = [
  "chat.json",
  "memory.json",
  "projects.json",
  "knowledge.json",
  "files.json"
] as const;

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
  if (owner.role !== "admin") throw new OwnerMigrationError("MIGRATION_FAILED");

  const dataDir = getDataDirectory();
  const markerPath = path.join(dataDir, ".migrations", "owner-v1.json");
  const marker = await readOptionalJson<{ ownerId?: string; files?: string[] }>(markerPath);
  if (marker?.ownerId === owner.uid) {
    return {
      migration: "owner-v1",
      ownerId: owner.uid,
      migrated: false,
      files: Array.isArray(marker.files) ? marker.files : []
    };
  }
  if (marker) throw new OwnerMigrationError("owner-v1 belongs to a different uid");

  const existing: Array<{
    name: (typeof OWNER_V1_FILES)[number];
    path: string;
    value: Record<string, unknown>;
  }> = [];
  for (const name of OWNER_V1_FILES) {
    const filePath = path.join(dataDir, name);
    const value = await readOptionalJson<Record<string, unknown>>(filePath);
    if (value) existing.push({ name, path: filePath, value });
  }

  const backupDir = path.join(
    dataDir,
    ".migration-backups",
    "owner-v1",
    new Date().toISOString().replace(/[:.]/gu, "-")
  );
  await fs.mkdir(backupDir, { recursive: true });
  for (const file of existing) {
    await fs.copyFile(file.path, path.join(backupDir, file.name));
  }

  for (const file of existing) {
    await writeJsonAtomic(file.path, assignOwner(file.name, file.value, owner.uid));
  }
  const migratedFiles = existing.map((file) => file.name);
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
  fileName: (typeof OWNER_V1_FILES)[number],
  value: Record<string, unknown>,
  ownerId: string
) {
  const own = (record: unknown, key: "ownerId" | "owner_id") => {
    if (!record || typeof record !== "object") return record;
    const current = record as Record<string, unknown>;
    return { ...current, [key]: current[key] || ownerId };
  };
  const arraysByFile: Record<
    (typeof OWNER_V1_FILES)[number],
    Array<[string, "ownerId" | "owner_id"]>
  > = {
    "chat.json": [
      ["chat_sessions", "owner_id"],
      ["chat_messages", "owner_id"]
    ],
    "memory.json": [
      ["candidates", "ownerId"],
      ["memories", "ownerId"],
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
  const next = { ...value };
  for (const [key, ownerKey] of arraysByFile[fileName]) {
    next[key] = Array.isArray(value[key])
      ? (value[key] as unknown[]).map((item) => own(item, ownerKey))
      : [];
  }
  return next;
}

async function readOptionalJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}
