import { randomUUID } from "node:crypto";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

export type FileRecord = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  source: "aichat" | "files" | "knowledge";
  textPreview: string;
  projectId: string | null;
  createdAt: string;
};

type FileDb = {
  files: FileRecord[];
};

const EMPTY_DB: FileDb = { files: [] };

export async function listFileRecords(projectId?: string | null) {
  const files = (await readDb()).files;
  if (projectId === undefined) return files;
  return files.filter((file) => file.projectId === projectId);
}

export async function saveFileRecord(input: {
  name: string;
  mimeType: string;
  size: number;
  source: FileRecord["source"];
  textPreview?: string;
  projectId: string | null;
}) {
  const file: FileRecord = {
    id: randomUUID(),
    name: input.name.trim() || "untitled",
    mimeType: input.mimeType || "application/octet-stream",
    size: input.size,
    source: input.source,
    textPreview: input.textPreview?.slice(0, 12000) || "",
    projectId: input.projectId,
    createdAt: new Date().toISOString()
  };
  const db = await readDb();
  db.files.unshift(file);
  await writeDb(db);
  return file;
}

async function readDb() {
  const db = await readJsonStore<FileDb>("files.json", EMPTY_DB);
  return { files: Array.isArray(db.files) ? db.files : [] };
}

function writeDb(db: FileDb) {
  return writeJsonStore("files.json", db);
}
