import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { saveFileRecord } from "../src/lib/files/file.repository";

test("account storage includes only the authenticated owner's records and new owners start at zero", async () => {
  await withTempDataDir(async () => {
    const { calculateAccountStorageUsage } = await import(
      "../src/lib/storage/account-storage"
    );
    await saveFileRecord({
      ownerId: "owner-a",
      name: "proposal.pdf",
      mimeType: "application/pdf",
      size: 4096,
      source: "files",
      projectId: null,
      storageKey: "owner-a/proposal.pdf"
    });

    const ownerA = await calculateAccountStorageUsage("owner-a");
    const ownerB = await calculateAccountStorageUsage("owner-b");

    assert.equal(ownerA.breakdown.files, 4096);
    assert.ok(ownerA.usageBytes >= 4096);
    assert.equal(ownerB.usageBytes, 0);
    assert.deepEqual(ownerB.breakdown, {
      files: 0,
      memories: 0,
      knowledge: 0,
      chat: 0,
      business: 0,
      automation: 0
    });
    assert.equal(ownerA.quotaBytes, null);
  });
});

test("storage usage API derives ownership from the signed session", async () => {
  const source = await fs.readFile("app/api/storage/usage/route.ts", "utf8");
  assert.match(source, /requireOwnerContext\(request\)/u);
  assert.match(source, /calculateAccountStorageUsage\(owner\.uid\)/u);
  assert.doesNotMatch(source, /searchParams|ownerId\s*:/u);
});

test("storage UI reads account usage instead of browser-wide origin storage", async () => {
  const source = await fs.readFile("components/Common/StorageStatus.tsx", "utf8");
  assert.match(source, /fetch\("\/api\/storage\/usage"/u);
  assert.doesNotMatch(source, /localStorage|navigator\.storage|measureLocalStorage/u);
  assert.match(source, /storage\.measuredAt/u);
});

async function withTempDataDir(run: () => Promise<void>) {
  const previousDataDir = process.env.DATA_DIR;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dreamwish-storage-"));
  process.env.DATA_DIR = dataDir;
  delete process.env.DATABASE_URL;
  try {
    await run();
  } finally {
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}
