import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { classifyFileCategory, createFolder, getFileRecord, listFolders, moveFileToFolder, saveFileRecord } from "../src/lib/files/file.repository";
import { deleteOwnerFile, readOwnerFile, storeOwnerFile } from "../src/lib/files/file-storage";

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

async function withTempData(run: () => Promise<void>) {
  const previous = process.env.DATA_DIR;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dreamwish-files-"));
  process.env.DATA_DIR = directory;
  try { await run(); } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await fs.rm(directory, { recursive: true, force: true });
  }
}
