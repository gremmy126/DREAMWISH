import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getDataDirectory } from "../local-db/json-store";

export async function storeOwnerFile(input: { ownerId: string; fileId: string; bytes: Buffer }) {
  assertFileId(input.fileId);
  const ownerHash = hashOwner(input.ownerId);
  const directory = path.join(getDataDirectory(), "files", ownerHash);
  const destination = path.join(directory, input.fileId);
  const temporary = path.join(directory, `.${input.fileId}.${randomBytes(8).toString("hex")}.tmp`);
  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.writeFile(temporary, input.bytes, { flag: "wx" });
    await fs.rename(temporary, destination);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
  return {
    storageKey: `${ownerHash}/${input.fileId}`,
    sha256: createHash("sha256").update(input.bytes).digest("hex"),
  };
}

export async function readOwnerFile(ownerId: string, storageKey: string) {
  const location = resolveOwnerPath(ownerId, storageKey);
  try { return await fs.readFile(location); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("FILE_NOT_FOUND");
    throw error;
  }
}

export async function deleteOwnerFile(ownerId: string, storageKey: string) {
  const location = resolveOwnerPath(ownerId, storageKey);
  await fs.rm(location, { force: true });
}

function resolveOwnerPath(ownerId: string, storageKey: string) {
  const parts = storageKey.split("/");
  const ownerHash = hashOwner(ownerId);
  if (parts.length !== 2 || parts[0] !== ownerHash) throw new Error("FILE_NOT_FOUND");
  assertFileId(parts[1]!);
  return path.join(getDataDirectory(), "files", ownerHash, parts[1]!);
}

function assertFileId(fileId: string) {
  if (!/^[a-zA-Z0-9-]{1,128}$/u.test(fileId)) throw new Error("INVALID_FILE_ID");
}

function hashOwner(ownerId: string) { return createHash("sha256").update(ownerId).digest("hex").slice(0, 32); }
