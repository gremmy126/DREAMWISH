import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { classifyFileCategory, createFolder, getFileRecord, listFolders, moveFileToFolder, saveFileRecord } from "../src/lib/files/file.repository";
import { createOwnerStorageKey, deleteOwnerFile, readOwnerFile, storeOwnerFile } from "../src/lib/files/file-storage";

test("file categories distinguish PDF Word Excel images and other files", () => {
  assert.equal(classifyFileCategory("report.pdf", "application/pdf"), "pdf");
  assert.equal(classifyFileCategory("proposal.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "word");
  assert.equal(classifyFileCategory("budget.xlsx", "application/octet-stream"), "excel");
  assert.equal(classifyFileCategory("photo.png", "image/png"), "image");
  assert.equal(classifyFileCategory("notes.txt", "text/plain"), "other");
});

test("file bytes round trip only for the owning account", async () => {
  await withTempData(async () => {
    const stored = await storeOwnerFile({ ownerId: "owner-a", fileId: "file-1", bytes: Buffer.from("hello") });
    assert.equal((await readOwnerFile("owner-a", stored.storageKey)).toString(), "hello");
    await assert.rejects(() => readOwnerFile("owner-b", stored.storageKey), /FILE_NOT_FOUND/u);
    await deleteOwnerFile("owner-a", stored.storageKey);
    await assert.rejects(() => readOwnerFile("owner-a", stored.storageKey), /FILE_NOT_FOUND/u);
  });
});

test("local storage reads and deletes legacy owner keys", async () => {
  await withTempData(async (dataDir) => {
    const ownerHash = createHash("sha256")
      .update("owner-a")
      .digest("hex")
      .slice(0, 32);
    const directory = path.join(dataDir, "files", ownerHash);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, "legacy-file"), "legacy", "utf8");
    const legacyKey = `${ownerHash}/legacy-file`;

    assert.equal((await readOwnerFile("owner-a", legacyKey)).toString(), "legacy");
    await deleteOwnerFile("owner-a", legacyKey);
    await assert.rejects(
      () => readOwnerFile("owner-a", legacyKey),
      /FILE_NOT_FOUND/u
    );
  });
});

test("production storage fails closed when Railway Bucket configuration is missing", async () => {
  const { readBucketStorageConfig } = await import(
    "../src/lib/files/railway-bucket-storage"
  );
  assert.throws(() => readBucketStorageConfig({}), /STORAGE_BACKEND_UNAVAILABLE/u);
});

test("bucket object keys contain only owner hash and file id", () => {
  const key = createOwnerStorageKey("owner@example.com", "file-1");
  assert.match(key, /^owners\/[a-f0-9]{32}\/files\/file-1$/u);
  assert.doesNotMatch(key, /owner@example\.com/u);
});

test("ambiguous bucket writes are cleaned up with the deterministic key", async () => {
  const { withStoredOwnerFile } = await import(
    "../src/lib/files/file-upload-transaction"
  );
  let objectExists = false;
  let deletedKey = "";

  await assert.rejects(
    () =>
      withStoredOwnerFile(
        {
          ownerId: "owner-a",
          fileId: "ambiguous-file",
          bytes: Buffer.from("bytes")
        },
        async () => "saved",
        {
          storeOwnerFile: async () => {
            objectExists = true;
            throw new Error("lost_acknowledgement");
          },
          deleteOwnerFile: async (_ownerId, storageKey) => {
            deletedKey = storageKey;
            objectExists = false;
          },
          removeFileRecord: async () => false
        }
      ),
    /lost_acknowledgement/u
  );
  assert.equal(objectExists, false);
  assert.equal(
    deletedKey,
    createOwnerStorageKey("owner-a", "ambiguous-file")
  );
});

test("folders and file moves remain owner scoped and folder names are unique", async () => {
  await withTempData(async () => {
    const folder = await createFolder("owner-a", "계약서");
    await assert.rejects(() => createFolder("owner-a", " 계약서 "), /FOLDER_EXISTS/u);
    assert.equal((await listFolders("owner-b")).length, 0);
    const record = await saveFileRecord({ ownerId: "owner-a", id: "record-1", name: "contract.pdf", mimeType: "application/pdf", size: 5, source: "files", projectId: null, storageKey: "owner/file", sha256: "hash" });
    await assert.rejects(() => moveFileToFolder("owner-b", record.id, folder.id), /FILE_NOT_FOUND/u);
    const moved = await moveFileToFolder("owner-a", record.id, folder.id);
    assert.equal(moved.folderId, folder.id);
    assert.equal((await getFileRecord("owner-a", record.id))?.category, "pdf");
  });
});

test("file routes use multipart bytes, 25 MiB limits, safe downloads, and owner context", () => {
  const upload = require("node:fs").readFileSync("app/api/files/route.ts", "utf8") as string;
  const download = require("node:fs").readFileSync("app/api/files/[fileId]/download/route.ts", "utf8") as string;
  assert.match(upload, /formData\(\)/u);
  assert.match(upload, /25 \* 1024 \* 1024/u);
  assert.match(download, /requireOwnerContext/u);
  assert.match(download, /Content-Disposition/u);
  assert.match(download, /filename\*=UTF-8''/u);
});

test("file upload checks owner quota before storing bytes", async () => {
  const source = await fs.readFile("app/api/files/route.ts", "utf8");
  assert.match(source, /withAccountStorageCapacity/u);
  assert.match(source, /withAccountStorageCapacity[\s\S]*withStoredOwnerFile/u);
  assert.match(source, /STORAGE_QUOTA_EXCEEDED/u);
  assert.match(source, /status:\s*413/u);
});

test("file delete removes the owner object and metadata", async () => {
  const source = await fs.readFile("app/api/files/[fileId]/route.ts", "utf8");
  assert.match(source, /export async function DELETE/u);
  assert.match(source, /requireOwnerContext/u);
  assert.match(source, /prepareFileDeletion/u);
  assert.match(source, /deleteOwnerFile/u);
  assert.match(source, /completeFileDeletion/u);
});

test("file deletion keeps metadata until object cleanup can complete", async () => {
  await withTempData(async () => {
    const {
      completeFileDeletion,
      getFileRecord,
      prepareFileDeletion,
      saveFileRecord
    } = await import("../src/lib/files/file.repository");
    const file = await saveFileRecord({
      ownerId: "owner-a",
      id: "delete-file",
      name: "delete.txt",
      mimeType: "text/plain",
      size: 6,
      source: "files",
      projectId: null,
      storageKey: createOwnerStorageKey("owner-a", "delete-file")
    });

    const pending = await prepareFileDeletion("owner-a", file.id);
    assert.equal(pending.id, file.id);
    assert.equal((await getFileRecord("owner-a", file.id))?.id, file.id);
    await completeFileDeletion("owner-a", file.id);
    assert.equal(await getFileRecord("owner-a", file.id), null);
  });
});

test("download storage errors distinguish missing files from outages", async () => {
  const { classifyFileStorageError } = await import(
    "../src/lib/files/file-storage-error"
  );
  assert.equal(classifyFileStorageError(new Error("FILE_NOT_FOUND")).status, 410);
  assert.equal(
    classifyFileStorageError(new Error("STORAGE_BACKEND_UNAVAILABLE")).status,
    503
  );
  assert.equal(classifyFileStorageError(new Error("socket timeout")).status, 502);

  const source = await fs.readFile(
    "app/api/files/[fileId]/download/route.ts",
    "utf8"
  );
  assert.match(source, /classifyFileStorageError/u);
});

async function withTempData(run: (dataDir: string) => Promise<void>) {
  const previous = process.env.DATA_DIR;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dreamwish-files-"));
  process.env.DATA_DIR = directory;
  try { await run(directory); } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await fs.rm(directory, { recursive: true, force: true });
  }
}
