import { randomUUID } from "node:crypto";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

export type FileRecord = {
  ownerId: string;
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

export async function listFileRecords(ownerId: string, projectId?: string | null) {
  return (await readDb()).files.filter(
    (file) =>
      file.ownerId === ownerId &&
      (projectId === undefined || file.projectId === projectId)
  );
}

export async function saveFileRecord(input: {
  ownerId: string;
  name: string;
  mimeType: string;
  size: number;
  source: FileRecord["source"];
  textPreview?: string;
  projectId: string | null;
}) {
  const file: FileRecord = {
    ownerId: input.ownerId,
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
