import { createHash } from "node:crypto";
import { createLocalFileStorage } from "./local-file-storage";
import { createRailwayBucketStorage } from "./railway-bucket-storage";

export async function storeOwnerFile(input: {
  ownerId: string;
  fileId: string;
  bytes: Buffer;
  contentType?: string;
}) {
  const storageKey = createOwnerStorageKey(input.ownerId, input.fileId);
  await getFileStorageBackend().put(
    storageKey,
    input.bytes,
    input.contentType
  );
  return {
    storageKey,
    sha256: createHash("sha256").update(input.bytes).digest("hex")
  };
}

export async function readOwnerFile(ownerId: string, storageKey: string) {
  assertOwnerStorageKey(ownerId, storageKey);
  return getFileStorageBackend().get(storageKey);
}

export async function deleteOwnerFile(ownerId: string, storageKey: string) {
  assertOwnerStorageKey(ownerId, storageKey);
  await getFileStorageBackend().delete(storageKey);
}

export function getFileStorageBackend() {
  return process.env.NODE_ENV === "production"
    ? createRailwayBucketStorage(process.env)
    : createLocalFileStorage();
}

export function createOwnerStorageKey(ownerId: string, fileId: string) {
  assertFileId(fileId);
  return `owners/${hashOwner(ownerId)}/files/${fileId}`;
}

function assertOwnerStorageKey(ownerId: string, storageKey: string) {
  const parts = storageKey.split("/");
  if (
    parts.length !== 4 ||
    parts[0] !== "owners" ||
    parts[1] !== hashOwner(ownerId) ||
    parts[2] !== "files"
  ) {
    throw new Error("FILE_NOT_FOUND");
  }
  assertFileId(parts[3] || "");
}

function assertFileId(fileId: string) {
  if (!/^[a-zA-Z0-9-]{1,128}$/u.test(fileId)) {
    throw new Error("INVALID_FILE_ID");
  }
}

function hashOwner(ownerId: string) {
  return createHash("sha256").update(ownerId).digest("hex").slice(0, 32);
}
