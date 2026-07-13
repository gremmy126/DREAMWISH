import { randomUUID } from "node:crypto";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";

export type FileCategory = "pdf" | "word" | "excel" | "image" | "other";

export type FileRecord = {
  ownerId: string;
  id: string;
  name: string;
  mimeType: string;
  size: number;
  source: "aichat" | "files" | "knowledge";
  textPreview: string;
  projectId: string | null;
  category: FileCategory;
  folderId: string | null;
  storageKey: string | null;
  sha256: string | null;
  createdAt: string;
};

export type PublicFileRecord = Omit<FileRecord, "ownerId" | "storageKey"> & { downloadable: boolean };

export type FileFolder = {
  ownerId: string;
  id: string;
  name: string;
  createdAt: string;
};

type StoredFileRecord = Partial<FileRecord> & Pick<FileRecord, "ownerId" | "id" | "name" | "mimeType" | "size" | "source" | "textPreview" | "projectId" | "createdAt">;
type FileDb = { files: StoredFileRecord[]; folders: FileFolder[] };
const EMPTY_DB: FileDb = { files: [], folders: [] };

export async function listFileRecords(ownerId: string, projectId?: string | null) {
  return (await readDb()).files.map(normalizeFile).filter(
    (file) => file.ownerId === ownerId && (projectId === undefined || file.projectId === projectId),
  );
}

export async function getFileRecord(ownerId: string, fileId: string) {
  return (await listFileRecords(ownerId)).find((file) => file.id === fileId) || null;
}

export async function saveFileRecord(input: {
  ownerId: string;
  id?: string;
  name: string;
  mimeType: string;
  size: number;
  source: FileRecord["source"];
  textPreview?: string;
  projectId: string | null;
  folderId?: string | null;
  storageKey?: string | null;
  sha256?: string | null;
}) {
  const id = input.id || randomUUID();
  const file: FileRecord = {
    ownerId: input.ownerId,
    id,
    name: sanitizeDisplayName(input.name),
    mimeType: input.mimeType || "application/octet-stream",
    size: Math.max(0, input.size),
    source: input.source,
    textPreview: input.textPreview?.slice(0, 12000) || "",
    projectId: input.projectId,
    category: classifyFileCategory(input.name, input.mimeType),
    folderId: input.folderId || null,
    storageKey: input.storageKey || null,
    sha256: input.sha256 || null,
    createdAt: new Date().toISOString(),
  };
  await withJsonStoreLock("files.json", async () => {
    const db = await readDb();
    if (file.folderId && !db.folders.some((folder) => folder.ownerId === input.ownerId && folder.id === file.folderId)) throw fileError("FOLDER_NOT_FOUND");
    db.files.unshift(file);
    await writeDb(db);
  });
  return file;
}

export async function removeFileRecord(ownerId: string, fileId: string) {
  let removed = false;
  await withJsonStoreLock("files.json", async () => {
    const db = await readDb();
    const before = db.files.length;
    db.files = db.files.filter((file) => !(file.ownerId === ownerId && file.id === fileId));
    removed = before !== db.files.length;
    await writeDb(db);
  });
  return removed;
}

export async function listFolders(ownerId: string) {
  return (await readDb()).folders.filter((folder) => folder.ownerId === ownerId);
}

export async function createFolder(ownerId: string, rawName: string) {
  const name = rawName.trim().replace(/\s+/gu, " ").slice(0, 80);
  if (!name) throw fileError("FOLDER_NAME_REQUIRED");
  let folder!: FileFolder;
  await withJsonStoreLock("files.json", async () => {
    const db = await readDb();
    if (db.folders.some((item) => item.ownerId === ownerId && item.name.toLocaleLowerCase("ko-KR") === name.toLocaleLowerCase("ko-KR"))) throw fileError("FOLDER_EXISTS");
    folder = { ownerId, id: randomUUID(), name, createdAt: new Date().toISOString() };
    db.folders.unshift(folder);
    await writeDb(db);
  });
  return folder;
}

export async function moveFileToFolder(ownerId: string, fileId: string, folderId: string | null) {
  let moved: FileRecord | null = null;
  await withJsonStoreLock("files.json", async () => {
    const db = await readDb();
    const index = db.files.findIndex((file) => file.ownerId === ownerId && file.id === fileId);
    if (index < 0) throw fileError("FILE_NOT_FOUND");
    if (folderId && !db.folders.some((folder) => folder.ownerId === ownerId && folder.id === folderId)) throw fileError("FOLDER_NOT_FOUND");
    const normalized = normalizeFile(db.files[index]!);
    moved = { ...normalized, folderId };
    db.files[index] = moved;
    await writeDb(db);
  });
  return moved!;
}

export function toPublicFileRecord(file: FileRecord): PublicFileRecord {
  const { ownerId: _ownerId, storageKey, ...safe } = file;
  return { ...safe, downloadable: Boolean(storageKey) };
}

export function classifyFileCategory(name: string, mimeType = ""): FileCategory {
  const lower = name.toLowerCase();
  const mime = mimeType.toLowerCase();
  if (mime === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (/\.(doc|docx|odt|rtf)$/u.test(lower) || /wordprocessingml|msword|opendocument\.text/u.test(mime)) return "word";
  if (/\.(xls|xlsx|xlsm|csv|ods)$/u.test(lower) || /spreadsheetml|ms-excel|text\/csv|opendocument\.spreadsheet/u.test(mime)) return "excel";
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|heic|bmp|tiff?)$/u.test(lower)) return "image";
  return "other";
}

export function isBlockedFileName(name: string) {
  return /\.(exe|dll|bat|cmd|com|msi|scr|ps1|vbs|jar|sh)$/iu.test(name.trim());
}

function normalizeFile(file: StoredFileRecord): FileRecord {
  return {
    ownerId: file.ownerId,
    id: file.id,
    name: sanitizeDisplayName(file.name),
    mimeType: file.mimeType || "application/octet-stream",
    size: Number.isFinite(file.size) ? Math.max(0, file.size) : 0,
    source: file.source || "files",
    textPreview: file.textPreview || "",
    projectId: file.projectId || null,
    category: file.category || classifyFileCategory(file.name, file.mimeType),
    folderId: file.folderId || null,
    storageKey: file.storageKey || null,
    sha256: file.sha256 || null,
    createdAt: file.createdAt,
  };
}

function sanitizeDisplayName(value: string) {
  return value.trim().replace(/[\\/\0\r\n]/gu, "_").slice(0, 240) || "untitled";
}

function fileError(code: string) { return new Error(code); }

async function readDb() {
  const db = await readJsonStore<FileDb>("files.json", EMPTY_DB);
  return {
    files: Array.isArray(db.files) ? db.files : [],
    folders: Array.isArray(db.folders) ? db.folders : [],
  };
}

function writeDb(db: FileDb) { return writeJsonStore("files.json", db); }
