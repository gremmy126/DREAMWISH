import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

export type AuditLogEntry = {
  id: string;
  action: string;
  target: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

type AuditLogDb = {
  entries: AuditLogEntry[];
};

const EMPTY_DB: AuditLogDb = { entries: [] };

export function createAuditLogEntry(
  action: string,
  target: string,
  metadata: Record<string, unknown> = {}
): AuditLogEntry {
  return {
    id: `audit_${Date.now()}`,
    action,
    target,
    createdAt: new Date().toISOString(),
    metadata
  };
}

export async function recordAuditLogEntry(entry: AuditLogEntry) {
  const db = await readDb();
  db.entries.unshift(entry);
  await writeDb(db);
  return entry;
}

export async function listAuditLogEntries(role: "admin" | "user") {
  if (role !== "admin") {
    throw new Error("Audit Log는 관리자만 볼 수 있습니다.");
  }
  return (await readDb()).entries;
}

async function readDb() {
  const db = await readJsonStore<AuditLogDb>("audit-log.json", EMPTY_DB);
  return { entries: Array.isArray(db.entries) ? db.entries : [] };
}

function writeDb(db: AuditLogDb) {
  return writeJsonStore("audit-log.json", db);
}
